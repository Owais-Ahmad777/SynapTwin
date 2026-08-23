"""
driev_fleet.py
--------------
Models the driEV campus shared electric scooter fleet (12 units) at SOA ITER.
Fleet Breakdown:
  - 7 Speed Tier scooters (2.5 kWh battery, 0.5 kW AC charging, range ~35 km)
  - 5 Luxe Tier scooters (3.0 kWh battery, 0.7 kW fast AC charging, range ~45 km)

Student Commute & Mobility Curve:
  - 07:00–09:00 (Morning commute): High checkout (8–9 on-ride), low availability.
  - 10:00–16:00 (Class hours & solar soak): 8–9 scooters docked & charging from solar surplus.
  - 17:00–20:00 (Evening commute): 7–9 scooters on-ride to hostels & campus amenities.
  - 21:00–06:00 (Overnight): Docked & slow charging, near-zero rides.
"""

from dataclasses import dataclass
from typing import Literal

ScooterTier = Literal["Speed", "Luxe"]
ScooterStatus = Literal["CHARGING", "AVAILABLE", "ON_RIDE"]


@dataclass
class DriEVScooter:
    id: str
    tier: ScooterTier
    battery_capacity_kwh: float
    soc_pct: float
    charger_power_kw: float
    status: ScooterStatus = "AVAILABLE"
    min_reserve_soc_pct: float = 30.0
    emergency_buffer_opt_in: bool = True

    @property
    def energy_stored_kwh(self) -> float:
        return round(self.battery_capacity_kwh * (self.soc_pct / 100.0), 3)

    @property
    def charge_headroom_kwh(self) -> float:
        return round(self.battery_capacity_kwh * ((100.0 - self.soc_pct) / 100.0), 3)

    @property
    def emergency_dischargeable_kwh(self) -> float:
        if not self.emergency_buffer_opt_in:
            return 0.0
        usable_soc = max(0.0, self.soc_pct - self.min_reserve_soc_pct)
        return round(self.battery_capacity_kwh * (usable_soc / 100.0), 3)

    @property
    def range_km(self) -> float:
        km_per_kwh = 14.0 if self.tier == "Speed" else 15.0
        return round(self.energy_stored_kwh * km_per_kwh, 1)


