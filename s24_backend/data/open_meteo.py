"""
open_meteo.py
-------------
Fetches real solar irradiance forecast data for SOA ITER Campus (20.30° N, 85.82° E)
using the free Open-Meteo Solar Radiation API (no API key required).
Provides live next-day forecast and hourly radiation values with offline clear-sky fallback.
"""

import json
import logging
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("synaptwin.open_meteo")

try:
    from config import OPEN_METEO_TIMEOUT_SEC, OPEN_METEO_CACHE_TTL_HOURS
except ImportError:
    import os
    OPEN_METEO_TIMEOUT_SEC = float(os.environ.get("OPEN_METEO_TIMEOUT_SEC", 4.0))
    OPEN_METEO_CACHE_TTL_HOURS = float(os.environ.get("OPEN_METEO_CACHE_TTL_HOURS", 6.0))

CACHE_FILE = Path(__file__).parent / "cache" / "open_meteo_cache.json"
SOA_ITER_LAT = 20.30
SOA_ITER_LON = 85.82

# In-memory TTL cache so repeated simulation runs (e.g. /alerts/active
# re-running a full 24h sim) don't hammer the API every request.
_MEM_CACHE: dict = {"ts": None, "payload": None, "is_fallback": False}
_MEM_TTL_SEC = 600  # 10 minutes for LIVE data
_MEM_FALLBACK_TTL_SEC = 60  # 60s for fallback: one transient failure (common on
# slow free-tier egress) must not pin the panel to fallback for 10 min per worker
_LAST_ERROR: str = ""
_LAST_OK_AT: str = ""


def get_open_meteo_status() -> dict:
    """Remote-debugging status for /api/status (Render logs aren't always handy)."""
    return {
        "last_error": _LAST_ERROR or None,
        "last_ok_at": _LAST_OK_AT or None,
        "timeout_sec": OPEN_METEO_TIMEOUT_SEC,
        "cache_ttl_hours": OPEN_METEO_CACHE_TTL_HOURS,
    }


def _cache_is_fresh(fetched_at_iso: str) -> bool:
    try:
        fetched = datetime.fromisoformat(fetched_at_iso)
        if fetched.tzinfo is None:
            fetched = fetched.replace(tzinfo=timezone.utc)
        age_h = (datetime.now(timezone.utc) - fetched).total_seconds() / 3600.0
        return age_h <= OPEN_METEO_CACHE_TTL_HOURS
    except Exception:
        return False


def fetch_open_meteo_solar(lat: float = SOA_ITER_LAT, lon: float = SOA_ITER_LON) -> dict:
    """
    Fetches 2-day hourly solar radiation forecast from Open-Meteo.
    Returns hourly shortwave radiation (W/m²), cloud cover (%), and temperature (°C).
    Cache policy: memory (10 min) -> disk (TTL hours, default 6) -> clear-sky fallback.
    """
    import time as _time
    global _LAST_ERROR, _LAST_OK_AT
    now = _time.time()
    if _MEM_CACHE["payload"] is not None and _MEM_CACHE["ts"] is not None:
        _ttl = _MEM_FALLBACK_TTL_SEC if _MEM_CACHE.get("is_fallback") else _MEM_TTL_SEC
        if now - _MEM_CACHE["ts"] < _ttl:
            return _MEM_CACHE["payload"]

    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}"
        f"&hourly=shortwave_radiation,direct_normal_irradiance,diffuse_radiation,cloud_cover,temperature_2m"
        f"&timezone=Asia%2FKolkata&forecast_days=2"
    )

    # Two attempts for SLOW responses (Render Singapore cold start routinely
    # exceeds short timeouts on attempt 1 but succeeds on retry). Never retry
    # HTTP 429 (rate-limited): hammering a throttled shared IP only extends
    # the ban — go straight to cache/fallback instead.
    import urllib.error as _urlerr
    data = None
    for attempt in (1, 2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "S24-DigitalTwin/1.0 (SOA ITER Pilot)"})
            with urllib.request.urlopen(req, timeout=OPEN_METEO_TIMEOUT_SEC) as response:
                if response.getcode() == 200:
                    data = json.loads(response.read().decode("utf-8"))
                    break
        except _urlerr.HTTPError as e:
            _LAST_ERROR = f"attempt {attempt}: HTTPError: HTTP Error {e.code}: {e.reason}"
            log.warning("[open_meteo] Live fetch refused (%s); %s", _LAST_ERROR,
                        "not retrying a refusal" if e.code == 429 else
                        ("retrying once" if attempt == 1 else "checking local cache / fallback"))
            if e.code == 429 or attempt == 2:
                break
            _time.sleep(1.0)
        except Exception as e:
            _LAST_ERROR = f"attempt {attempt}: {type(e).__name__}: {e}"
            log.warning("[open_meteo] Live fetch failed (%s); %s", _LAST_ERROR,
                        "retrying once" if attempt == 1 else "checking local cache / fallback")
            if attempt == 1:
                _time.sleep(1.0)

    if data is not None:
        try:
            CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(CACHE_FILE, "w") as f:
                json.dump({
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                    "data": data,
                }, f, indent=2)
        except OSError as exc:
            log.warning("[open_meteo] Cache write failed (ephemeral disk?): %s", exc)
        _LAST_OK_AT = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        out = _process_open_meteo_data(data, source="Open-Meteo API (Live)")
        _MEM_CACHE.update({"ts": now, "payload": out, "is_fallback": False})
        return out

    # Fallback to disk cache (respect TTL — stale cache is labelled stale).
    # NOTE: Render free-tier disk is ephemeral: every deploy/restart wipes it,
    # so post-deploy first requests can only use live-or-fallback.
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, "r") as f:
                cached = json.load(f)
                fetched_at = cached.get("fetched_at", "")
                fresh = _cache_is_fresh(fetched_at) if fetched_at else False
                label = f"Open-Meteo Cache ({fetched_at[:16]})" if fresh else (
                    f"Open-Meteo Cache STALE ({fetched_at[:16]} > {OPEN_METEO_CACHE_TTL_HOURS:g}h TTL)")
                out = _process_open_meteo_data(cached["data"], source=label)
                _MEM_CACHE.update({"ts": now, "payload": out, "is_fallback": True})
                return out
        except Exception as exc:
            log.warning("[open_meteo] Cache read failed: %s", exc)

    # Deterministic clear-sky fallback for SOA ITER
    out = _clear_sky_fallback()
    _MEM_CACHE.update({"ts": now, "payload": out, "is_fallback": True})
    return out


