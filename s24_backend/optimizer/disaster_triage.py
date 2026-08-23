"""
disaster_triage.py
--------------------
A second allocation *mode*, deliberately different from allocation.py's
day-to-day fairness engine. This is the "inform where we must use the
backup energy after judging the need of energy supply at different
locations" feature.

Why a separate mode instead of reusing max-min fairness:
  In routine operation, max-min fairness is the right ethic — no block
  should be structurally favored over another for everyday convenience
  load. But during a declared disaster/outage, equal sharing is the WRONG
  ethic: a flooded block with people needing lit corridors and a working
  water pump must outrank an unaffected block's ordinary convenience load,
  even completely. So disaster mode uses strict lexicographic priority:

    1. Serve every Tier-1 (life-safety/medical) location's need in full,
       across ALL locations, before spending a single kW on Tier 2.
    2. Then Tier 2 (essential services: water pumps, corridor lighting,
       refrigeration), fully, across all locations.
    3. Then Tier 3 (academic operations / server room non-critical).
    4. Then Tier 4 (convenience / EV charging) — first to be cut.

  Within a tier, locations are served in order of a live "need score"
  (0-1, e.g. raised by a warden/sensor report of flooding, fire, medical
  emergency at that location) rather than split fairly — the most urgent
  reported need is served first, up to its actual deficit or the feeder
  limit, before moving to the next-most-urgent location in that tier.

This intentionally produces a DIFFERENT allocation than the routine
fairness engine would for the same numbers — that contrast is worth
stating explicitly in a demo/pitch: "fair" and "triage-prioritized" are
not the same thing, and a real emergency system needs to know which one
it's running.
"""

from dataclasses import dataclass, field

TIER_NAMES = {
    1: "TIER1_LIFE_SAFETY",       # medical points, server/comms room, water pumps under active emergency
    2: "TIER2_ESSENTIAL",         # corridor lighting, refrigeration, general water supply
    3: "TIER3_ACADEMIC",          # classrooms, labs, admin
    4: "TIER4_CONVENIENCE",       # EV charging, personal device charging, non-essential
}


@dataclass
class LocationNeed:
    name: str
    tier: int                 # 1 (highest priority) .. 4 (lowest)
    deficit_kw: float          # unmet power need at this location right now
    feeder_limit_kw: float
    need_score: float = 0.5    # 0-1, raised for locations with an active reported hazard/emergency
    reported_hazard: str | None = None  # e.g. "flooding reported", "medical emergency", None if routine


@dataclass
class TriageResult:
    allocation_kw: dict[str, float]
    tier_fully_served: dict[int, bool]
    battery_used_kw: float
    battery_available_kw: float
    rejected_kw: float
    priority_order: list[str]     # location names in the order they were served, for transparency
    narrative: str                 # human-readable explanation of the triage decision