def get_hourly_driev_state(
    hour: int, 
    is_outage: bool = False, 
    emergency_opt_in_count: int = 8, 
    surplus_kw: float = 0.0
) -> dict:
    """
    Computes dynamic fleet state for a given hour of the day (0 to 23).
    Reflects the exact 12-unit campus scooter mobility schedule:
    
    1. Night/Overnight Window (8:00 PM to 8:00 AM / Hours 20:00 – 08:00):
       - Zero active rentals: on_ride_count = 0.
       - Charging at Bay: 10 scooters (6 Speed + 4 Luxe).
       - Available for Booking: 2 fully charged idle scooters (1 Speed + 1 Luxe).
       - Charging Bay Load: ~5.8 kW to 6.5 kW.
       
    2. Peak Hiring Windows (12:00 PM Lunch Peak & 3:00 PM – 7:00 PM Afternoon/Evening Peak):
       - Hours 12 & Hours 15, 16, 17, 18, 19:
       - on_ride_count: 8 scooters (5 Speed + 3 Luxe).
       - available_count: 2 scooters (1 Speed + 1 Luxe).
       - charging_count: 2 scooters (1 Speed + 1 Luxe).
       
    3. Standard Daytime Windows (8:00 AM – 11:59 AM & 1:00 PM – 2:59 PM):
       - Hours 8, 9, 10, 11 & Hours 13, 14:
       - on_ride_count: 4 scooters (2 Speed + 2 Luxe).
       - available_count: 4 scooters (2 Speed + 2 Luxe).
       - charging_count: 4 scooters (3 Speed + 1 Luxe).
       
    Validation: (charging_count + available_count + on_ride_count) == 12 total units.
    """
    fleet: list[DriEVScooter] = []

    is_night = (hour >= 20 or hour < 8)          # 8:00 PM to 8:00 AM (Strictly ALL 12 CHARGING, 0 on ride, 0 available)
    is_morning_offpeak = (8 <= hour <= 11)       # 8:00 AM to 12:00 PM (Moderate: 4 on ride, 5 available, 3 charging)
    is_midday_peak = (hour == 12)                # 12:00 PM to 1:00 PM (Lunch Peak: 8 on ride, 2 available, 2 charging)
    is_afternoon_offpeak = (13 <= hour <= 14)    # 1:00 PM to 3:00 PM (Moderate: 4 on ride, 5 available, 3 charging)
    is_afternoon_peak = (15 <= hour <= 18)       # 3:00 PM to 7:00 PM (Afternoon Peak: 8 on ride, 2 available, 2 charging)
    is_evening_return = (hour == 19)             # 7:00 PM to 8:00 PM (Return: 2 on ride, 3 available, 7 charging)

    is_peak = is_midday_peak or is_afternoon_peak
    is_offpeak = is_morning_offpeak or is_afternoon_offpeak

    # 7 Speed Tier scooters (IDs: driEV-Speed-01 to driEV-Speed-07)
    for i in range(1, 8):
        if is_night:
            # Strictly ALL 7 Speed scooters CHARGING overnight
            status: ScooterStatus = "CHARGING"
            soc = min(100.0, 58.0 + ((hour + 4) % 24) * 3.5 + i * 2.0)
        elif is_peak:
            # 5 on ride, 1 charging, 1 available
            if i in (1, 2, 4, 5, 6):
                status = "ON_RIDE"
                soc = max(35.0, 86.0 - (i * 6 + ((hour - 12) * 5) % 20))
            elif i == 3:
                status = "CHARGING"
                soc = 65.0
            else:
                status = "AVAILABLE"
                soc = 92.0
        elif is_offpeak:
            # 2 on ride, 3 available, 2 charging
            if i in (1, 4):
                status = "ON_RIDE"
                soc = max(45.0, 84.0 - (i * 5))
            elif i in (3, 5, 7):
                status = "AVAILABLE"
                soc = 90.0
            else:
                status = "CHARGING"
                soc = min(96.0, 62.0 + (hour * 2 + i * 3))
        else:
            # 19:00 Evening return: 1 on ride, 2 available, 4 charging
            if i == 1:
                status = "ON_RIDE"
                soc = 42.0
            elif i in (5, 7):
                status = "AVAILABLE"
                soc = 95.0
            else:
                status = "CHARGING"
                soc = min(90.0, 55.0 + i * 5)

        if is_outage and status == "CHARGING":
            status = "AVAILABLE"

        fleet.append(DriEVScooter(
            id=f"driEV-Speed-{i:02d}",
            tier="Speed",
            battery_capacity_kwh=2.5,
            soc_pct=round(soc, 1),
            charger_power_kw=0.5,
            status=status,
            min_reserve_soc_pct=30.0,
            emergency_buffer_opt_in=i <= emergency_opt_in_count,
        ))

    # 5 Luxe Tier scooters (IDs: driEV-Luxe-01 to driEV-Luxe-05)
    for i in range(1, 6):
        if is_night:
            # Strictly ALL 5 Luxe scooters CHARGING overnight
            status = "CHARGING"
            soc = min(100.0, 62.0 + ((hour + 4) % 24) * 3.2 + i * 2.5)
        elif is_peak:
            # 3 on ride, 1 charging, 1 available
            if i in (1, 3, 4):
                status = "ON_RIDE"
                soc = max(38.0, 90.0 - (i * 7 + ((hour - 12) * 4) % 18))
            elif i == 2:
                status = "CHARGING"
                soc = 70.0
            else:
                status = "AVAILABLE"
                soc = 95.0
        elif is_offpeak:
            # 2 on ride, 2 available, 1 charging
            if i in (2, 4):
                status = "ON_RIDE"
                soc = max(50.0, 86.0 - (i * 6))
            elif i in (3, 5):
                status = "AVAILABLE"
                soc = 94.0
            else:
                status = "CHARGING"
                soc = min(98.0, 68.0 + (hour * 2 + i * 3))
        else:
            # 19:00 Evening return: 1 on ride, 1 available, 3 charging
            if i == 3:
                status = "ON_RIDE"
                soc = 45.0
            elif i == 5:
                status = "AVAILABLE"
                soc = 96.0
            else:
                status = "CHARGING"
                soc = min(92.0, 60.0 + i * 6)

        if is_outage and status == "CHARGING":
            status = "AVAILABLE"

        fleet.append(DriEVScooter(
            id=f"driEV-Luxe-{i:02d}",
            tier="Luxe",
            battery_capacity_kwh=3.0,
            soc_pct=round(soc, 1),
            charger_power_kw=0.7,
            status=status,
            min_reserve_soc_pct=35.0,
            emergency_buffer_opt_in=(7 + i) <= emergency_opt_in_count,
        ))

    # Metrics
    charging_scooters = [s for s in fleet if s.status == "CHARGING"]
    total_demand_kw = round(sum(s.charger_power_kw for s in charging_scooters), 2)
    
    opted_in = [s for s in fleet if s.emergency_buffer_opt_in and s.status != "ON_RIDE"]
    emergency_buf_avail = round(sum(min(s.charger_power_kw, s.emergency_dischargeable_kwh) for s in opted_in), 2)

    return {
        "fleet_brand": "driEV Campus Shared Mobility",
        "total_scooters": len(fleet),
        "speed_tier_count": sum(1 for s in fleet if s.tier == "Speed"),
        "luxe_tier_count": sum(1 for s in fleet if s.tier == "Luxe"),
        "charging_count": len(charging_scooters),
        "available_count": sum(1 for s in fleet if s.status == "AVAILABLE"),
        "on_ride_count": sum(1 for s in fleet if s.status == "ON_RIDE"),
        "charging_bay_demand_kw": total_demand_kw,
        "emergency_buffer_available_kw": emergency_buf_avail,
        "total_stored_energy_kwh": round(sum(s.energy_stored_kwh for s in fleet), 1),
        "scooters": [
            {
                "id": s.id,
                "tier": s.tier,
                "capacity_kwh": s.battery_capacity_kwh,
                "soc_pct": s.soc_pct,
                "range_km": s.range_km,
                "status": s.status,
                "charger_kw": s.charger_power_kw,
                "emergency_opt_in": s.emergency_buffer_opt_in,
            }
            for s in fleet
        ],
    }


