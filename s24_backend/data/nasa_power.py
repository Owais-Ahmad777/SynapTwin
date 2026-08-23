"""
nasa_power.py
--------------
Fetches solar irradiance data for the SOA ITER campus (Bhubaneswar) from the
NASA POWER API, with local disk caching and an offline clear-sky fallback so
the rest of the pipeline (load generation, optimizer, dashboard) can always
run even without internet access (e.g. during a live demo with flaky wifi).

NASA POWER docs: https://power.larc.nasa.gov/docs/services/api/
"""

import json
import math
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

# SOA ITER campus, Bhubaneswar, Odisha
LATITUDE = 20.30
LONGITUDE = 85.82

CACHE_DIR = Path(__file__).parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)

POWER_HOURLY_URL = "https://power.larc.nasa.gov/api/temporal/hourly/point"
PARAM = "ALLSKY_SFC_SW_DWN"  # All-sky surface shortwave downward irradiance, W/m^2 (hourly avg)


def _cache_path(date_str: str) -> Path:
    return CACHE_DIR / f"irradiance_{date_str}.json"


def fetch_hourly_irradiance(date: datetime = None, timeout: int = 15) -> list[float]:
    """
    Returns a list of 24 hourly irradiance values (W/m^2) for the given date
    at the SOA ITER campus. Falls back to a synthetic clear-sky curve if the
    API is unreachable (no network / rate-limited / demo day) or if NASA POWER
    has no data yet for that date (POWER has ~a few days of latency).

    date: datetime.date-like; defaults to 7 days ago (POWER data typically
    lags 2-3 days behind real time, so 7 days back reliably has published
    data for a live demo — for a fully pinned/reproducible demo, pass a
    fixed historical date explicitly instead, e.g. datetime(2026, 6, 15)).
    """
    if date is None:
        date = datetime.now(timezone.utc) - timedelta(days=7)
    date_str = date.strftime("%Y%m%d")

    cache_file = _cache_path(date_str)
    if cache_file.exists():
        with open(cache_file) as f:
            return json.load(f)["hourly_irradiance"]

    try:
        params = {
            "parameters": PARAM,
            "community": "RE",
            "longitude": LONGITUDE,
            "latitude": LATITUDE,
            "start": date_str,
            "end": date_str,
            "format": "JSON",
        }
        resp = requests.get(POWER_HOURLY_URL, params=params, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
        series = data["properties"]["parameter"][PARAM]
        # keys look like "2026061500".."2026061523"
        hourly = [series[f"{date_str}{h:02d}"] for h in range(24)]
        # NASA POWER uses -999 as a fill/missing value
        if any(v <= -900 for v in hourly):
            raise ValueError("POWER returned fill values for this date (no data yet)")

        with open(cache_file, "w") as f:
            json.dump({"date": date_str, "hourly_irradiance": hourly}, f)
        return hourly

    except Exception as exc:  # noqa: BLE001 - deliberate broad fallback for demo resilience
        print(f"[nasa_power] Live fetch failed ({exc}); using clear-sky fallback for {date_str}")
        return _synthetic_clear_sky_curve()


def _synthetic_clear_sky_curve(peak_irradiance: float = 850.0) -> list[float]:
    """
    Simple cosine-based clear-sky irradiance model for Bhubaneswar
    (sunrise ~06:00, sunset ~18:00, solar noon ~12:00). Used only when the
    live API is unreachable, so the dashboard/optimizer never blocks on
    network availability.
    """
    hourly = []
    sunrise, sunset = 6.0, 18.0
    for h in range(24):
        if h < sunrise or h > sunset:
            hourly.append(0.0)
        else:
            frac = (h - sunrise) / (sunset - sunrise)  # 0..1 across daylight
            val = peak_irradiance * math.sin(math.pi * frac)
            hourly.append(round(max(val, 0.0), 1))
    return hourly


def irradiance_to_pv_output_kw(hourly_irradiance: list[float], panel_kwp: float,
                                derate: float = 0.80) -> list[float]:
    """
    Converts hourly irradiance (W/m^2) into estimated PV output (kW) for a
    rooftop array rated `panel_kwp` at standard test conditions (1000 W/m^2),
    applying a derate factor for inverter/wiring/temperature/soiling losses.
    """
    return [round((irr / 1000.0) * panel_kwp * derate, 3) for irr in hourly_irradiance]


if __name__ == "__main__":
    irr = fetch_hourly_irradiance()
    print("Hourly irradiance (W/m^2):", irr)
    print("Example 40 kWp array output (kW):", irradiance_to_pv_output_kw(irr, panel_kwp=40))