def triage_allocate(locations: list[LocationNeed], battery_available_kw: float) -> TriageResult:
    remaining = battery_available_kw
    allocation = {loc.name: 0.0 for loc in locations}
    priority_order: list[str] = []
    tier_fully_served: dict[int, bool] = {}
    narrative_lines = []

    for tier in sorted(set(loc.tier for loc in locations)):
        tier_locs = [loc for loc in locations if loc.tier == tier and loc.deficit_kw > 1e-6]
        if not tier_locs:
            tier_fully_served[tier] = True
            continue

        tier_demand = sum(loc.deficit_kw for loc in tier_locs)
        served_this_tier = 0.0

        if remaining <= 1e-6:
            tier_fully_served[tier] = False
            for lower_tier in [t for t in TIER_NAMES if t >= tier]:
                tier_fully_served[lower_tier] = False
            break

        # Group locations within this tier by need_score descending
        need_scores = sorted(set(loc.need_score for loc in tier_locs), reverse=True)

        for score in need_scores:
            if remaining <= 1e-6:
                break

            group = [loc for loc in tier_locs if loc.need_score == score]
            group_demand = sum(loc.deficit_kw for loc in group)

            if remaining >= group_demand - 1e-3:
                # Fully satisfy all locations in this urgency group
                for loc in group:
                    give = min(loc.deficit_kw, loc.feeder_limit_kw, remaining)
                    allocation[loc.name] = round(give, 3)
                    remaining -= give
                    served_this_tier += give
                    priority_order.append(loc.name)
                    if loc.reported_hazard:
                        narrative_lines.append(
                            f"{loc.name} ({TIER_NAMES[tier]}) served {give:.1f} kW first — "
                            f"active report: {loc.reported_hazard}."
                        )
            else:
                # Proportional distribution across all locations in this urgency group (guaranteeing hostel equality)
                active_headroom = {loc.name: min(loc.deficit_kw, loc.feeder_limit_kw) for loc in group}
                total_active = sum(active_headroom.values())
                rem_group = remaining

                for loc in group:
                    if total_active > 0:
                        prop_share = round((active_headroom[loc.name] / total_active) * rem_group, 3)
                        give = min(prop_share, active_headroom[loc.name])
                        allocation[loc.name] = give
                        served_this_tier += give
                        priority_order.append(loc.name)
                        if loc.reported_hazard:
                            narrative_lines.append(
                                f"{loc.name} ({TIER_NAMES[tier]}) served {give:.1f} kW proportionally — "
                                f"active report: {loc.reported_hazard}."
                            )

                remaining = max(0.0, remaining - sum(allocation[loc.name] for loc in group))
                break  # Battery exhausted at this urgency level

        tier_fully_served[tier] = served_this_tier >= tier_demand - 1e-3
        if not tier_fully_served[tier]:
            narrative_lines.append(
                f"{TIER_NAMES[tier]} served {served_this_tier:.1f} of {tier_demand:.1f} kW needed "
                f"across all {len(tier_locs)} locations (rationed proportionally). "
                f"Lower tiers received 0 kW."
            )
            for lower_tier in [t for t in TIER_NAMES if t > tier]:
                tier_fully_served[lower_tier] = False
            break

    total_used = round(sum(allocation.values()), 3)
    total_demand = round(sum(loc.deficit_kw for loc in locations), 3)
    rejected = round(total_demand - total_used, 3)

    if rejected <= 1e-3:
        narrative_lines.insert(0, f"All {len(locations)} locations' needs fully covered "
                                    f"({total_used:.1f} kW of {battery_available_kw:.1f} kW available).")
    else:
        narrative_lines.insert(0, f"Battery ({battery_available_kw:.1f} kW) insufficient for total need "
                                    f"({total_demand:.1f} kW). Served strictly by tier priority: "
                                    f"life-safety first, convenience last. {rejected:.1f} kW unmet.")

    return TriageResult(
        allocation_kw=allocation,
        tier_fully_served=tier_fully_served,
        battery_used_kw=total_used,
        battery_available_kw=battery_available_kw,
        rejected_kw=rejected,
        priority_order=priority_order,
        narrative=" ".join(narrative_lines),
    )


if __name__ == "__main__":
    # Disaster scenario: flooding reported at Hostel B, damaging its ground-floor pump room.
    locations = [
        LocationNeed(name="Server/Comms Room", tier=1, deficit_kw=6, feeder_limit_kw=10,
                     need_score=1.0, reported_hazard=None),
        LocationNeed(name="Medical Point", tier=1, deficit_kw=4, feeder_limit_kw=10,
                     need_score=1.0, reported_hazard=None),
        LocationNeed(name="Hostel B Water Pump", tier=2, deficit_kw=5, feeder_limit_kw=10,
                     need_score=0.95, reported_hazard="flooding reported, pump room needs power to drain"),
        LocationNeed(name="Hostel A Corridor Lighting", tier=2, deficit_kw=6, feeder_limit_kw=10,
                     need_score=0.5, reported_hazard=None),
        LocationNeed(name="Academic Block", tier=3, deficit_kw=30, feeder_limit_kw=50,
                     need_score=0.4, reported_hazard=None),
        LocationNeed(name="EV Charging Bay", tier=4, deficit_kw=20, feeder_limit_kw=20,
                     need_score=0.3, reported_hazard=None),
    ]
    result = triage_allocate(locations, battery_available_kw=20)
    print("Allocation:", result.allocation_kw)
    print("Tiers fully served:", result.tier_fully_served)
    print("Priority order:", result.priority_order)
    print("Narrative:", result.narrative)