def create_driev_fleet(emergency_opt_in_count: int = 8) -> list[DriEVScooter]:
    summary = get_hourly_driev_state(12, is_outage=False, emergency_opt_in_count=emergency_opt_in_count)
    return [
        DriEVScooter(
            id=s["id"],
            tier=s["tier"],
            battery_capacity_kwh=s["capacity_kwh"],
            soc_pct=s["soc_pct"],
            charger_power_kw=s["charger_kw"],
            status=s["status"],
            emergency_buffer_opt_in=s["emergency_opt_in"]
        )
        for s in summary["scooters"]
    ]


def total_driev_charging_demand_kw(fleet: list[DriEVScooter]) -> float:
    return round(sum(s.charger_power_kw for s in fleet if s.status == "CHARGING" and s.charge_headroom_kwh > 0.05), 2)


def driev_emergency_buffer_kw(fleet: list[DriEVScooter]) -> float:
    eligible = [s for s in fleet if s.emergency_buffer_opt_in and s.status != "ON_RIDE"]
    return round(sum(min(s.charger_power_kw, s.emergency_dischargeable_kwh) for s in eligible), 2)


def redirect_solar_surplus_to_driev(fleet: list[DriEVScooter], surplus_kw: float) -> dict[str, float]:
    """Redirects midday solar surplus across charging scooters up to each charger limit."""
    delivered = {s.id: 0.0 for s in fleet}
    eligible = [s for s in fleet if s.status == "CHARGING" and s.charge_headroom_kwh > 0.05]
    if not eligible or surplus_kw <= 0.01:
        return delivered

    remaining = surplus_kw
    share = remaining / len(eligible)
    for s in eligible:
        give = min(share, s.charger_power_kw, s.charge_headroom_kwh)
        delivered[s.id] = round(give, 2)
        s.soc_pct = min(100.0, round(s.soc_pct + (give / s.battery_capacity_kwh) * 100.0, 1))

    return delivered


def get_driev_fleet_summary(fleet: list[DriEVScooter]) -> dict:
    return get_hourly_driev_state(12, is_outage=False)


if __name__ == "__main__":
    print("Testing driEV 24-hour Student Mobility Curve:")
    for h in [2, 8, 12, 18, 22]:
        st = get_hourly_driev_state(h, is_outage=False)
        print(f"Hour {h:02d}:00 -> On-Ride: {st['on_ride_count']:2d} | Available: {st['available_count']:2d} | Charging: {st['charging_count']:2d} | Bay Demand: {st['charging_bay_demand_kw']:4.1f} kW")
