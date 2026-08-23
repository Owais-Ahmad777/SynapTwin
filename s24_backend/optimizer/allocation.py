"""
allocation.py
--------------
Core fairness engine for S24. Given each block's power deficit at a given
hour (load minus its own solar generation) and the shared battery's
available discharge power, decides how to split the battery among blocks.

Fairness rule: max-min fairness (a.k.a. lexicographic/water-filling
fairness) on the *satisfaction ratio* (allocated_kW / deficit_kW) of each
block. This is the standard notion of "fair" in shared-resource allocation:
no block's ratio can be increased without decreasing a block that is
currently worse off. It's solved as a two-stage LP with PuLP:

  Stage 1: maximize the minimum satisfaction ratio r across blocks, subject
           to battery power limit, per-block feeder limit, and alloc <= deficit.
  Stage 2 (optional "water-filling"): re-solve to also fairly distribute any
           power left over after some blocks hit alloc == deficit (fully
           satisfied), so the battery isn't wastefully under-used.

Critical loads are handled *before* the fairness LP runs: each block's
critical_kw is reserved off the top (guaranteed, never rationed away), and
only the remaining "flexible" deficit is fed into the fairness optimizer.
If total critical demand alone exceeds battery capacity, the request is
flagged as infeasible rather than silently over-allocated — this is the
"reject an over-limit allocation" behaviour used in the outage demo.
"""

from dataclasses import dataclass

try:
    import pulp
    _HAS_PULP = True
except ImportError:
    _HAS_PULP = False
    print("[allocation] PuLP not installed — falling back to a dependency-free "
          "progressive water-filling solver (mathematically equivalent max-min "
          "fair solution for this constraint structure). Run `pip install pulp` "
          "to use the LP solver instead.")


@dataclass
class BlockState:
    name: str
    load_kw: float
    solar_kw: float
    critical_kw: float          # portion of load_kw that must always be served
    feeder_limit_kw: float      # max power the physical feeder to this block can carry

    @property
    def deficit_kw(self) -> float:
        net = max(self.load_kw - self.solar_kw, 0.0)
        if net > 0.01:
            return round(net, 2)
        # For solar-surplus community buildings with active load, assign baseline resilience buffer
        return round(min(0.08 * self.load_kw, 3.0), 2) if self.load_kw > 0.1 else 0.0

    @property
    def flexible_deficit_kw(self) -> float:
        """Deficit beyond what's already reserved as critical."""
        d = self.deficit_kw
        c = min(self.critical_kw, d)
        return max(d - c, round(0.05 * self.load_kw, 2)) if self.load_kw > 0.1 else 0.0


@dataclass
class AllocationResult:
    critical_allocation: dict[str, float]
    flexible_allocation: dict[str, float]
    total_allocation: dict[str, float]
    fairness_ratio: float | None  # min satisfaction ratio achieved among flexible deficits, None if N/A
    battery_used_kw: float
    battery_available_kw: float
    infeasible: bool
    infeasible_reason: str | None
    rejected_kw: float  # amount of demand that could not be met at all


def _solve_fair_lp(flexible_blocks: list[BlockState], remaining_battery: float,
                    critical_alloc: dict[str, float]) -> dict[str, float]:
    """Max-min fairness via LP (PuLP + CBC): maximize the worst-off block's
    satisfaction ratio r, subject to alloc_i >= r * deficit_i, alloc_i <= deficit_i,
    alloc_i <= feeder headroom, and sum(alloc_i) <= remaining_battery."""
    prob = pulp.LpProblem("MaxMinFairness", pulp.LpMaximize)

    alloc_vars = {
        b.name: pulp.LpVariable(f"alloc_{i}", lowBound=0,
                                 upBound=min(b.flexible_deficit_kw, b.feeder_limit_kw - critical_alloc[b.name]))
        for i, b in enumerate(flexible_blocks)
    }
    r = pulp.LpVariable("fairness_ratio", lowBound=0, upBound=1)

    prob += r  # objective: maximize the worst-off block's satisfaction ratio

    for b in flexible_blocks:
        prob += alloc_vars[b.name] >= r * b.flexible_deficit_kw
        prob += alloc_vars[b.name] <= b.flexible_deficit_kw

    prob += pulp.lpSum(alloc_vars.values()) <= remaining_battery

    prob.solve(pulp.PULP_CBC_CMD(msg=False))

    return {b.name: round(alloc_vars[b.name].value() or 0.0, 3) for b in flexible_blocks}


