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
import logging

log = logging.getLogger("synaptwin.allocation")

try:
    import pulp
    _HAS_PULP = True
except ImportError:
    _HAS_PULP = False
    log.warning("[allocation] PuLP not installed — falling back to dependency-free "
                "ratio-based water-filling solver. Run `pip install pulp` for LP solver.")


@dataclass
class BlockState:
    name: str
    load_kw: float
    solar_kw: float
    critical_kw: float          # portion of load_kw that must always be served
    feeder_limit_kw: float      # max power the physical feeder to this block can carry

    @property
    def deficit_kw(self) -> float:
        # Honest deficit: only real unmet load after own solar. Solar-surplus
        # buildings have ZERO deficit (no phantom buffer — previously 8%
        # phantom demand inflated battery dispatch + savings).
        net = max(self.load_kw - self.solar_kw, 0.0)
        if net <= 0.01:
            return 0.0
        return round(net, 2)

    @property
    def flexible_deficit_kw(self) -> float:
        """Deficit beyond what's already reserved as critical."""
        d = self.deficit_kw
        if d <= 0.0:
            return 0.0
        c = min(max(self.critical_kw, 0.0), d)
        return round(max(d - c, 0.0), 2)


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
    alloc_i <= feeder headroom, and sum(alloc_i) <= remaining_battery.
    Checks LpStatus and falls back to water-filling on infeasible/timeout
    (previously unchecked `value() or 0.0` silently returned zeros)."""
    prob = pulp.LpProblem("MaxMinFairness", pulp.LpMaximize)

    alloc_vars = {
        b.name: pulp.LpVariable(f"alloc_{i}", lowBound=0,
                                 upBound=max(0.0, min(b.flexible_deficit_kw,
                                                       b.feeder_limit_kw - critical_alloc.get(b.name, 0.0))))
        for i, b in enumerate(flexible_blocks)
    }
    r = pulp.LpVariable("fairness_ratio", lowBound=0, upBound=1)

    prob += r  # objective: maximize the worst-off block's satisfaction ratio

    for b in flexible_blocks:
        prob += alloc_vars[b.name] >= r * b.flexible_deficit_kw
        prob += alloc_vars[b.name] <= b.flexible_deficit_kw

    prob += pulp.lpSum(alloc_vars.values()) <= remaining_battery

    try:
        prob.solve(pulp.PULP_CBC_CMD(msg=False, timeLimit=5))
    except Exception as exc:
        log.warning("[allocation] LP solver exception (%s); falling back to water-filling", exc)
        return _solve_fair_waterfilling(flexible_blocks, remaining_battery, critical_alloc)
    status = pulp.LpStatus.get(prob.status, "Unknown")
    if status != "Optimal":
        log.warning("[allocation] LP status %s (not Optimal); falling back to water-filling", status)
        return _solve_fair_waterfilling(flexible_blocks, remaining_battery, critical_alloc)

    out: dict[str, float] = {}
    for b in flexible_blocks:
        v = alloc_vars[b.name].value()
        if v is None:
            log.warning("[allocation] LP var None for %s; using water-filling", b.name)
            return _solve_fair_waterfilling(flexible_blocks, remaining_battery, critical_alloc)
        out[b.name] = round(max(0.0, float(v)), 3)
    return out


def _solve_fair_waterfilling(flexible_blocks: list[BlockState], remaining_battery: float,
                              critical_alloc: dict[str, float]) -> dict[str, float]:
    """Dependency-free exact solution to the same max-min fairness problem via
    ratio-based progressive water-filling: raise a common satisfaction ratio r
    for all blocks until either the battery is exhausted or a block caps out
    (fully met or feeder-limited), matching the LP solution for this structure.
    Previous implementation shared equal kW (not equal ratio) and diverged
    from the LP, e.g. 10kW vs 100kW deficits got equal kW."""
    caps = {
        b.name: max(0.0, min(b.flexible_deficit_kw,
                              b.feeder_limit_kw - critical_alloc.get(b.name, 0.0)))
        for b in flexible_blocks
    }
    deficits = {b.name: max(b.flexible_deficit_kw, 1e-9) for b in flexible_blocks}
    alloc = {b.name: 0.0 for b in flexible_blocks}
    remaining = max(0.0, remaining_battery)

    live = [b.name for b in flexible_blocks if caps[b.name] > 1e-9]
    # Sort by cap/deficit ratio so smallest-ratio blocks cap first (classic WF).
    while live and remaining > 1e-9:
        total_def = sum(deficits[n] for n in live)
        if total_def <= 1e-12:
            break
        # Ratio achievable if we spread all remaining evenly by deficit share.
        r_target = remaining / total_def
        # Find blocks that would exceed their cap at r_target.
        capped = [n for n in live if caps[n] / deficits[n] <= r_target + 1e-12]
        if not capped:
            for n in live:
                alloc[n] += deficits[n] * r_target
            remaining = 0.0
            break
        # Serve capped blocks fully, remove them, continue with rest.
        for n in capped:
            alloc[n] = caps[n]
            remaining -= caps[n]
        live = [n for n in live if n not in set(capped) and caps[n] - alloc[n] > 1e-9]
        # Guard against float dust / negative remaining from rounding.
        remaining = max(0.0, remaining)

    return {n: round(v, 3) for n, v in alloc.items()}


def allocate(blocks: list[BlockState], battery_available_kw: float) -> AllocationResult:
    battery_available_kw = max(0.0, float(battery_available_kw or 0.0))
    # Clamp nonsensical feeder limits to non-negative.
    for b in blocks:
        if b.feeder_limit_kw < 0:
            b.feeder_limit_kw = 0.0
        if b.load_kw < 0:
            b.load_kw = 0.0
        if b.solar_kw < 0:
            b.solar_kw = 0.0
        if b.critical_kw < 0:
            b.critical_kw = 0.0
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
        # Step 1: Satisfy critical deficits first, capped by feeder (previously
        # critical could exceed feeder_limit, making LP infeasible).
        critical_alloc = {b.name: round(min(b.critical_kw, b.deficit_kw, b.feeder_limit_kw), 3) for b in blocks}
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
        # Critical demand alone exceeds battery: flag INFEASIBLE (was always
        # False before) and scale proportionally so grid must cover the rest.
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
            infeasible=True,
            infeasible_reason=(
                f"Critical demand {critical_needed:.1f} kW exceeds battery "
                f"{battery_available_kw:.1f} kW — critical loads scaled to {scale*100:.0f}%, "
                f"flexible demand rejected, grid backup required."
            ),
            rejected_kw=total_unmet,
        )

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
