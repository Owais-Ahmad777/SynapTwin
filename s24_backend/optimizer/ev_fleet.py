"""
ev_fleet.py
------------
Models a small campus EV charging bay as a flexible, two-way load:

- Normal operation: EV charging is the LOWEST priority (Tier 4) flexible
  load — it soaks up midday solar surplus when blocks are already served,
  and is the first thing throttled back when the battery/solar is tight.
  This is "redirecting energy" to EVs opportunistically rather than
  guaranteeing them a fixed share.

- Outage/disaster mode: if enabled, plugged-in EVs above a configurable
  minimum reserve state-of-charge (so nobody's car is left stranded) can
  discharge BACK into the shared system (V2G — vehicle-to-grid) to help
  cover critical/essential loads. Each EV owner opts in ahead of time
  (`v2g_enabled`); this is deliberately opt-in, not automatic, since it's
  someone's personal vehicle battery.
"""

from dataclasses import dataclass


@dataclass
class EV:
    id: str
    battery_capacity_kwh: float
    soc_pct: float                  # current state of charge, 0-100
    charger_power_kw: float          # max rate this EV's charger can deliver/accept
    v2g_enabled: bool = False        # owner has opted in to vehicle-to-grid discharge
    min_reserve_soc_pct: float = 30.0  # never discharge below this, even if v2g_enabled

    @property
    def energy_kwh(self) -> float:
        return round(self.battery_capacity_kwh * self.soc_pct / 100.0, 2)

    @property
    def charge_headroom_kwh(self) -> float:
        return round(self.battery_capacity_kwh * (100 - self.soc_pct) / 100.0, 2)

    @property
    def dischargeable_kwh(self) -> float:
        if not self.v2g_enabled:
            return 0.0
        reserve_kwh = self.battery_capacity_kwh * self.min_reserve_soc_pct / 100.0
        return round(max(self.energy_kwh - reserve_kwh, 0.0), 2)


def total_ev_charging_demand_kw(fleet: list[EV]) -> float:
    """Total kW the plugged-in fleet would draw if charged at full rate (Tier 4 flexible load)."""
    return round(sum(ev.charger_power_kw for ev in fleet if ev.charge_headroom_kwh > 0.01), 2)


def redirect_surplus_to_evs(fleet: list[EV], surplus_kw: float, hours: float = 1.0) -> dict[str, float]:
    """
    Opportunistic charging: given leftover solar/battery power after all
    campus blocks are served, spread it across EVs that still have charge
    headroom (round-robin up to each EV's charger limit), so surplus
    generation isn't wasted. Returns kW delivered to each EV this hour.
    """
    delivered = {ev.id: 0.0 for ev in fleet}
    remaining = surplus_kw
    eligible = [ev for ev in fleet if ev.charge_headroom_kwh > 0.01]

    while remaining > 1e-6 and eligible:
        share = remaining / len(eligible)
        still_eligible = []
        for ev in eligible:
            headroom_kw = ev.charge_headroom_kwh / hours
            give = min(share, ev.charger_power_kw - delivered[ev.id], headroom_kw)
            if give > 1e-6:
                delivered[ev.id] = round(delivered[ev.id] + give, 3)
                remaining -= give
            if (ev.charger_power_kw - delivered[ev.id] > 1e-6) and \
               (ev.charge_headroom_kwh / hours - delivered[ev.id] > 1e-6):
                still_eligible.append(ev)
        if not still_eligible:
            break
        eligible = still_eligible

    return delivered


def available_v2g_kw(fleet: list[EV], hours: float = 1.0) -> float:
    """Total power pluggeded-in, opted-in EVs could safely discharge back to campus this hour."""
    return round(sum(min(ev.charger_power_kw, ev.dischargeable_kwh / hours) for ev in fleet), 2)


def draw_v2g(fleet: list[EV], requested_kw: float, hours: float = 1.0) -> dict[str, float]:
    """
    Draws power from opted-in EVs during an outage, proportional to each
    EV's available dischargeable energy, never dipping below its reserve SoC.
    """
    eligible = [ev for ev in fleet if ev.dischargeable_kwh > 0.01]
    if not eligible:
        return {ev.id: 0.0 for ev in fleet}

    total_avail = sum(min(ev.charger_power_kw, ev.dischargeable_kwh / hours) for ev in eligible)
    if total_avail <= 1e-9:
        return {ev.id: 0.0 for ev in fleet}

    scale = min(requested_kw / total_avail, 1.0)
    drawn = {ev.id: 0.0 for ev in fleet}
    for ev in eligible:
        cap = min(ev.charger_power_kw, ev.dischargeable_kwh / hours)
        drawn[ev.id] = round(cap * scale, 3)
    return drawn


DEMO_FLEET = [
    EV(id="EV-01 (Faculty)", battery_capacity_kwh=40, soc_pct=55, charger_power_kw=7, v2g_enabled=True),
    EV(id="EV-02 (Faculty)", battery_capacity_kwh=35, soc_pct=80, charger_power_kw=7, v2g_enabled=False),
    EV(id="EV-03 (Shuttle)", battery_capacity_kwh=60, soc_pct=40, charger_power_kw=11, v2g_enabled=True),
]

if __name__ == "__main__":
    print("Total charging demand (kW):", total_ev_charging_demand_kw(DEMO_FLEET))
    print("Redirecting 10 kW solar surplus ->", redirect_surplus_to_evs(DEMO_FLEET, surplus_kw=10))
    print("Available V2G capacity during outage (kW):", available_v2g_kw(DEMO_FLEET))
    print("Drawing 8 kW V2G during outage ->", draw_v2g(DEMO_FLEET, requested_kw=8))
