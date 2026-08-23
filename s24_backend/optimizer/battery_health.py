"""
battery_health.py
-------------------
Models the shared battery's State of Health (SoH) as it accumulates cycles,
and repurposes its role in the system as it degrades — this is the "second
life" story: an EV battery arrives already at ~80% SoH (typical retirement
point from vehicle use), and as it degrades further on campus it moves
through duty tiers rather than being scrapped outright.

Degradation model (standard Li-ion NMC assumptions, citable):
  - ~2.5% capacity fade per 100 equivalent full cycles (typical second-life rate,
    faster than first-life since cells are already partially aged)
  - small calendar aging term (fade even when idle)
  - once SoH drops below a duty tier's threshold, max discharge power AND
    usable capacity are derated, and the battery's role changes

Duty tiers:
  FULL_DUTY   (SoH >= 80%): full power available for day-to-day fairness allocation
  BACKUP_ONLY (60% <= SoH < 80%): power derated 30%; only dispatched during
              outages/disasters, not for routine daytime rationing — preserves
              remaining life for when it matters most
  SECOND_LIFE_LOW (40% <= SoH < 60%): power derated 60%; reserved strictly for
              Tier-1 critical loads (server room, medical) in emergencies only
  RETIRE (SoH < 40%): removed from the live system, flagged for recycling
"""

from dataclasses import dataclass, field


CYCLE_FADE_PCT_PER_100_CYCLES = 2.5     # % capacity fade per 100 equivalent full cycles
CALENDAR_FADE_PCT_PER_YEAR = 1.5        # % capacity fade per year even at rest
INITIAL_SOH_PCT = 82.0                  # typical second-life starting point (retired from EV service)

TIER_THRESHOLDS = [
    ("FULL_DUTY", 80.0, 1.00),
    ("BACKUP_ONLY", 60.0, 0.70),
    ("SECOND_LIFE_LOW", 40.0, 0.40),
    ("RETIRE", 0.0, 0.0),
]


@dataclass
class BatteryHealthState:
    rated_capacity_kwh: float          # original nameplate capacity when installed on campus
    rated_power_kw: float              # original nameplate max discharge power
    soh_pct: float = INITIAL_SOH_PCT
    total_equivalent_cycles: float = 0.0
    days_in_service: int = 0

    @property
    def usable_capacity_kwh(self) -> float:
        return round(self.rated_capacity_kwh * (self.soh_pct / 100.0), 2)

    @property
    def duty_tier(self) -> str:
        for tier, threshold, _ in TIER_THRESHOLDS:
            if self.soh_pct >= threshold:
                return tier
        return "RETIRE"

    @property
    def derate_factor(self) -> float:
        for tier, threshold, factor in TIER_THRESHOLDS:
            if self.soh_pct >= threshold:
                return factor
        return 0.0

    @property
    def available_power_kw(self) -> float:
        """Max discharge power available for allocation, after health-based derating."""
        return round(self.rated_power_kw * self.derate_factor, 2)

    def record_day_cycling(self, energy_throughput_kwh: float) -> None:
        """
        Call once per simulated day with the total energy (kWh) charged +
        discharged that day. Updates cycle count and applies degradation.
        """
        equivalent_cycles_today = energy_throughput_kwh / (2 * self.rated_capacity_kwh) \
            if self.rated_capacity_kwh > 0 else 0.0
        self.total_equivalent_cycles += equivalent_cycles_today
        self.days_in_service += 1

        cycle_fade = (equivalent_cycles_today / 100.0) * CYCLE_FADE_PCT_PER_100_CYCLES
        calendar_fade = CALENDAR_FADE_PCT_PER_YEAR / 365.0
        self.soh_pct = max(round(self.soh_pct - cycle_fade - calendar_fade, 4), 0.0)

    def status_report(self) -> dict:
        return {
            "soh_pct": round(self.soh_pct, 2),
            "duty_tier": self.duty_tier,
            "usable_capacity_kwh": self.usable_capacity_kwh,
            "available_power_kw": self.available_power_kw,
            "total_equivalent_cycles": round(self.total_equivalent_cycles, 1),
            "days_in_service": self.days_in_service,
            "recommendation": _recommendation_for_tier(self.duty_tier),
        }


def _recommendation_for_tier(tier: str) -> str:
    return {
        "FULL_DUTY": "Battery is healthy — use for routine daily fairness allocation across all blocks.",
        "BACKUP_ONLY": "Battery has aged past full-duty threshold — reserve for outages/peak-shaving only, "
                        "no longer used for routine daytime rationing, to conserve remaining life.",
        "SECOND_LIFE_LOW": "Battery is significantly degraded — restrict strictly to Tier-1 critical loads "
                            "(server room, medical) during declared emergencies only.",
        "RETIRE": "Battery has fallen below safe/useful capacity — remove from live system and route to "
                   "certified recycling. Do not dispatch.",
    }[tier]


def simulate_aging(days: int, avg_daily_throughput_kwh: float,
                    rated_capacity_kwh: float = 180.0, rated_power_kw: float = 60.0) -> list[dict]:
    """Projects SoH trajectory forward — useful for a 'battery lifetime' chart in the dashboard."""
    battery = BatteryHealthState(rated_capacity_kwh=rated_capacity_kwh, rated_power_kw=rated_power_kw)
    trajectory = []
    for day in range(1, days + 1):
        battery.record_day_cycling(avg_daily_throughput_kwh)
        if day % 30 == 0 or day == days:
            trajectory.append({"day": day, **battery.status_report()})
    return trajectory


if __name__ == "__main__":
    print("=== Projected battery aging over 3 years (moderate daily use) ===")
    for point in simulate_aging(days=365 * 3, avg_daily_throughput_kwh=140):
        print(point)