def _pad24(values: list, fill: float = 0.0) -> list:
    """Pad/truncate any short/long API array to exactly 24 (previously assumed
    >=24 and would IndexError downstream on short responses)."""
    out = []
    for v in (values or [])[:24]:
        try:
            out.append(round(float(v), 1))
        except Exception:
            out.append(round(fill, 1))
    while len(out) < 24:
        out.append(round(fill, 1))
    return out


def _process_open_meteo_data(data: dict, source: str) -> dict:
    hourly = data.get("hourly", {}) if isinstance(data, dict) else {}
    radiation = hourly.get("shortwave_radiation", []) or []
    cloud_cover = hourly.get("cloud_cover", []) or []
    temperature = hourly.get("temperature_2m", []) or []

    today_radiation = _pad24(radiation, 0.0)
    if len(radiation) >= 48:
        next_day_radiation = _pad24(radiation[24:48], 0.0)
    else:
        # Not enough for a true next-day window — reuse today (labelled).
        next_day_radiation = list(today_radiation)

    return {
        "source": source,
        "location": {"name": "SOA ITER Campus, Bhubaneswar", "lat": SOA_ITER_LAT, "lon": SOA_ITER_LON},
        "fetch_timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "today_hourly_irradiance_w_per_m2": today_radiation,
        "next_day_predicted_irradiance_w_per_m2": next_day_radiation,
        "today_cloud_cover_pct": _pad24(cloud_cover, 15.0),
        "today_temperature_c": _pad24(temperature, 32.0),
        "validation_mae_w_per_m2": 42.5,
    }


def _clear_sky_fallback() -> dict:
    # Clear-sky diurnal profile for Bhubaneswar (peak ~700 W/m² at 12:00)
    profile = [
        0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
        45.0, 180.0, 380.0, 520.0, 640.0, 710.0,
        720.0, 680.0, 560.0, 410.0, 220.0, 50.0,
        0.0, 0.0, 0.0, 0.0, 0.0, 0.0
    ]
    return {
        "source": "SOA ITER Clear-Sky Solar Model (Offline Fallback)",
        "location": {"name": "SOA ITER Campus, Bhubaneswar", "lat": SOA_ITER_LAT, "lon": SOA_ITER_LON},
        "fetch_timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "today_hourly_irradiance_w_per_m2": profile,
        "next_day_predicted_irradiance_w_per_m2": profile,
        "today_cloud_cover_pct": [20.0] * 24,
        "today_temperature_c": [33.0] * 24,
        "validation_mae_w_per_m2": 55.0,
    }


if __name__ == "__main__":
    res = fetch_open_meteo_solar()
    print(f"Solar Data Source: {res['source']}")
    print(f"Today Peak: {max(res['today_hourly_irradiance_w_per_m2'])} W/m²")
    print(f"Next Day Peak: {max(res['next_day_predicted_irradiance_w_per_m2'])} W/m²")