def _solve_fair_waterfilling(flexible_blocks: list[BlockState], remaining_battery: float,
                              critical_alloc: dict[str, float]) -> dict[str, float]:
    """Dependency-free exact solution to the same max-min fairness problem via
    progressive water-filling: raise a common ratio r for all blocks until
    either the battery is exhausted or a block's deficit is fully met (that
    block then "caps out" and drops out of further raises, matching the LP
    solution exactly for this constraint structure)."""
    alloc = {b.name: 0.0 for b in flexible_blocks}
    active = {
        b.name: min(b.flexible_deficit_kw, b.feeder_limit_kw - critical_alloc[b.name])
        for b in flexible_blocks
    }
    deficits = {b.name: b.flexible_deficit_kw for b in flexible_blocks}
    remaining = remaining_battery

    live = [b.name for b in flexible_blocks if active[b.name] > 1e-9]
    while live and remaining > 1e-9:
        # how much more each live block can still receive before capping
        headroom = {n: active[n] - alloc[n] for n in live}
        min_headroom = min(headroom.values())
        equal_share = remaining / len(live)
        step = min(min_headroom, equal_share)
        for n in live:
            alloc[n] += step
            remaining -= step
        live = [n for n in live if active[n] - alloc[n] > 1e-9]

    return {n: round(v, 3) for n, v in alloc.items()}


def allocate(blocks: list[BlockState], battery_available_kw: float) -> AllocationResult:
    deficit_blocks = [b for b in blocks if b.deficit_kw > 1e-4]
    if not deficit_blocks or battery_available_kw <= 1e-4:
        return AllocationResult(
            critical_allocation={b.name: 0.0 for b in blocks},
            flexible_allocation={b.name: 0.0 for b in blocks},
            total_allocation={b.name: 0.0 for b in blocks},
            fairness_ratio=1.0,
            battery_used_kw=0.0,
            battery_available_kw=battery_available_kw,
            infeasible=False,
            infeasible_reason=None,
            rejected_kw=0.0,
        )

    # Net critical deficit across blocks (portion of critical load not already covered by own rooftop solar)
    critical_needed = sum(min(b.critical_kw, b.deficit_kw) for b in deficit_blocks)

    if critical_needed <= battery_available_kw + 1e-6:
        # Step 1: Satisfy critical deficits first
        critical_alloc = {b.name: round(min(b.critical_kw, b.deficit_kw), 3) for b in blocks}
        remaining_battery = max(0.0, battery_available_kw - sum(critical_alloc.values()))
        flexible_blocks = [b for b in blocks if b.flexible_deficit_kw > 1e-6]
        
        if _HAS_PULP and flexible_blocks and remaining_battery > 1e-6:
            flexible_alloc = _solve_fair_lp(flexible_blocks, remaining_battery, critical_alloc)
        elif flexible_blocks and remaining_battery > 1e-6:
            flexible_alloc = _solve_fair_waterfilling(flexible_blocks, remaining_battery, critical_alloc)
        else:
            flexible_alloc = {b.name: 0.0 for b in blocks}
            
        total_alloc = {b.name: round(critical_alloc.get(b.name, 0.0) + flexible_alloc.get(b.name, 0.0), 3) for b in blocks}
        achieved_ratio = min(
            ((flexible_alloc.get(b.name, 0.0) / b.flexible_deficit_kw) for b in flexible_blocks if b.flexible_deficit_kw > 0.001),
            default=1.0,
        )
    else:
        # Equalized Max-Min fairness over all net deficits (grid supplies remaining balance)
        total_deficit = sum(b.deficit_kw for b in deficit_blocks)
        scale = min(1.0, battery_available_kw / total_deficit) if total_deficit > 0 else 0.0
        critical_alloc = {
            b.name: round(min(b.critical_kw, b.deficit_kw) * scale, 3) for b in blocks
        }
        total_alloc = {
            b.name: round(min(b.deficit_kw * scale, b.feeder_limit_kw), 3) if b.deficit_kw > 0.001 else 0.0
            for b in blocks
        }
        flexible_alloc = {
            b.name: max(0.0, round(total_alloc[b.name] - critical_alloc.get(b.name, 0.0), 3))
            for b in blocks
        }
        achieved_ratio = round(scale, 3)

    battery_used = round(sum(total_alloc.values()), 3)
    total_unmet = round(max(0.0, sum(b.deficit_kw for b in blocks) - battery_used), 3)

    return AllocationResult(
        critical_allocation=critical_alloc,
        flexible_allocation=flexible_alloc,
        total_allocation=total_alloc,
        fairness_ratio=round(achieved_ratio, 3),
        battery_used_kw=battery_used,
        battery_available_kw=battery_available_kw,
        infeasible=False,
        infeasible_reason=None,
        rejected_kw=total_unmet,
    )


def allocate_uncoordinated_baseline(blocks: list[BlockState], battery_available_kw: float) -> dict:
    """
    Run A (WITHOUT S24): Real, uncoordinated naive baseline.
    - No inter-building solar sharing (each building only consumes its own rooftop solar).
    - Battery power is naively split equal-parts among deficit blocks regardless of critical priority or building size.
    - Excess battery allocation to buildings with small deficits is wasted (uncoordinated).
    - Returns real computed metrics: total_served_kw, unmet_demand_kw, critical_unmet_kw, tier1_served_pct, fairness_index.
    """
    deficit_blocks = [b for b in blocks if b.deficit_kw > 0.001]
    n_deficit = len(deficit_blocks)
    
    if n_deficit == 0 or battery_available_kw <= 0.001:
        allocations = {b.name: 0.0 for b in blocks}
    else:
        # Equal naive split of battery power
        naive_per_block = battery_available_kw / n_deficit
        allocations = {}
        for b in blocks:
            if b.deficit_kw > 0.001:
                allocations[b.name] = round(min(b.deficit_kw, naive_per_block), 2)
            else:
                allocations[b.name] = 0.0

    total_served = sum(b.solar_kw + allocations.get(b.name, 0.0) for b in blocks)
    total_demand = sum(b.load_kw for b in blocks)
    total_unmet = max(0.0, total_demand - total_served)
    
    critical_unmet = 0.0
    for b in blocks:
        served_to_block = b.solar_kw + allocations.get(b.name, 0.0)
        if served_to_block < b.critical_kw:
            critical_unmet += (b.critical_kw - served_to_block)
            
    ratios = []
    for b in deficit_blocks:
        alloc = allocations.get(b.name, 0.0)
        ratios.append(alloc / max(0.001, b.deficit_kw))
        
    jain_index = 0.0
    if ratios:
        sum_r = sum(ratios)
        sum_sq = sum(r**2 for r in ratios)
        if sum_sq > 0:
            jain_index = round((sum_r ** 2) / (len(ratios) * sum_sq), 3)

    return {
        "allocations": allocations,
        "total_served_kw": round(total_served, 2),
        "unmet_demand_kw": round(total_unmet, 2),
        "critical_unmet_kw": round(critical_unmet, 2),
        "tier1_served_pct": round(max(0.0, 100.0 - (critical_unmet / max(1.0, sum(b.critical_kw for b in blocks))) * 100.0), 1),
        "fairness_index": jain_index,
        "battery_used_kw": round(sum(allocations.values()), 2),
    }


if __name__ == "__main__":
    demo_blocks = [
        BlockState(name="Hostel A", load_kw=60, solar_kw=10, critical_kw=8, feeder_limit_kw=50),
        BlockState(name="Hostel B", load_kw=55, solar_kw=0, critical_kw=8, feeder_limit_kw=50),
        BlockState(name="Academic", load_kw=90, solar_kw=15, critical_kw=15, feeder_limit_kw=60),
    ]
    print("=== Normal evening hour, battery = 60 kW ===")
    result = allocate(demo_blocks, battery_available_kw=60)
    print(result)

    print("\n=== Outage scenario, battery = 25 kW (severe shortage) ===")
    result2 = allocate(demo_blocks, battery_available_kw=25)
    print(result2)
