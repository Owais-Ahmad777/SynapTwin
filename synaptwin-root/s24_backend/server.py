# SynapTwin - Community Energy Flexibility & Shared-Battery Digital Twin
# Copyright (c) 2026 Owais Ahmad
# Author: Owais Ahmad (https://github.com/Owais-Ahmad777)
# Licensed under the MIT License.

"""
server.py
---------
Flask REST API server for S24 Digital Twin.
Integrates:
  - Real OpenStreetMap 16-building campus geometry
  - Open-Meteo live/forecast solar radiation data for SOA ITER
  - driEV shared electric scooter fleet (Speed & Luxe tiers with realistic student commute curves)
  - Realistic Disaster Simulation (Monsoon Waterlogging, Cyclone, Electrical Fire Isolation, Outage, Heatwave)
  - Max-Min Fairness LP & Lexicographic Triage with Backup Runtime Hours & Power Redirection
  - TPCODL Odisha Commercial Time-of-Use (ToU) Tariff & Rupee (₹) Financial Optimization Engine
  - Full Energy Mix (Solar + Battery + Grid Import)
  - Baseline vs. Optimized community sharing value metrics & Carbon Offset / Tree-Equivalents
  - Official Cryptographic Audit & Fairness Compliance Certificate Endpoint (SHA-256 Ledger)
  - Cryptographic Privacy Vault (Fernet AES-128-CBC + HMAC-SHA256)
"""

import json
import hashlib
import logging
import time
import os
from datetime import datetime, date, timedelta
from functools import lru_cache
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# Load .env first (config.py calls load_dotenv). Must precede any os.environ reads.
try:
    import config as app_config
except ImportError:
    app_config = None  # type: ignore

from data.open_meteo import fetch_open_meteo_solar, get_open_meteo_status
from data.nasa_power import irradiance_to_pv_output_kw
from data.synthetic_load import real_campus_blocks, generate_all
from data.campus_geo import load_campus_buildings, to_geojson
from data.generate_multiyear_projection import generate_multiyear_projection, PROJECTED_DATA_DISCLAIMER
from explainability.gemini_explain import explain, _offline_explain
from explainability.alert_generator import generate_alerts, _offline_generate_alerts, SIMULATED_ALERT_DISCLAIMER
from optimizer.allocation import BlockState, allocate, allocate_uncoordinated_baseline
from optimizer.battery_health import BatteryHealthState, TIER_THRESHOLDS
from optimizer.disaster_triage import LocationNeed, triage_allocate
from optimizer.driev_fleet import (
    DriEVScooter,
    create_driev_fleet,
    redirect_solar_surplus_to_driev,
    get_driev_fleet_summary,
    get_hourly_driev_state,
)
from security.privacy import SecureMeterStore, block_view, admin_view

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("synaptwin.server")

# Robust static folder detection for local development and cloud production deployment (Render.com)
_default_static = Path(__file__).parent.parent / "s24_frontend" / "dist"
if not _default_static.exists():
    _alt_static = Path(__file__).parent / "dist"
    if _alt_static.exists():
        _default_static = _alt_static
_STATIC_OVERRIDE = ""
if app_config is not None:
    _STATIC_OVERRIDE = (app_config.STATIC_FOLDER_OVERRIDE or "").strip()
STATIC_DIR = _STATIC_OVERRIDE or os.environ.get("STATIC_FOLDER", str(_default_static))

app = Flask(__name__, static_folder=STATIC_DIR)
# CORS allowlist (fixes §3.4): same-origin in prod + Vite dev + Render domain.
# Override with CORS_ORIGINS env (comma-separated). `*` restores old open mode.
_CORS_DEFAULT = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5000,http://127.0.0.1:5000,https://synaptwin.onrender.com"
_CORS_RAW = (os.environ.get("CORS_ORIGINS", _CORS_DEFAULT) or "").strip()
if _CORS_RAW == "*":
    CORS(app)
    log.warning("CORS open (*) via CORS_ORIGINS — demo mode")
else:
    _CORS_ORIGINS = [o.strip() for o in _CORS_RAW.split(",") if o.strip()]
    CORS(app, origins=_CORS_ORIGINS)
    log.info("CORS allowlist: %s", _CORS_ORIGINS)

# Live LLM per-hour is OFF by default (fixes §4.2: up to 48 sequential Gemini
# calls per request → gunicorn 120s timeout). Hourly loop uses deterministic
# offline explainers; set ENABLE_LIVE_LLM_PER_HOUR=true to restore old behaviour.
_ENABLE_LIVE_LLM_PER_HOUR = (os.environ.get("ENABLE_LIVE_LLM_PER_HOUR", "false") or "").strip().lower() in ("true", "1", "yes")

# Optional API-key auth (fixes §3.1 without breaking open demo): if API_KEY env
# is set, sim/privacy/audit endpoints require `X-API-Key` or `?api_key=`.
_API_KEY_REQUIRED = (os.environ.get("API_KEY", "") or "").strip()

# Simple in-memory rate limiter (fixes §3.4): 120 sim requests / 60s / IP.
# Disabled if RATE_LIMIT_PER_MINUTE=0. Privacy/audit lighter paths share it.
try:
    _RATE_LIMIT_PER_MINUTE = int((os.environ.get("RATE_LIMIT_PER_MINUTE", "120") or "120").strip())
except ValueError:
    _RATE_LIMIT_PER_MINUTE = 120
_RATE_BUCKETS: dict[str, list[float]] = {}

# Simulation result cache (fixes §4.1 partial): 5-min TTL keyed by scenario
# params, so repeated sandbox scrubs/alert polls don't re-run 24h + 48 LPs.
_SIM_CACHE: dict[str, tuple[float, dict]] = {}
_SIM_CACHE_TTL_SEC = float((os.environ.get("SIM_CACHE_TTL_SEC", "300") or "300").strip() or 300)


def _client_ip() -> str:
    try:
        return (request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
                or request.remote_addr or "unknown")
    except Exception:
        return "unknown"


def _check_auth_and_rate(limit_group: str = "sim") -> tuple[bool, tuple | None]:
    if _API_KEY_REQUIRED:
        provided = (request.headers.get("X-API-Key", "") or request.args.get("api_key", "") or "").strip()
        if provided != _API_KEY_REQUIRED:
            return False, (jsonify({"error": "Unauthorized — valid X-API-Key required"}), 401)
    if _RATE_LIMIT_PER_MINUTE and _RATE_LIMIT_PER_MINUTE > 0 and limit_group:
        now = time.time()
        key = f"{limit_group}:{_client_ip()}"
        window = _RATE_BUCKETS.get(key, [])
        window = [t for t in window if now - t < 60.0]
        if len(window) >= _RATE_LIMIT_PER_MINUTE:
            return False, (jsonify({"error": "Rate limit exceeded — slow down (120/min)"}), 429)
        window.append(now)
        _RATE_BUCKETS[key] = window
    return True, None


def _sim_cache_key(payload: dict) -> str:
    try:
        return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()
    except Exception:
        return ""

BASE_DIR = Path(__file__).parent
BATTERY_RATED_POWER_KW = 120.0
BATTERY_RATED_CAPACITY_KWH = 360.0
GRID_CO2_KG_PER_KWH = 0.82

# Lazy campus blocks (fixes §4.5: previously built at import, so a missing OSM
# file broke collection/import instead of just the requesting endpoint).
_BLOCKS_CACHE: list | None = None
_FEEDER_CACHE: dict | None = None


def _get_blocks_and_feeders():
    global _BLOCKS_CACHE, _FEEDER_CACHE
    if _BLOCKS_CACHE is None or _FEEDER_CACHE is None:
        _BLOCKS_CACHE = real_campus_blocks()
        _FEEDER_CACHE = {b.name: round(max(b.peak_kw * 1.3, 30), 1) for b in _BLOCKS_CACHE}
    return _BLOCKS_CACHE, _FEEDER_CACHE


# Backward-compat aliases (same names as before, resolved lazily on first use).
class _LazyBlocks(list):
    def __init__(self):
        self._resolved = False
    def _ensure(self):
        if not self._resolved:
            blocks, _ = _get_blocks_and_feeders()
            list.extend(self, blocks)
            self._resolved = True
    def __iter__(self):
        self._ensure()
        return list.__iter__(self)
    def __len__(self):
        self._ensure()
        return list.__len__(self)

class _LazyFeeders(dict):
    def __init__(self):
        self._resolved = False
    def _ensure(self):
        if not self._resolved:
            _, feeders = _get_blocks_and_feeders()
            dict.update(self, feeders)
            self._resolved = True
    def __getitem__(self, k):
        self._ensure()
        return dict.__getitem__(self, k)
    def get(self, k, d=None):
        self._ensure()
        return dict.get(self, k, d)
    def __contains__(self, k):
        self._ensure()
        return dict.__contains__(self, k)

DEFAULT_BLOCKS = _LazyBlocks()
FEEDER_LIMITS_KW = _LazyFeeders()


def get_tou_tariff(hour: int) -> float:
    """
    TPCODL / OERC Odisha Commercial Time-of-Use (ToU) Tariff:
      - Peak Hours (18:00 - 22:00): ₹8.50 / kWh
      - Normal / Daytime (06:00 - 18:00): ₹6.80 / kWh
      - Off-Peak / Night (22:00 - 06:00): ₹4.50 / kWh
    """
    if 18 <= hour < 22:
        return 8.50
    elif 6 <= hour < 18:
        return 6.80
    else:
        return 4.50


def is_building_isolated(b_name: str, target_name: str | None) -> bool:
    """Exact-ish match for fire isolation. Previously `t in b or b in t` meant a
    generic target like 'Block' matched EVERYTHING. Now short/generic targets
    never match, and hostel numbers must agree."""
    if not target_name or not b_name:
        return False
    b_low = b_name.lower().strip()
    t_low = target_name.lower().strip()
    if b_low == t_low:
        return True
    # Guard: targets shorter than 4 chars (e.g. "Block", "Lab") are too generic.
    if len(t_low) < 4:
        return False
    if "hostel" in b_low or "hostel" in t_low:
        # Both must mention hostel AND agree on number if a number is given.
        if "hostel" not in b_low or "hostel" not in t_low:
            return False
        for num in ["1", "2", "7"]:
            if num in t_low:
                return num in b_low
        # No number in target: only exact/contains with hostel context.
        return t_low in b_low
    for letter in ["a", "c", "d", "e", "f", "g", "s"]:
        block_pattern = f"{letter}-block"
        if block_pattern in t_low:
            return block_pattern in b_low
    # Fallback: require the longer string to contain the shorter one AND the
    # match to be at least 6 chars to avoid "lib" matching "library" accidents.
    if len(t_low) >= 6 and t_low in b_low:
        return True
    if len(b_low) >= 6 and b_low in t_low:
        return True
    return False


def _safe_int(v, default: int, lo: int | None = None, hi: int | None = None) -> int:
    try:
        iv = int(float(v))
    except (TypeError, ValueError):
        return default
    if lo is not None:
        iv = max(lo, iv)
    if hi is not None:
        iv = min(hi, iv)
    return iv


def _safe_float(v, default: float, lo: float | None = None, hi: float | None = None) -> float:
    try:
        fv = float(v)
    except (TypeError, ValueError):
        return default
    if lo is not None:
        fv = max(lo, fv)
    if hi is not None:
        fv = min(hi, fv)
    return fv


def _parse_outage_hours(raw, default=(19, 20, 21)) -> list[int]:
    if raw is None:
        return list(default)
    if isinstance(raw, str):
        parts = [p.strip() for p in raw.split(",") if p.strip() != ""]
        out = []
        for p in parts:
            try:
                h = int(float(p))
                if 0 <= h <= 23:
                    out.append(h)
            except (ValueError, TypeError):
                continue
        return sorted(set(out))
    if isinstance(raw, (list, tuple, set)):
        out = []
        for p in raw:
            try:
                h = int(float(p))  # type: ignore
                if 0 <= h <= 23:
                    out.append(h)
            except (ValueError, TypeError):
                continue
        return sorted(set(out))
    return list(default)


DEFAULT_DISASTER_WINDOWS = {
    "cyclone_severe_storm": {"start": 12, "end": 22, "causes_outage": True, "label": "Cyclone Disconnect Window"},
    "grid_transformer_fault": {"start": 12, "end": 15, "causes_outage": True, "label": "Transformer Fault Repair Window"},
    "extended_outage": {"start": 12, "end": 15, "causes_outage": True, "label": "Feeder Outage Repair Window"},
    "electrical_fire": {"start": 11, "end": 13, "causes_outage": True, "label": "Fire Clearance Window"},
    "monsoon_waterlogging": {"start": 17, "end": 22, "causes_outage": True, "label": "Monsoon Downpour Window"},
    "heatwave_stress": {"start": 11, "end": 16, "causes_outage": False, "label": "Peak AC Heatwave Window"},
}


def execute_simulation(
    outage_hours: list[int] | None = None,
    disaster_type: str = "none",
    is_disaster_active: bool = False,
    isolated_block: str | None = None,
    hazard_hour: int = 20,
    battery_soh_pct: float | None = None,
    days_in_service: int = 200,
    driev_emergency_opt_in_count: int = 8,
    solar_multiplier: float = 1.0,
    load_multiplier: float = 1.0,
    block_load_overrides: dict | None = None,
    day_name: str = "Mon",
    day_type: str = "weekday",
    cyclone_start_hour: int | None = None,
    cyclone_end_hour: int | None = None,
    disaster_start_hour: int | None = None,
    disaster_end_hour: int | None = None,
    enable_live_llm: bool | None = None,
) -> dict:
    """
    Executes a 24-hour simulation with full energy mix, Open-Meteo weather data,
    driEV scooter fleet, TPCODL ToU tariffs, and realistic disaster scenarios.
    All numeric inputs are clamped to safe ranges (previously unvalidated —
    strings/negatives/huge multipliers caused 500s).
    enable_live_llm: None → env ENABLE_LIVE_LLM_PER_HOUR; False (default) uses
    deterministic offline explainers in the hourly loop (fixes 48 live calls).
    """
    outage_hours = _parse_outage_hours(outage_hours, default=(19, 20, 21))
    block_load_overrides = block_load_overrides or {}
    # Sanitise multipliers / counters defensively (direct python callers bypass endpoints).
    try:
        solar_multiplier = max(0.0, min(3.0, float(solar_multiplier)))
    except (TypeError, ValueError):
        solar_multiplier = 1.0
    try:
        load_multiplier = max(0.0, min(3.0, float(load_multiplier)))
    except (TypeError, ValueError):
        load_multiplier = 1.0
    try:
        days_in_service = max(0, min(3000, int(days_in_service)))
    except (TypeError, ValueError):
        days_in_service = 200
    try:
        driev_emergency_opt_in_count = max(0, min(12, int(driev_emergency_opt_in_count)))
    except (TypeError, ValueError):
        driev_emergency_opt_in_count = 8
    try:
        hazard_hour = max(0, min(23, int(hazard_hour)))
    except (TypeError, ValueError):
        hazard_hour = 20
    if battery_soh_pct is not None:
        try:
            battery_soh_pct = max(0.0, min(100.0, float(battery_soh_pct)))
        except (TypeError, ValueError):
            battery_soh_pct = None
    if enable_live_llm is None:
        enable_live_llm = _ENABLE_LIVE_LLM_PER_HOUR

    # Check if disaster is active
    if disaster_type in (None, "none", "normal", "") or not is_disaster_active:
        disaster_type = "none"
        is_disaster_active = False

    # Resolve disaster window bounds from defaults or operator inputs
    default_win = DEFAULT_DISASTER_WINDOWS.get(disaster_type, {"start": 12, "end": 22, "causes_outage": True, "label": "Disaster Window"})
    
    if disaster_start_hour is not None:
        d_start = disaster_start_hour
    elif cyclone_start_hour is not None and disaster_type == "cyclone_severe_storm":
        d_start = cyclone_start_hour
    else:
        d_start = default_win["start"]
        
    if disaster_end_hour is not None:
        d_end = disaster_end_hour
    elif cyclone_end_hour is not None and disaster_type == "cyclone_severe_storm":
        d_end = cyclone_end_hour
    else:
        d_end = default_win["end"]

    d_start = max(0, min(23, int(d_start)))
    d_end = max(d_start, min(23, int(d_end)))
    c_start = d_start
    c_end = d_end

    causes_outage = default_win.get("causes_outage", True)
    disaster_persistent_hours = set(range(d_start, d_end + 1)) if (is_disaster_active and disaster_type != "none" and causes_outage) else set()
    cyclone_persistent_hours = disaster_persistent_hours if disaster_type == "cyclone_severe_storm" else set()

    # Combined Outage Set: Union of operator manual hour toggles and disaster persistent islanding
    outage_set = set(outage_hours) | disaster_persistent_hours

    # 1. Weather Data (Open-Meteo) & Disaster Physics Overrides
    weather = fetch_open_meteo_solar()
    today_irradiance = weather.get("today_hourly_irradiance_w_per_m2", [0.0] * 24) or [0.0] * 24
    # Guard against short arrays (previously assumed exactly 24 → IndexError).
    if len(today_irradiance) < 24:
        today_irradiance = list(today_irradiance) + [0.0] * (24 - len(today_irradiance))
    else:
        today_irradiance = list(today_irradiance[:24])
    effective_load_mult = load_multiplier

    # Hourly solar irradiance multiplier based on active disaster and time window:
    # Weather-related disasters (cyclone, monsoon) physically dim irradiance via clouds.
    # Grid & electrical equipment faults (transformer explosion, fire, feeder fault) DO NOT dim the sun!
    hourly_solar_mult = []
    for h in range(24):
        if is_disaster_active:
            if disaster_type == "cyclone_severe_storm":
                # Dense squall clouds (-90% solar) specifically during cyclone active window (d_start..d_end)
                mult = (solar_multiplier * 0.10) if (d_start <= h <= d_end) else (solar_multiplier * 1.0)
            elif disaster_type == "monsoon_waterlogging":
                # Monsoon rain and dense overcast (-70% solar) strictly during downpour window (d_start..d_end)
                mult = (solar_multiplier * 0.30) if (d_start <= h <= d_end) else (solar_multiplier * 1.0)
            elif disaster_type == "heatwave_stress":
                # High clear-sky solar irradiance (+5%) during thermal peak window (d_start..d_end)
                mult = (solar_multiplier * 1.05) if (d_start <= h <= d_end) else (solar_multiplier * 1.0)
            else:
                # Equipment & electrical faults (grid_transformer_fault, extended_outage, electrical_fire):
                # Rooftop solar generation is 100% unaffected by equipment faults (normal clear-sky output)!
                mult = solar_multiplier * 1.0
        else:
            mult = solar_multiplier * 1.0
        hourly_solar_mult.append(mult)

    # 2. Base Load Curves with realistic diurnal shapes
    campus_blocks = real_campus_blocks()
    base_load_curves = generate_all(campus_blocks, day_name=day_name, day_type=day_type)
    feeder_limits = {b.name: round(max(b.peak_kw * 1.3, 30), 1) for b in campus_blocks}

    load_curves = {}
    for name, curve in base_load_curves.items():
        if name in block_load_overrides:
            override_val = float(block_load_overrides[name])
            load_curves[name] = [round(override_val, 2)] * 24
        else:
            if is_disaster_active and disaster_type == "heatwave_stress":
                load_curves[name] = [
                    round(val * ((load_multiplier * 1.35) if (d_start <= h <= d_end) else (load_multiplier * 1.0)), 2)
                    for h, val in enumerate(curve)
                ]
            else:
                load_curves[name] = [round(val * load_multiplier, 2) for val in curve]

    # 3. Solar PV Generation Curves with dynamic hourly solar multiplier
    pv_curves = {
        b.name: [
            round(val * hourly_solar_mult[h], 2)
            for h, val in enumerate(irradiance_to_pv_output_kw(today_irradiance, panel_kwp=b.solar_kwp))
        ]
        for b in campus_blocks
    }

    # If electrical fire isolation scenario is active, isolate selected building completely (load & solar = 0 kW)
    isolated_block_name = isolated_block or "C-Block (Academic)"
    # Preserve pre-isolation load for honest redirect accounting (previously read
    # back zeroed curves, so redirect was always 0).
    isolated_original_load: dict[str, list[float]] = {}
    if is_disaster_active and disaster_type == "electrical_fire":
        for name in load_curves:
            if is_building_isolated(name, isolated_block_name):
                isolated_original_load[name] = list(load_curves[name])
                load_curves[name] = [0.0] * 24
        for name in pv_curves:
            if is_building_isolated(name, isolated_block_name):
                pv_curves[name] = [0.0] * 24

    # 4. Battery State
    battery = BatteryHealthState(
        rated_capacity_kwh=BATTERY_RATED_CAPACITY_KWH,
        rated_power_kw=BATTERY_RATED_POWER_KW,
    )
    if battery_soh_pct is not None:
        battery.soh_pct = max(0.0, min(100.0, float(battery_soh_pct)))
        battery.days_in_service = days_in_service
        battery.total_equivalent_cycles = days_in_service * (200.0 / (2 * BATTERY_RATED_CAPACITY_KWH))
    else:
        for _ in range(days_in_service):
            battery.record_day_cycling(200.0)

    battery_status = battery.status_report()
    # Stateful fleet template (SOC persists across hours via applied deltas).
    # Hourly schedule still drives status (charging/ride), but surplus/V2G now
    # mutate THIS fleet instead of a dead object (fixes §1.9).
    driev_fleet = create_driev_fleet(emergency_opt_in_count=driev_emergency_opt_in_count)
    driev_initial_summary = get_driev_fleet_summary(driev_fleet)

    def _fleet_for_hour(state: dict) -> list:
        """Rebuild live objects from deterministic hourly schedule, carrying
        forward persistent SOC from driev_fleet where IDs match."""
        soc_by_id = {s.id: s.soc_pct for s in driev_fleet}
        fleet: list = []
        for sd in state.get("scooters", []):
            fleet.append(DriEVScooter(
                id=sd["id"], tier=sd["tier"],
                battery_capacity_kwh=sd["capacity_kwh"],
                soc_pct=round(soc_by_id.get(sd["id"], sd["soc_pct"]), 1),
                charger_power_kw=sd["charger_kw"],
                status=sd["status"],
                emergency_buffer_opt_in=sd["emergency_opt_in"],
            ))
        return fleet

    def _commit_fleet(fleet: list) -> None:
        by_id = {s.id: s.soc_pct for s in fleet}
        for s in driev_fleet:
            if s.id in by_id:
                s.soc_pct = by_id[s.id]

    hourly_results = []
    total_solar_generated_kwh = 0.0
    total_battery_dispatched_kwh = 0.0
    total_grid_imported_kwh = 0.0
    total_uncoordinated_grid_import_kwh = 0.0
    total_naive_grid_import_kwh = 0.0
    total_naive_cost_inr = 0.0
    total_baseline_cost_inr = 0.0
    total_optimized_cost_inr = 0.0
    total_demand_kwh_day = 0.0

    # SoC tracker: previously backup_runtime used FULL usable_kwh every hour
    # (no depletion). Now we track remaining energy across the day, recharged
    # by solar surplus, drained by dispatch.
    usable_battery_kwh_full = float(battery_status.get("usable_capacity_kwh", 287.3))
    battery_remaining_kwh = usable_battery_kwh_full
    # Life-safety (triage Tier-1 slices: medical/server/sump/shelter) energy
    # accounting over ISLANDED hours only — the honest denominator for Tier-1 %.
    # (Block critical_kw is broader: all-building 12% essential; triage Tier-1
    # is the life-safety subset. Previously the audit mixed the two.)
    tier1_demand_island_kwh = 0.0
    tier1_served_island_kwh = 0.0

    # 24-Hour Simulation Loop
    for h in range(24):
        # Heatwave: critical (AC-driven) surges with total load (previously
        # critical used only load_multiplier, so +35% never stressed Tier-1).
        _hw_factor = ((load_multiplier * 1.35) if (is_disaster_active and disaster_type == "heatwave_stress"
                                                    and d_start <= h <= d_end) else (load_multiplier * 1.0))
        blocks_state = [
            BlockState(
                name=b.name,
                load_kw=load_curves[b.name][h],
                solar_kw=pv_curves[b.name][h],
                critical_kw=round(min(b.critical_kw * _hw_factor, load_curves[b.name][h]), 2),
                feeder_limit_kw=feeder_limits[b.name],
            )
            for b in campus_blocks
        ]
        is_outage = h in outage_set
        hourly_tariff = get_tou_tariff(h)

        # Calculate solar surplus & dynamic scooter state
        solar_surplus = sum(max(pv_curves[b.name][h] - load_curves[b.name][h], 0.0) for b in campus_blocks)
        hourly_driev_state = get_hourly_driev_state(
            hour=h,
            is_outage=is_outage,
            emergency_opt_in_count=driev_emergency_opt_in_count,
            surplus_kw=solar_surplus,
        )

        # TWO baselines, explicitly separated (bug-report §2.2 was right that one
        # number can't serve both stories):
        #  (a) Financial headline = vs GRID-ONLY campus (own solar, NO shared
        #      battery). This is the investment case: "why buy a shared BESS +
        #      orchestration at all". Deficit-based, so curtailed surplus solar
        #      is never counted as served.
        #  (b) Scenario Run A = owns the SAME battery but splits it naively
        #      (equal parts, no sharing smarts). Its grid is tracked separately
        #      for the Run-A/Run-B table; the orchestration edge alone is small
        #      in kWh (its value is fairness + Tier-1 protection, not rupees).
        _deficit_h = sum(max(b.load_kw - b.solar_kw, 0.0) for b in blocks_state)
        _base_batt = float(battery_status.get("available_power_kw", BATTERY_RATED_POWER_KW))
        _base_batt = min(BATTERY_RATED_POWER_KW, max(0.0, _base_batt))
        try:
            _run_a_h = allocate_uncoordinated_baseline(blocks_state, _base_batt)
            _naive_used_h = float(sum(_run_a_h.get("allocations", {}).values()))
        except Exception:
            _naive_used_h = 0.0
        uncoordinated_deficit = round(_deficit_h, 2)
        total_uncoordinated_grid_import_kwh += uncoordinated_deficit
        total_baseline_cost_inr += uncoordinated_deficit * hourly_tariff
        _naive_grid_h = max(0.0, round(_deficit_h - _naive_used_h, 2))
        total_naive_grid_import_kwh += _naive_grid_h
        total_naive_cost_inr += _naive_grid_h * hourly_tariff

        # Triage only inside the actual disaster/outage window (previously ANY
        # active disaster forced all 24h into triage, draining the battery all
        # night before a noon cyclone even arrived).
        _in_window = (is_disaster_active and disaster_type not in ("none", None, "")
                      and d_start <= h <= d_end)
        is_emergency_triage_hour = bool(is_outage or (h in disaster_persistent_hours) or _in_window)

        if is_emergency_triage_hour:
            # Full SoH-derated power offered every hour (demo mode: Tier-1 holds
            # across the whole island window). Energy-rationing across hours was
            # trialled and reverted per operator preference — remaining_kwh below
            # is tracked for the runtime display only, not enforced on dispatch.
            # Scooter buffer is separate (own batteries).
            _main_power = float(battery_status.get("available_power_kw", 84.0) or 0.0)
            outage_battery_kw = round(max(0.0, _main_power), 1)
            scooter_buffer_kw = hourly_driev_state.get("emergency_buffer_available_kw", 3.2)
            total_backup_kw = round(outage_battery_kw + scooter_buffer_kw, 1)

            # Location needs for specific disaster or outage
            locations = []
            
            # Tier 1 Critical Life-Safety & Essential Emergency Facilities (mapped explicitly to host campus buildings)
            medical_deficit = 6.0 if disaster_type == "cyclone_severe_storm" else 3.0
            locations.append(LocationNeed(
                name="ITER Administrative Block (Campus Medical Point)",
                tier=1,
                deficit_kw=medical_deficit,
                feeder_limit_kw=10.0,
                need_score=1.0,
                reported_hazard="Campus Emergency Medical Point active",
            ))
            locations.append(LocationNeed(
                name="Centre for Data Science (Campus Server/Comms Room)",
                tier=1,
                deficit_kw=5.0,
                feeder_limit_kw=10.0,
                need_score=1.0,
                reported_hazard="Campus SCADA Telemetry & Comms Hub active",
            ))
            
            # Cyclone Shelter-in-Place Protection across ALL Residential Hostels (Hostel 1, 2, 7).
            # Capped by each block's real deficit — own solar covers first, so a
            # midday-surplus hostel needs no backup for shelter load.
            if is_disaster_active and disaster_type == "cyclone_severe_storm":
                for b in blocks_state:
                    if "hostel" in b.name.lower() and b.load_kw > 0.0:
                        hostel_shelter_kw = min(b.critical_kw, b.deficit_kw)
                        locations.append(LocationNeed(
                            name=f"{b.name} (Shelter-in-Place)",
                            tier=1,
                            deficit_kw=hostel_shelter_kw,
                            feeder_limit_kw=feeder_limits[b.name],
                            need_score=0.98,
                            reported_hazard=f"Cyclone Warning: Students sheltering in place in {b.name}",
                        ))
                # Auditorium as secondary staff/overflow emergency lighting (minimal Tier-1 load)
                auditorium_block = next((b for b in blocks_state if "auditorium" in b.name.lower()), None)
                if auditorium_block and auditorium_block.load_kw > 0.0:
                    locations.append(LocationNeed(
                        name="Bansuri Guru Auditorium (Staff/Overflow Shelter)",
                        tier=1,
                        deficit_kw=min(4.0, auditorium_block.critical_kw, auditorium_block.deficit_kw),
                        feeder_limit_kw=15.0,
                        need_score=0.90,
                        reported_hazard="Staff & Visitor Overflow Shelter active",
                    ))

            # Monsoon Flooding: Tier-1 Basement Sump Pump Protection across ALL Residential Hostels (Hostel 1, 2, 7).
            # Capped by real deficit (own solar covers first).
            if is_disaster_active and disaster_type == "monsoon_waterlogging":
                for b in blocks_state:
                    if "hostel" in b.name.lower() and b.load_kw > 0.0:
                        sump_kw = min(6.0, b.critical_kw, b.deficit_kw) if "hostel 7" in b.name.lower() else min(4.0, b.critical_kw, b.deficit_kw)
                        locations.append(LocationNeed(
                            name=f"{b.name} (Basement Sump Pump)",
                            tier=1,
                            deficit_kw=sump_kw,
                            feeder_limit_kw=10.0,
                            need_score=0.98,
                            reported_hazard=f"Monsoon Flood: Basement drainage sump active for {b.name}",
                        ))

            # Tier 2 & Tier 3 Blocks
            for b in blocks_state:
                is_isolated = bool(is_disaster_active and disaster_type == "electrical_fire" and is_building_isolated(b.name, isolated_block_name))
                if is_isolated:
                    continue

                hazard = None
                need = 0.5
                
                if is_disaster_active and disaster_type == "monsoon_waterlogging":
                    if "hostel" in b.name.lower():
                        hazard = f"Monsoon Flood: Resident dorm critical corridor/lighting for {b.name}"
                        need = 0.85
                    elif "library" in b.name.lower():
                        hazard = "Monsoon Flood: Library study center secondary backup"
                        need = 0.70
                    else:
                        need = 0.60
                elif is_disaster_active and disaster_type == "cyclone_severe_storm":
                    need = 0.50
                elif is_disaster_active and disaster_type == "heatwave_stress":
                    need = 0.75

                # Adjust essential deficit if sump or shelter was already served in Tier 1.
                # Hard-capped by the block's real deficit: a solar-surplus block
                # needs ZERO backup even for essential load (previously Tier-2
                # was invented for surplus blocks, inflating triage dispatch
                # beyond battery availability in sunny hours).
                essential_deficit = b.critical_kw
                if is_disaster_active and disaster_type == "monsoon_waterlogging" and "hostel" in b.name.lower():
                    sump_kw = min(6.0, b.critical_kw) if "hostel 7" in b.name.lower() else min(4.0, b.critical_kw)
                    essential_deficit = max(0.0, b.critical_kw - sump_kw)
                elif is_disaster_active and disaster_type == "cyclone_severe_storm":
                    if "hostel" in b.name.lower():
                        essential_deficit = 0.0  # Hostels fully served in Tier 1 Shelter-in-Place
                    elif "auditorium" in b.name.lower():
                        essential_deficit = max(0.0, b.critical_kw - 4.0)
                essential_deficit = min(essential_deficit, b.deficit_kw)

                if essential_deficit > 0.0 and b.load_kw > 0.0:
                    locations.append(LocationNeed(
                        name=f"{b.name} (essential)",
                        tier=2,
                        deficit_kw=essential_deficit,
                        feeder_limit_kw=feeder_limits[b.name],
                        need_score=need,
                        reported_hazard=hazard,
                    ))

                if b.flexible_deficit_kw > 0.0 and b.load_kw > 0.0:
                    locations.append(LocationNeed(
                        name=f"{b.name} (flexible)",
                        tier=3,
                        deficit_kw=b.flexible_deficit_kw,
                        feeder_limit_kw=feeder_limits[b.name],
                        need_score=0.4,
                    ))

            # Tier 4: driEV Charging Bay
            scooter_charging_demand = hourly_driev_state.get("charging_bay_demand_kw", 0.0) if disaster_type != "cyclone_severe_storm" else 0.0
            locations.append(LocationNeed(
                name="driEV Charging Bay",
                tier=4,
                deficit_kw=scooter_charging_demand,
                feeder_limit_kw=10.0,
                need_score=0.1,
            ))

            # No cross-hour energy reservation (reverted): full backup offered each
            # hour so Tier-1 holds across the whole island window (demo mode).
            battery_reserved_kwh = 0.0
            triage = triage_allocate(locations, battery_available_kw=total_backup_kw)

            # Aggregate triage locations back to buildings by LONGEST prefix match
            # (previously `startswith or in` could double-count across similar
            # names, e.g. Hostel 1 vs Hostel 7 substrings).
            _sorted_blocks = sorted([b.name for b in blocks_state], key=len, reverse=True)
            block_alloc = {b.name: 0.0 for b in blocks_state}
            for loc_name, alloc in triage.allocation_kw.items():
                matched = None
                for bn in _sorted_blocks:
                    if loc_name == bn or loc_name.startswith(bn + " ") or loc_name.startswith(bn + " ("):
                        matched = bn
                        break
                if matched is None:
                    # Non-building locations (Medical Point, Server Room, driEV Bay)
                    # are intentionally NOT attributed to a single block.
                    continue
                block_alloc[matched] = round(block_alloc[matched] + alloc, 2)

            # In Heatwave mode, dispatch maximum available battery output for peak-shaving.
            # Recompute tier flags so they don't go stale (previously overwritten
            # alloc but left tier_fully_served from triage).
            if is_disaster_active and disaster_type == "heatwave_stress" and not is_outage:
                peak_shave_avail = min(float(battery_status.get("available_power_kw", 84.0)), total_backup_kw)
                total_active_deficit = sum(b.deficit_kw for b in blocks_state if b.load_kw > 0)
                if total_active_deficit > 0:
                    for b in blocks_state:
                        if b.load_kw > 0 and b.deficit_kw > 0:
                            block_alloc[b.name] = round((b.deficit_kw / total_active_deficit) * peak_shave_avail, 2)
                        else:
                            block_alloc[b.name] = 0.0
                    triage.battery_used_kw = round(sum(block_alloc.values()), 2)
                    # Peak-shave is proportional, not tier-guaranteed: mark honestly.
                    triage.tier_fully_served = {1: True, 2: False, 3: False, 4: False}
                    triage.narrative += (
                        f" Heatwave peak-shaving: {peak_shave_avail:.1f} kW spread proportionally "
                        f"across {sum(1 for b in blocks_state if b.deficit_kw > 0)} deficit blocks."
                    )

            # Life-safety energy: triage serves Tier-1 first, so when the flag is
            # True the slice demand was fully met; else everything dispatched
            # that hour went to (partial) Tier-1.
            if is_outage:
                _t1d = round(sum(l.deficit_kw for l in locations if l.tier == 1), 2)
                tier1_demand_island_kwh += _t1d
                _t1flag = bool(triage.tier_fully_served.get(1, triage.tier_fully_served.get("1", False)))
                tier1_served_island_kwh += _t1d if _t1flag else min(_t1d, float(triage.battery_used_kw or 0.0))

            total_demand_this_hour = sum(b.load_kw for b in blocks_state)
            total_solar_this_hour = sum(b.solar_kw for b in blocks_state)
            battery_used_this_hour = triage.battery_used_kw
            grid_import_this_hour = 0.0 if is_outage else max(0.0, round(total_demand_this_hour - total_solar_this_hour - battery_used_this_hour, 2))
            total_optimized_cost_inr += grid_import_this_hour * hourly_tariff

            # Backup runtime from TRACKED remaining energy (previously full
            # usable_kwh every hour, implying infinite energy).
            total_critical_draw = sum(loc.deficit_kw for loc in locations if loc.tier in (1, 2))
            backup_runtime_hours = round(max(0.0, battery_remaining_kwh) / max(0.5, total_critical_draw), 1)
            backup_runtime_text = (
                f"Battery can sustain Tier-1/2 critical loads for ~{backup_runtime_hours} more hours "
                f"at current draw ({max(0.0, battery_remaining_kwh):.0f} kWh remaining of "
                f"{usable_battery_kwh_full:.0f} kWh usable)"
            )

            # Isolated Building Power Redirection — computed from actual isolated
            # load that was removed (previously hardcoded 18.4 kW).
            isolated_redirect_kw = 0.0
            power_redirect_narrative = ""
            if is_disaster_active and disaster_type == "electrical_fire":
                try:
                    iso_load = sum(
                        isolated_original_load.get(n, [0.0] * 24)[h]
                        if n in isolated_original_load else 0.0
                        for n in load_curves
                    )
                    # Redirect = min(isolated load freed, battery actually dispatched).
                    isolated_redirect_kw = round(min(iso_load, float(triage.battery_used_kw)), 1)
                except Exception:
                    isolated_redirect_kw = 0.0
                if isolated_redirect_kw > 0.01:
                    power_redirect_narrative = (
                        f"+{isolated_redirect_kw} kW redirected from fire-isolated "
                        f"{isolated_block_name} to other deficit buildings."
                    )

            full_explanation = triage.narrative
            if power_redirect_narrative:
                full_explanation = f"{power_redirect_narrative} {full_explanation}"

            _peak_avail_txt = f"{float(battery_status.get('available_power_kw', 84.0)):.1f}"
            disaster_details_obj = {
                "type": disaster_type,
                "active": is_disaster_active,
                "trigger_description": (
                    f"Heavy torrential monsoon downpour and water table surge (Hours {d_start}–{d_end}). Groundwater pumps active across Hostels 1, 2, and 7." if disaster_type == "monsoon_waterlogging" else
                    (f"Pre-emptive 11kV utility grid disconnect due to 120 km/h squall winds (Hours {d_start}–{d_end}). Hostel blocks (1, 2, 7) prioritized for in-place student shelter." if disaster_type == "cyclone_severe_storm" else
                    (f"Electrical fire detected in {isolated_block_name}. Main electrical riser isolated (0 kW) during safety clearance (Hours {d_start}–{d_end}) with +{isolated_redirect_kw:.1f} kW clean power redirected." if disaster_type == "electrical_fire" else
                    (f"Catastrophic 11kV/415V substation transformer failure. Islanded microgrid mode active during emergency repair window (Hours {d_start}–{d_end}). Solar generation unaffected." if disaster_type in ("grid_transformer_fault", "extended_outage") else
                    (f"Ambient temperature 44°C causing +35% campus AC chiller demand surge (Hours {d_start}–{d_end}). Grid connected; battery engaged in {_peak_avail_txt} kW peak-shaving." if disaster_type == "heatwave_stress" else "Routine operations."))))
                ),
                "hotspot_building": (
                    "ITER Hostels 1, 2 & 7 (Basement Drainage Pumps, Need Score: 0.98)" if disaster_type == "monsoon_waterlogging" else
                    ("Hostel blocks (1, 2, 7) — students sheltering in place per advance cyclone warning" if disaster_type == "cyclone_severe_storm" else
                    (f"{isolated_block_name} (Fire Isolated, 0 kW Load)" if disaster_type == "electrical_fire" else
                    ("Campus Server & Medical Point (Islanded Microgrid Emergency Defense)" if disaster_type in ("grid_transformer_fault", "extended_outage") else
                    (f"All Hostels & Academic Blocks (+35% Thermal AC Surge, {_peak_avail_txt} kW Battery Shave)" if disaster_type == "heatwave_stress" else "None"))))
                ),
                "solar_impact_text": (
                    "-70% (Monsoon Overcast)" if disaster_type == "monsoon_waterlogging" else
                    ("-90% (Cyclone Squall Clouds)" if disaster_type == "cyclone_severe_storm" else
                    ("+5% (Peak Summer Irradiance)" if disaster_type == "heatwave_stress" else
                    "0% (Normal Clear-Sky — Equipment Fault Only)"))
                ),
                "load_impact_text": (
                    "+35% AC Chiller Surge" if disaster_type == "heatwave_stress" else
                    ("Basement Sump Pumps Active (Hostels 1, 2, 7)" if disaster_type == "monsoon_waterlogging" else
                    ("Hostel Shelter-in-Place & Trauma Load Active" if disaster_type == "cyclone_severe_storm" else
                    "Normal Diurnal Curve"))
                ),
                "grid_state_text": (
                    f"🚨 ISLANDED (TRANSFORMER REPAIR {d_start}-{d_end}h)" if (is_disaster_active and disaster_type in ("grid_transformer_fault", "extended_outage") and h in disaster_persistent_hours) else
                    (f"🚨 ISLANDED (CYCLONE DISCONNECT {d_start}-{d_end}h)" if (is_disaster_active and disaster_type == "cyclone_severe_storm" and h in disaster_persistent_hours) else
                    (f"🚨 ISLANDED (MONSOON FLOOD DISCONNECT {d_start}-{d_end}h)" if (is_disaster_active and disaster_type == "monsoon_waterlogging" and h in disaster_persistent_hours) else
                    (f"🚨 SAFETY ISOLATION ({isolated_block_name} {d_start}-{d_end}h)" if (is_disaster_active and disaster_type == "electrical_fire" and h in disaster_persistent_hours) else
                    ("🚨 MANUAL OPERATOR POWER CUT" if is_outage else "⚡ GRID CONNECTED"))))
                ),
                "disaster_persistent_islanding": bool(is_disaster_active and h in disaster_persistent_hours),
                "cyclone_persistent_islanding": bool(is_disaster_active and disaster_type == "cyclone_severe_storm" and h in cyclone_persistent_hours),
                "is_mid_disaster_window": bool(is_disaster_active and d_start <= h <= d_end),
                "disaster_start_hour": d_start,
                "disaster_end_hour": d_end,
                "cyclone_start_hour": d_start,
                "cyclone_end_hour": d_end,
                "causes_outage": causes_outage,
            }

            is_grid_isolated = bool(is_outage or (is_disaster_active and h in disaster_persistent_hours))

            record = {
                "hour": h,
                "is_outage": is_outage,
                "is_disaster_active": is_disaster_active,
                "mode": "DISASTER_TRIAGE" if is_emergency_triage_hour else "FAIRNESS",
                "disaster_type": disaster_type if is_disaster_active else "none",
                "disaster_details": disaster_details_obj,
                "tou_tariff_inr_per_kwh": hourly_tariff,
                "tariff_window": "PEAK (₹8.50)" if hourly_tariff == 8.50 else ("NORMAL (₹6.80)" if hourly_tariff == 6.80 else "OFF-PEAK (₹4.50)"),
                "battery_available_kw": total_backup_kw,
                "battery_used_kw": battery_used_this_hour,
                "fairness_ratio": None,
                "infeasible": triage.rejected_kw > 0.01,
                "rejected_kw": triage.rejected_kw,
                "backup_runtime_hours": backup_runtime_hours,
                "backup_runtime_text": backup_runtime_text,
                "battery_reserved_kwh": round(battery_reserved_kwh, 1),
                "isolated_power_redirect_kw": isolated_redirect_kw,
                "critical_infra_allocation": {
                    # Full triage keys (previously looked up short names that never
                    # exist, so always 0.0).
                    "Campus Server/Comms Room": triage.allocation_kw.get(
                        "Centre for Data Science (Campus Server/Comms Room)", 0.0),
                    "Campus Medical Point": triage.allocation_kw.get(
                        "ITER Administrative Block (Campus Medical Point)", 0.0),
                },
                "driev_emergency_buffer_used_kw": round(min(scooter_buffer_kw, battery_used_this_hour), 2) if is_outage else 0.0,
                "driev_solar_surplus_redirected_kw": 0.0,
                "tier_fully_served": {str(k): v for k, v in triage.tier_fully_served.items()},
                "priority_order": triage.priority_order,
                "explanation": full_explanation,
                "driev_fleet": hourly_driev_state,
                "energy_mix": {
                    "solar_kw": round(total_solar_this_hour, 1),
                    "battery_kw": round(battery_used_this_hour, 1),
                    "grid_import_kw": round(grid_import_this_hour, 1),
                    "total_demand_kw": round(total_demand_this_hour, 1),
                },
                "blocks": [
                    {
                        "name": b.name,
                        "load_kw": 0.0 if (is_disaster_active and disaster_type == "electrical_fire" and is_building_isolated(b.name, isolated_block_name)) else b.load_kw,
                        "solar_kw": 0.0 if (is_disaster_active and disaster_type == "electrical_fire" and is_building_isolated(b.name, isolated_block_name)) else b.solar_kw,
                        "deficit_kw": 0.0 if (is_disaster_active and disaster_type == "electrical_fire" and is_building_isolated(b.name, isolated_block_name)) else round(b.deficit_kw, 2),
                        "critical_kw": 0.0 if (is_disaster_active and disaster_type == "electrical_fire" and is_building_isolated(b.name, isolated_block_name)) else (b.critical_kw if b.load_kw > 0 else 0.0),
                        "allocated_kw": 0.0 if (b.load_kw <= 0.0 or (is_disaster_active and disaster_type == "electrical_fire" and is_building_isolated(b.name, isolated_block_name))) else round(block_alloc.get(b.name, 0.0), 2),
                        "service_ratio_pct": 0.0 if (b.load_kw <= 0.001 or (is_disaster_active and disaster_type == "electrical_fire" and is_building_isolated(b.name, isolated_block_name))) else round(min(100.0, ((b.solar_kw + block_alloc.get(b.name, 0.0)) / max(0.001, b.load_kw)) * 100.0), 1),
                        "is_fire_isolated": bool(is_disaster_active and disaster_type == "electrical_fire" and is_building_isolated(b.name, isolated_block_name)),
                        "status": "DISCONNECTED (FIRE ISOLATION)" if (is_disaster_active and disaster_type == "electrical_fire" and is_building_isolated(b.name, isolated_block_name)) else "NORMAL",
                    }
                    for b in blocks_state
                ],
            }
            if enable_live_llm:
                record["alerts"] = generate_alerts(
                    hour=h,
                    is_outage=is_outage,
                    is_disaster_active=is_disaster_active,
                    disaster_type=disaster_type if is_disaster_active else "none",
                    battery_used_kw=battery_used_this_hour,
                    battery_available_kw=total_backup_kw,
                    rejected_kw=triage.rejected_kw,
                    tier_fully_served=triage.tier_fully_served,
                    blocks=record["blocks"],
                    disaster_details=disaster_details_obj,
                    backup_runtime_hours=backup_runtime_hours,
                    isolated_power_redirect_kw=isolated_redirect_kw,
                    isolated_building=isolated_block_name,
                )
            else:
                # Offline batch path: 0 external calls (fixes 48-call timeout).
                record["alerts"] = _offline_generate_alerts(
                    hour=h,
                    is_outage=is_outage,
                    is_disaster_active=is_disaster_active,
                    disaster_type=disaster_type if is_disaster_active else "none",
                    battery_used_kw=battery_used_this_hour,
                    battery_available_kw=total_backup_kw,
                    rejected_kw=triage.rejected_kw,
                    tier_fully_served=triage.tier_fully_served,
                    blocks=record["blocks"],
                    disaster_details=disaster_details_obj,
                    backup_runtime_hours=backup_runtime_hours,
                    isolated_power_redirect_kw=isolated_redirect_kw,
                    isolated_building=isolated_block_name,
                )
        else:
            # Normal Operation: Routine Max-Min Fairness LP (full SoH power each
            # hour; remaining_kwh is display-only, not enforced — see above).
            battery_available = min(BATTERY_RATED_POWER_KW,
                                    float(battery_status.get("available_power_kw", 0.0) or 0.0))
            battery_reserved_kwh = 0.0
            result = allocate(blocks_state, battery_available_kw=battery_available)
            explanation = explain(result, blocks_state, hour=h) if enable_live_llm else _offline_explain(result, blocks_state, hour=h)

            # Stateful: surplus charges THIS hour's fleet (SOC carries forward).
            _hour_fleet = _fleet_for_hour(hourly_driev_state)
            driev_delivered = redirect_solar_surplus_to_driev(_hour_fleet, surplus_kw=solar_surplus) if solar_surplus > 0.05 else {}
            if driev_delivered:
                _commit_fleet(_hour_fleet)
                # Refresh displayed SOC to post-charge values (no more drift
                # between shown state and mutated fleet).
                for _sd in hourly_driev_state.get("scooters", []):
                    if _sd["id"] in driev_delivered and driev_delivered[_sd["id"]] > 0:
                        _match = next((s for s in _hour_fleet if s.id == _sd["id"]), None)
                        if _match is not None:
                            _sd["soc_pct"] = _match.soc_pct
                            _sd["range_km"] = _match.range_km

            total_demand_this_hour = sum(b.load_kw for b in blocks_state)
            total_solar_this_hour = sum(b.solar_kw for b in blocks_state)
            battery_used_this_hour = result.battery_used_kw
            net_deficit = sum(b.deficit_kw for b in blocks_state)
            grid_import_this_hour = max(0.0, round(net_deficit - battery_used_this_hour, 2))
            total_optimized_cost_inr += grid_import_this_hour * hourly_tariff

            record = {
                "hour": h,
                "is_outage": False,
                "is_disaster_active": False,
                "mode": "FAIRNESS",
                "disaster_type": "none",
                # Unified schema: fairness hours now carry the same keys as
                # triage hours (previously omitted, forcing frontend branching).
                "disaster_details": None,
                "tou_tariff_inr_per_kwh": hourly_tariff,
                "tariff_window": "PEAK (₹8.50)" if hourly_tariff == 8.50 else ("NORMAL (₹6.80)" if hourly_tariff == 6.80 else "OFF-PEAK (₹4.50)"),
                "battery_available_kw": battery_available,
                "battery_used_kw": battery_used_this_hour,
                "fairness_ratio": result.fairness_ratio,
                "infeasible": result.infeasible,
                "infeasible_reason": result.infeasible_reason,
                "rejected_kw": result.rejected_kw,
                "backup_runtime_hours": None,
                "backup_runtime_text": None,
                "battery_reserved_kwh": round(battery_reserved_kwh, 1),
                "isolated_power_redirect_kw": 0.0,
                "critical_infra_allocation": {"Campus Server/Comms Room": 0.0, "Campus Medical Point": 0.0},
                "driev_emergency_buffer_used_kw": 0.0,
                "tier_fully_served": {},
                "priority_order": [],
                "driev_solar_surplus_redirected_kw": round(sum(driev_delivered.values()), 2),
                "explanation": explanation,
                "driev_fleet": hourly_driev_state,
                "energy_mix": {
                    "solar_kw": round(total_solar_this_hour, 1),
                    "battery_kw": round(battery_used_this_hour, 1),
                    "grid_import_kw": round(grid_import_this_hour, 1),
                    "total_demand_kw": round(total_demand_this_hour, 1),
                },
                "blocks": [
                    {
                        "name": b.name,
                        "load_kw": 0.0 if (is_disaster_active and disaster_type == "electrical_fire" and is_building_isolated(b.name, isolated_block_name)) else b.load_kw,
                        "solar_kw": 0.0 if (is_disaster_active and disaster_type == "electrical_fire" and is_building_isolated(b.name, isolated_block_name)) else b.solar_kw,
                        "deficit_kw": 0.0 if (is_disaster_active and disaster_type == "electrical_fire" and is_building_isolated(b.name, isolated_block_name)) else round(b.deficit_kw, 2),
                        "critical_kw": 0.0 if (is_disaster_active and disaster_type == "electrical_fire" and is_building_isolated(b.name, isolated_block_name)) else (b.critical_kw if b.load_kw > 0 else 0.0),
                        "allocated_kw": 0.0 if (b.load_kw <= 0.0 or (is_disaster_active and disaster_type == "electrical_fire" and is_building_isolated(b.name, isolated_block_name))) else round(result.total_allocation.get(b.name, 0.0), 2),
                        "service_ratio_pct": 0.0 if (b.load_kw <= 0.001 or (is_disaster_active and disaster_type == "electrical_fire" and is_building_isolated(b.name, isolated_block_name))) else round(min(100.0, ((b.solar_kw + result.total_allocation.get(b.name, 0.0)) / max(0.001, b.load_kw)) * 100.0), 1),
                        "is_fire_isolated": bool(is_disaster_active and disaster_type == "electrical_fire" and is_building_isolated(b.name, isolated_block_name)),
                        "status": "DISCONNECTED (FIRE ISOLATION)" if (is_disaster_active and disaster_type == "electrical_fire" and is_building_isolated(b.name, isolated_block_name)) else "NORMAL",
                    }
                    for b in blocks_state
                ],
            }
            _alert_kw = dict(hour=h, is_outage=False, is_disaster_active=False,
                             disaster_type="none", battery_used_kw=battery_used_this_hour,
                             battery_available_kw=battery_available, rejected_kw=result.rejected_kw,
                             tier_fully_served=None, blocks=record["blocks"],
                             fairness_ratio=result.fairness_ratio)
            record["alerts"] = generate_alerts(**_alert_kw) if enable_live_llm else _offline_generate_alerts(**_alert_kw)

        total_solar_generated_kwh += record["energy_mix"]["solar_kw"]
        total_battery_dispatched_kwh += record["energy_mix"]["battery_kw"]
        total_grid_imported_kwh += record["energy_mix"]["grid_import_kw"]
        total_demand_kwh_day += record["energy_mix"]["total_demand_kw"]
        hourly_results.append(record)

        # SoC display tracker (not enforced on dispatch): only the MAIN BESS
        # drains `remaining` (scooter buffer has its own batteries). Solar
        # surplus recharges in BOTH outage and grid-connected hours. Dispatch
        # always offers full power (demo mode), so this only feeds the runtime
        # text and the remaining_kwh display field.
        try:
            _used_total = float(record["energy_mix"]["battery_kw"] or 0.0)
            if record.get("mode") == "DISASTER_TRIAGE":
                # Main BESS covers used minus scooter-buffer share.
                _scoot_cap = float(hourly_driev_state.get("emergency_buffer_available_kw", 0.0) or 0.0)
                _scoot_used = min(_scoot_cap, _used_total)
                _main_used = max(0.0, _used_total - _scoot_used)
            else:
                _main_used = _used_total
            _driev_used = float(record.get("driev_solar_surplus_redirected_kw", 0.0) or 0.0)
            _surplus_charge = max(0.0, float(solar_surplus) - _driev_used) * 0.9
            battery_remaining_kwh = max(
                0.0, min(usable_battery_kwh_full,
                         battery_remaining_kwh - _main_used + _surplus_charge))
            record["battery_remaining_kwh"] = round(battery_remaining_kwh, 1)
            record["battery_main_used_kw"] = round(_main_used, 2)
        except Exception:
            pass

    # 5. Summary Metrics & Financial Optimization Value Delta
    # grid_avoided = demand served WITHOUT grid (demand - grid import).
    # Previously solar+battery (double-counts when solar surplus exceeds demand
    # and assumes battery energy is always clean without tracking charge source).
    grid_avoided_kwh = round(max(0.0, total_demand_kwh_day - total_grid_imported_kwh), 1)
    co2_avoided_kg = round(grid_avoided_kwh * GRID_CO2_KG_PER_KWH, 1)

    # Baseline comparison
    kwh_saved_by_optimization = round(max(0.0, total_uncoordinated_grid_import_kwh - total_grid_imported_kwh), 1)
    pct_grid_saved = round((kwh_saved_by_optimization / max(1.0, total_uncoordinated_grid_import_kwh)) * 100.0, 1)

    # Rupee (₹) Financial Optimization Metrics (TPCODL ToU)
    daily_inr_saved = round(max(0.0, total_baseline_cost_inr - total_optimized_cost_inr), 0)
    monthly_inr_saved = round(daily_inr_saved * 30, 0)
    annual_inr_saved = round(daily_inr_saved * 365, 0)

    # Carbon Offset (CEA India Grid Factor: 0.82 kg CO2 / kWh)
    co2_avoided_kg_daily = co2_avoided_kg

    # Cryptographic Audit Ledger Hash (SHA-256 over scenario parameters + allocation totals)
    outage_key = "_".join(str(x) for x in sorted(outage_set))
    ledger_content = f"SOA_ITER_SYNAPTWIN_{total_solar_generated_kwh:.2f}_{total_battery_dispatched_kwh:.2f}_{daily_inr_saved:.1f}_{is_disaster_active}_{disaster_type}_{outage_key}_{days_in_service}"
    audit_ledger_hash = hashlib.sha256(ledger_content.encode("utf-8")).hexdigest()

    # Daytime vs Evening Outage Comparison Callout
    daytime_sample_hour = next((h for h in outage_set if 10 <= h <= 15), 12)
    evening_sample_hour = next((h for h in outage_set if h >= 18 or h < 6), 20)
    
    h_day = hourly_results[daytime_sample_hour]
    h_eve = hourly_results[evening_sample_hour]
    day_load = sum(b["load_kw"] for b in h_day["blocks"])
    day_solar = sum(b["solar_kw"] for b in h_day["blocks"])
    day_solar_cov_pct = round(min(100.0, (day_solar / max(1.0, day_load)) * 100.0), 1)

    outage_comparison = {
        "daytime_hour": daytime_sample_hour,
        "daytime_solar_coverage_pct": day_solar_cov_pct,
        "daytime_battery_coverage_pct": round(100.0 - day_solar_cov_pct, 1),
        "daytime_insight": f"During daytime outages (e.g. {daytime_sample_hour}:00), rooftop solar directly covers {day_solar_cov_pct}% of campus demand; the battery only supplies the remaining {round(100.0 - day_solar_cov_pct, 1)}%.",
        "evening_hour": evening_sample_hour,
        "evening_insight": f"During evening/night outages (e.g. {evening_sample_hour}:00), solar irradiance is 0 kW; the shared battery must supply 100% of prioritized emergency loads alone.",
    }

    # S24 Community Microgrid Participants for Fairness Optimization
    microgrid_pilot_names = {
        "ITER Boys Hostel 1",
        "ITER Boys Hostel 7",
        "C-Block (Academic)",
        "Central Library",
        "Campus Utility Substation",
    }

    baseline_energy_served_total = 0.0
    baseline_unmet_total = 0.0
    baseline_critical_unmet_total = 0.0
    baseline_jain_sum = 0.0
    baseline_battery_dispatched_kwh = 0.0
    
    s24_energy_served_total = 0.0
    s24_unmet_total = 0.0
    s24_critical_unmet_total = 0.0
    s24_jain_sum = 0.0

    # Tier-1 % measured over ISLANDED hours only (grid-connected hours can't
    # starve — grid covers). Both runs use the same denominator.
    total_critical_demand_day = sum(sum(b["critical_kw"] for b in h["blocks"] if b["load_kw"] > 0)
                                    for h in hourly_results if h.get("is_outage"))

    for h_idx in range(24):
        h_rec = hourly_results[h_idx]
        b_states = [
            BlockState(
                name=b["name"],
                load_kw=b["load_kw"],
                solar_kw=b["solar_kw"],
                critical_kw=b["critical_kw"],
                feeder_limit_kw=150.0
            )
            for b in h_rec["blocks"]
        ]
        bat_avail = h_rec["battery_available_kw"]
        
        # Run A: Campus-wide uncoordinated baseline metrics (Tier-1 unmet only
        # on islanded hours, matching Run B).
        run_a_all = allocate_uncoordinated_baseline(b_states, bat_avail)
        baseline_energy_served_total += run_a_all["total_served_kw"]
        baseline_unmet_total += run_a_all["unmet_demand_kw"]
        if h_rec.get("is_outage"):
            baseline_critical_unmet_total += run_a_all["critical_unmet_kw"]
        baseline_battery_dispatched_kwh += sum(run_a_all["allocations"].values())
        
        # Run A: Fairness on microgrid participants
        pilot_states = [b for b in b_states if b.name in microgrid_pilot_names]
        run_a_pilot = allocate_uncoordinated_baseline(pilot_states, bat_avail)
        baseline_jain_sum += run_a_pilot["fairness_index"]
        
        # Run B: S24 Orchestrated Microgrid (+ real critical-unmet tracking;
        # previously s24_critical_unmet_total stayed 0, forcing 100%/99.9%).
        # Grid-connected hours can't starve Tier-1 (grid covers any battery
        # shortfall), so only islanded hours count toward Tier-1 unmet.
        s24_served = sum(b["solar_kw"] + b["allocated_kw"] for b in h_rec["blocks"])
        s24_demand = sum(b["load_kw"] for b in h_rec["blocks"])
        s24_energy_served_total += s24_served
        s24_unmet_total += max(0.0, s24_demand - s24_served)
        if h_rec.get("is_outage"):
            for b in h_rec["blocks"]:
                _served_b = float(b.get("solar_kw", 0) or 0) + float(b.get("allocated_kw", 0) or 0)
                _crit = float(b.get("critical_kw", 0) or 0)
                if _served_b + 1e-9 < _crit:
                    s24_critical_unmet_total += (_crit - _served_b)
        
        # S24 Jain fairness over the community microgrid deficit blocks
        if h_rec["is_outage"]:
            triage_allocs = {b["name"]: b["allocated_kw"] for b in h_rec["blocks"]}
            ratios_b = [triage_allocs.get(b.name, 0.0) / max(0.001, b.deficit_kw) for b in pilot_states if b.deficit_kw > 0.001]
        else:
            res_b = allocate(pilot_states, bat_avail)
            ratios_b = [res_b.total_allocation[b.name] / max(0.001, b.deficit_kw) for b in pilot_states if b.deficit_kw > 0.001]

        if ratios_b:
            s_r = sum(ratios_b)
            sq_r = sum(r**2 for r in ratios_b)
            s24_jain_sum += (s_r ** 2) / (len(ratios_b) * sq_r) if sq_r > 0 else 1.0
        else:
            s24_jain_sum += 1.0
    
    # Tier-1 (life-safety slices) served % over ISLANDED hours (previously B
    # hardcoded 99.9%, then briefly block-critical which mixes Tier-2 in).
    # s24_critical_unmet_total is RETIRED as audit denominator (kept computed
    # for reference) — audit now uses the slice accounting below.
    if tier1_demand_island_kwh > 0.01:
        s24_critical_served_pct = round(
            max(0.0, tier1_served_island_kwh / tier1_demand_island_kwh * 100.0), 1)
        s24_critical_unmet_total = round(tier1_demand_island_kwh - tier1_served_island_kwh, 1)
    else:
        # No islanded hours → Tier-1 trivially 100% (grid covers all).
        s24_critical_served_pct = 100.0
        s24_critical_unmet_total = 0.0
    # Run-A row basis = NAIVE battery (not grid-only): avoided = demand served
    # without grid under naive dispatch. (Previously grid-only basis while the
    # row's grid/cost used mixed bases — kWh and ₹ couldn't reconcile.)
    _demand_day = sum(sum(b["load_kw"] for b in h["blocks"]) for h in hourly_results)
    _baseline_grid_avoided = max(0.0, _demand_day - total_naive_grid_import_kwh)
    _run_a_cost = round(total_naive_cost_inr, 0)
    _run_a_co2 = round(_baseline_grid_avoided * GRID_CO2_KG_PER_KWH, 1)
    scenario_comparison = {
        "run_a_baseline": {
            "title": "Run A: Uncoordinated Baseline (Without SynapTwin)",
            "methodology": ("Owns the same battery but splits it naively, equal parts, no sharing smarts. "
                            "Tier-1 % = block-critical kWh served on islanded hours. "
                            "Note: the financial headline elsewhere compares against GRID-ONLY "
                            "(no shared battery at all) — that is the investment case; this Run-A "
                            "row isolates the orchestration edge."),
            "total_energy_served_kwh": round(baseline_energy_served_total, 1),
            "unmet_demand_kwh": round(baseline_unmet_total, 1),
            "tier1_life_safety_served_pct": round(max(0.0, 100.0 - (baseline_critical_unmet_total / max(1.0, total_critical_demand_day)) * 100.0), 1),
            "grid_import_kwh": round(total_naive_grid_import_kwh, 1),
            "daily_tou_cost_inr": _run_a_cost,
            "co2_avoided_kg": _run_a_co2,
            "fairness_index": round(baseline_jain_sum / 24.0, 3),
        },
        "run_b_s24": {
            "title": "Run B: SynapTwin Orchestrated Microgrid (With SynapTwin)",
            "methodology": ("Two-Stage Max-Min Fairness LP & 4-Tier Lexicographic Disaster Triage. "
                            "Tier-1 % = life-safety slice kWh (medical/server/sump/shelter) served on islanded hours."),
            "total_energy_served_kwh": round(s24_energy_served_total, 1),
            "unmet_demand_kwh": round(s24_unmet_total, 1),
            "tier1_life_safety_served_pct": s24_critical_served_pct,
            "grid_import_kwh": round(total_grid_imported_kwh, 1),
            "daily_tou_cost_inr": round(total_optimized_cost_inr, 0),
            "co2_avoided_kg": round(co2_avoided_kg, 1),
            "fairness_index": round(s24_jain_sum / 24.0, 3),
        },
        "delta": {
            # All deltas are Run-B-minus-Run-A from the rows above (pure
            # orchestration edge). The bigger battery-investment case (vs
            # grid-only) lives in financial_metrics / impact_metrics.
            # (Previously cost/co2 deltas used the grid-only baseline while the
            # rows used naive — the headline couldn't reconcile with the bars.)
            "additional_energy_served_kwh": round(max(0.0, s24_energy_served_total - baseline_energy_served_total), 1),
            "unmet_demand_reduction_kwh": round(max(0.0, baseline_unmet_total - s24_unmet_total), 1),
            "daily_rupee_savings_inr": round(max(0.0, total_naive_cost_inr - total_optimized_cost_inr), 0),
            "monthly_rupee_savings_inr": round(max(0.0, total_naive_cost_inr - total_optimized_cost_inr) * 30, 0),
            "co2_abatement_gain_kg": round(max(0.0, co2_avoided_kg - _run_a_co2), 1),
            "fairness_gain_pct": round(max(0.0, ((s24_jain_sum / 24.0) - (baseline_jain_sum / 24.0)) / max(0.01, (baseline_jain_sum / 24.0)) * 100.0), 1),
        }
    }

    # Demand Forecast Line: illustrative persistence-lag model (multipliers shape
    # realistic lag at ramps/dips). MAPE is COMPUTED below from actual vs
    # predicted — never claimed as an exact constant (previously commented as
    # "exact 3.8%", backwards: multipliers are input, MAPE is output).
    # Multipliers reflect:
    # - Morning ramp lag (06:00-09:00): Under-prediction during steep rise (forecast hasn't seen the sudden spike yet)
    # - Lunch dip & recovery (13:00-14:00): Over-prediction at 13:00 (extrapolating midday) & lag at 14:00 (recovery)
    # - Evening decline (18:00-21:00): Over-prediction during steep drop (trailing previous daytime trend)
    # - Flatter periods (overnight/midday): Small natural alternating variance (diverging and re-converging)
    DEMAND_FORECAST_MULTIPLIERS = [
        0.982,  # 00:00: -1.8% (overnight natural variance)
        1.020,  # 01:00: +2.0%
        0.978,  # 02:00: -2.2%
        1.020,  # 03:00: +2.0%
        0.982,  # 04:00: -1.8%
        1.018,  # 05:00: +1.8%
        0.942,  # 06:00: -5.8% (morning ramp start lag: under-predicting rising load)
        0.923,  # 07:00: -7.7% (morning ramp acceleration lag: under-predicting rising load)
        0.938,  # 08:00: -6.2% (morning peak spike lag: ~90 kW under-prediction)
        0.965,  # 09:00: -3.5% (morning plateau catchup lag)
        1.022,  # 10:00: +2.2% (midday plateau)
        0.978,  # 11:00: -2.2%
        1.022,  # 12:00: +2.2%
        1.086,  # 13:00: +8.6% (lunch drop overshoot: over-predicting during sudden load drop, ~70 kW)
        0.942,  # 14:00: -5.8% (post-lunch recovery lag: under-predicting quick rebound, ~74 kW)
        1.022,  # 15:00: +2.2% (afternoon plateau)
        0.980,  # 16:00: -2.0%
        1.020,  # 17:00: +2.0%
        1.070,  # 18:00: +7.0% (evening decline lag: over-predicting during sudden drop, ~65 kW)
        1.060,  # 19:00: +6.0% (evening decline lag: over-predicting, ~43 kW)
        1.053,  # 20:00: +5.3% (evening decline lag: over-predicting, ~34 kW)
        1.073,  # 21:00: +7.3% (night transition lag: over-predicting, ~26 kW)
        0.980,  # 22:00: -2.0% (night settling)
        1.020,  # 23:00: +2.0%
    ]

    hourly_demands = [sum(b["load_kw"] for b in h["blocks"]) for h in hourly_results]
    daily_avg_demand_kw = round(sum(hourly_demands) / len(hourly_demands), 1)
    
    predicted_demand_trend = [
        round(val * DEMAND_FORECAST_MULTIPLIERS[h_idx], 1)
        for h_idx, val in enumerate(hourly_demands)
    ]

    # Dynamically compute exact Mean Absolute Percentage Error (MAPE)
    apes = [
        abs(pred - actual) / max(1.0, actual) * 100.0
        for pred, actual in zip(predicted_demand_trend, hourly_demands)
    ]
    demand_mape_pct = round(sum(apes) / max(1, len(apes)), 1)

    # Store for secure privacy
    store = SecureMeterStore()
    for r in hourly_results:
        store.put_record(f"hour_{r['hour']}", r)

    return {
        "campus_buildings_attribution": "© OpenStreetMap contributors, ODbL",
        "weather_attribution": weather.get("source", "Open-Meteo Solar API"),
        "weather_fetch_timestamp": weather.get("fetch_timestamp", ""),
        "blocks_geo": [
            {
                "name": b.name, "osm_id": b.osm_id, "footprint_m2": b.footprint_m2,
                "centroid_lat": b.centroid_lat, "centroid_lon": b.centroid_lon,
                "peak_kw": b.peak_kw, "critical_kw": b.critical_kw, "solar_kwp": b.solar_kwp,
            }
            for b in campus_blocks
        ],
        "battery_rated_power_kw": BATTERY_RATED_POWER_KW,
        "battery_rated_capacity_kwh": BATTERY_RATED_CAPACITY_KWH,
        "battery_health": battery_status,
        "solar_forecast": {
            "source": weather.get("source", "Open-Meteo Solar Radiation API"),
            "fetch_timestamp": weather.get("fetch_timestamp"),
            "forecast_today_w_per_m2": [round(today_irradiance[h], 1) for h in range(24)],
            "actual_today_w_per_m2": [round(today_irradiance[h] * hourly_solar_mult[h], 1) for h in range(24)],
            "live_mae_w_per_m2": round(sum(abs(today_irradiance[h] * hourly_solar_mult[h] - today_irradiance[h]) for h in range(6, 19)) / 13.0, 1) if any(hourly_solar_mult[h] != 1.0 for h in range(24)) else weather.get("validation_mae_w_per_m2", 28.4),
            "forecast_peak_w_per_m2": round(max(today_irradiance), 1),
            "actual_peak_w_per_m2": round(max(today_irradiance[h] * hourly_solar_mult[h] for h in range(24)), 1),
            "predicted_next_day_irradiance": weather.get("next_day_predicted_irradiance_w_per_m2", []),
            "today_irradiance": today_irradiance,
            "disaster_type": disaster_type,
            "is_weather_divergence": bool(is_disaster_active and disaster_type in ("cyclone_severe_storm", "monsoon_waterlogging")),
            "is_grid_fault_only": bool(is_disaster_active and disaster_type in ("grid_transformer_fault", "extended_outage", "electrical_fire")),
            "disaster_window": {
                "start_hour": d_start,
                "end_hour": d_end,
                "duration_hours": len(disaster_persistent_hours) if causes_outage else (d_end - d_start + 1),
                "causes_outage": causes_outage,
                "is_active": bool(is_disaster_active and disaster_type != "none"),
                "disaster_type": disaster_type,
            },
            "cyclone_window": {
                "start_hour": c_start,
                "end_hour": c_end,
                "duration_hours": len(cyclone_persistent_hours),
                "is_active": bool(is_disaster_active and disaster_type == "cyclone_severe_storm"),
            },
        },
        "driev_fleet_summary": get_driev_fleet_summary(driev_fleet),
        "outage_hours": sorted(outage_set),
        "is_disaster_active": is_disaster_active,
        "disaster_type": disaster_type,
        "hazard_hour": hazard_hour,
        "financial_metrics": {
            "tariff_standard": "TPCODL Commercial ToU (OERC Tariff Order)",
            "daily_baseline_cost_inr": round(total_baseline_cost_inr, 0),
            "daily_optimized_cost_inr": round(total_optimized_cost_inr, 0),
            "daily_inr_saved": daily_inr_saved,
            "monthly_inr_saved": monthly_inr_saved,
            "annual_inr_saved": annual_inr_saved,
        },
        "environmental_metrics": {
            "clean_solar_generated_kwh_daily": round(total_solar_generated_kwh, 1),
            "co2_avoided_kg_daily": co2_avoided_kg_daily,
            "grid_emission_factor_kg_per_kwh": GRID_CO2_KG_PER_KWH,
            "clean_energy_delivered_kwh": kwh_saved_by_optimization,
        },
        "audit_ledger": {
            # Deterministic ID from SHA-256 (previously Python hash() which is
            # randomised per process, so IDs changed on every restart).
            "certificate_id": f"SOA-ITER-SYNAPTWIN-{audit_ledger_hash[:7].upper()}",
            "sha256_hash": audit_ledger_hash,
            # Honest status computed from ACTUAL results (previously hardcoded
            # VERIFIED_OPTIMAL even when rejected_kw > 0 and Tier-4 starved).
            "verification_status": (
                "VERIFIED_OPTIMAL (100% Starvation-Free)"
                if s24_unmet_total <= 0.01 and s24_critical_unmet_total <= 0.01
                else ("CONDITIONAL — Tier-1 protected, Tier-3/4 curtailed "
                      f"({s24_unmet_total:.1f} kWh unmet)") if s24_critical_unmet_total <= 0.01
                else (f"CONSTRAINED — Tier-1 shortfall {s24_critical_unmet_total:.1f} kWh, "
                      f"grid backup required")
            ),
            "total_unmet_kwh_day": round(s24_unmet_total, 1),
            "tier1_unmet_kwh_day": round(s24_critical_unmet_total, 1),
            "compliance_standards": [
                "Designed with reference to IEEE 2030.7 microgrid controller specification principles",
                "TPCODL Commercial Time-of-Use (ToU) Tariff Schedule (OERC Tariff Order Schedule RST-2)",
                "OpenStreetMap ODbL Spatial Attribution Standard",
            ],
        },
        "impact_metrics": {
            "grid_electricity_avoided_kwh": grid_avoided_kwh,
            "co2_avoided_kg": co2_avoided_kg,
            "emission_factor_kg_per_kwh": GRID_CO2_KG_PER_KWH,
            "kwh_saved_by_optimization": kwh_saved_by_optimization,
            "pct_grid_saved": pct_grid_saved,
            "daily_avg_demand_kw": daily_avg_demand_kw,
            "daily_inr_saved": daily_inr_saved,
            "monthly_inr_saved": monthly_inr_saved,
            "annual_inr_saved": annual_inr_saved,
        },
        "demand_analytics": {
            "daily_avg_demand_kw": daily_avg_demand_kw,
            "actual_demand_curve": hourly_demands,
            "predicted_demand_curve": predicted_demand_trend,
            "predicted_demand_trend": predicted_demand_trend,
            "mape_pct": demand_mape_pct,
            "confidence_band_pct": demand_mape_pct,
        },
        "outage_comparison": outage_comparison,
        "scenario_comparison": scenario_comparison,
        "disaster_window": {
            "start_hour": d_start,
            "end_hour": d_end,
            "duration_hours": len(disaster_persistent_hours) if causes_outage else (d_end - d_start + 1),
            "causes_outage": causes_outage,
            "is_active": bool(is_disaster_active and disaster_type != "none"),
            "disaster_type": disaster_type,
        },
        "cyclone_window": {
            "start_hour": c_start,
            "end_hour": c_end,
            "duration_hours": len(cyclone_persistent_hours),
            "is_active": bool(is_disaster_active and disaster_type == "cyclone_severe_storm"),
        },
        "simulated_alert_disclaimer": SIMULATED_ALERT_DISCLAIMER,
        # Top-level alerts = hazard-hour slice PLUS explicit context (previously a
        # bare list — a fairness-hour hazard looked like the scenario alert).
        "alerts": hourly_results[hazard_hour if (hazard_hour is not None and 0 <= hazard_hour < 24) else 12].get("alerts", []),
        "alerts_context": {
            "hazard_hour": hazard_hour,
            "hazard_hour_mode": hourly_results[hazard_hour if (hazard_hour is not None and 0 <= hazard_hour < 24) else 12].get("mode"),
            "hazard_hour_is_outage": hourly_results[hazard_hour if (hazard_hour is not None and 0 <= hazard_hour < 24) else 12].get("is_outage"),
        },
        "hourly": hourly_results,
    }


# ==========================================
# REST API ENDPOINTS
# ==========================================

@app.route("/api/health", methods=["GET"])
def get_health():
    """Lightweight health probe for Render/gunicorn (no simulation)."""
    return jsonify({"status": "ok", "service": "synaptwin-backend"}), 200


@app.errorhandler(404)
def _json_404(e):
    # JSON 404 for any /api/* miss including POST (previously POST unknown
    # returned HTML via SPA catch-all).
    try:
        if (request.path or "").lower().split("/")[1:2] == ["api"]:
            return jsonify({"error": "API endpoint not found", "path": request.path}), 404
    except Exception:
        pass
    return e


@app.errorhandler(405)
def _json_405(e):
    # JSON 405 for wrong-method /api/* hits (e.g. POST unknown returns 405
    # before 404 routing). Keeps error schema consistent.
    try:
        if (request.path or "").lower().split("/")[1:2] == ["api"]:
            return jsonify({"error": "Method not allowed for this API endpoint",
                            "path": request.path, "method": request.method}), 405
    except Exception:
        pass
    return e


@app.route("/api/status", methods=["GET"])
def get_status():
    gemini = {"configured": False, "mode": "offline_deterministic"}
    fernet = {"configured": False}
    try:
        if app_config is not None:
            gemini = app_config.gemini_status()
            fernet = app_config.fernet_status()
    except Exception:
        pass
    try:
        weather_fetch = get_open_meteo_status()
    except Exception:
        weather_fetch = {"last_error": "status unavailable"}
    return jsonify({
        "status": "online",
        "service": "SynapTwin Community Energy Flexibility Digital Twin",
        "campus": "Siksha 'O' Anusandhan (SOA) ITER Campus",
        "location": {"lat": 20.30, "lon": 85.82, "city": "Bhubaneswar, Odisha, India"},
        "weather_source": "Open-Meteo Solar API",
        "weather_fetch": weather_fetch,
        "fleet_system": "driEV Campus Shared Scooters (Speed & Luxe)",
        "ai_explainability": gemini,
        "privacy_vault": fernet,
        "features": [
            "Real OpenStreetMap 16-Building Campus Geometry",
            "Open-Meteo Solar Irradiance Live Integration",
            "driEV Smart Electric Scooter Fleet & Solar Soak",
            "TPCODL Odisha Commercial Time-of-Use (ToU) Tariff Engine",
            "Disaster Simulation (Monsoon, Cyclone, Fire, Outage, Heatwave)",
            "Max-Min Fairness LP & Lexicographic Triage with Backup Runtime Hours",
            "Simulated Emergency Alert System & Priority Triage Notifications",
            "Full Stacked Energy Mix (Solar + Battery + Grid)",
            "Baseline vs. Optimized Savings Metrics (kWh & INR ₹)",
            "Official Cryptographic Audit & Compliance Certificate (SHA-256)",
            "Role-Based Cryptographic Privacy Vault (Fernet AES)",
        ],
    })


@app.route("/api/campus/geojson", methods=["GET"])
def get_campus_geojson():
    try:
        buildings = load_campus_buildings()
    except (FileNotFoundError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 500
    geojson = to_geojson(buildings)
    return jsonify(geojson)


@app.route("/api/simulation/default", methods=["GET"])
def get_default_simulation():
    # Default is the full presentation scenario: Monsoon Waterlogging with Outage at hours 19, 20, 21
    sim = execute_simulation(
        outage_hours=[19, 20, 21],
        disaster_type="monsoon_waterlogging",
        is_disaster_active=True,
        hazard_hour=20,
    )
    return jsonify(sim)


@app.route("/api/simulation/run", methods=["GET", "POST"])
def run_custom_simulation():
    # Unified HTTP surface (§5.5): GET+POST like /compare and /alerts (GET uses
    # query params). POST with JSON remains the primary frontend path.
    if request.method == "GET":
        data = request.args.to_dict()
    else:
        data = request.get_json(silent=True)
        if data is None:
            # Allow POST with query params and empty body (sandbox parity).
            data = request.args.to_dict() if request.args else None
        if data is None:
            return jsonify({"error": "Invalid JSON body"}), 400
    if not isinstance(data, dict):
        return jsonify({"error": "JSON body must be an object"}), 400
    try:
        outage_hours = _parse_outage_hours(data.get("outage_hours", [19, 20, 21]))
        disaster_type = str(data.get("disaster_type", "monsoon_waterlogging") or "none")
        allowed_disasters = {"none", "monsoon_waterlogging", "cyclone_severe_storm",
                             "electrical_fire", "grid_transformer_fault", "extended_outage",
                             "heatwave_stress"}
        if disaster_type not in allowed_disasters:
            return jsonify({"error": f"Unknown disaster_type '{disaster_type}'",
                            "allowed": sorted(allowed_disasters)}), 400
        is_disaster_active = bool(data.get("is_disaster_active", True) and disaster_type != "none")
        isolated_block = data.get("isolated_block") or data.get("isolated_building")
        hazard_hour = _safe_int(data.get("hazard_hour", 20), 20, 0, 23)
        _soh_raw = data.get("battery_soh_pct", None)
        battery_soh_pct = None if _soh_raw in (None, "") else _safe_float(_soh_raw, 82.0, 0.0, 100.0)
        days_in_service = _safe_int(data.get("days_in_service", 200), 200, 0, 3000)
        driev_emergency_opt_in_count = _safe_int(data.get("driev_emergency_opt_in_count", 8), 8, 0, 12)
        solar_multiplier = _safe_float(data.get("solar_multiplier", 1.0), 1.0, 0.0, 3.0)
        load_multiplier = _safe_float(data.get("load_multiplier", 1.0), 1.0, 0.0, 3.0)
        block_load_overrides = data.get("block_load_overrides")
        if block_load_overrides is not None and not isinstance(block_load_overrides, dict):
            return jsonify({"error": "block_load_overrides must be an object {block_name: kW}"}), 400
        day_name = str(data.get("day_name", "Mon") or "Mon")[:3]
        day_type = str(data.get("day_type", "weekday") or "weekday")
        if day_type not in ("weekday", "weekend"):
            day_type = "weekday"

        def _opt_hour(*keys):
            for k in keys:
                if data.get(k) is not None:
                    try:
                        return _safe_int(data.get(k), None, 0, 23)  # type: ignore
                    except Exception:
                        return None
            return None
        disaster_start_hour = _opt_hour("disaster_start_hour", "cyclone_start_hour")
        disaster_end_hour = _opt_hour("disaster_end_hour", "cyclone_end_hour")
    except Exception as exc:
        log.warning("simulation/run bad params: %s", exc)
        return jsonify({"error": f"Invalid parameters: {exc}"}), 400

    ok, err = _check_auth_and_rate("sim")
    if not ok:
        return err  # type: ignore
    _cache_payload = {"op": "run", "outage_hours": outage_hours, "disaster_type": disaster_type,
                      "is_disaster_active": is_disaster_active, "isolated_block": isolated_block,
                      "hazard_hour": hazard_hour, "battery_soh_pct": battery_soh_pct,
                      "days_in_service": days_in_service,
                      "driev_emergency_opt_in_count": driev_emergency_opt_in_count,
                      "solar_multiplier": solar_multiplier, "load_multiplier": load_multiplier,
                      "block_load_overrides": block_load_overrides, "day_name": day_name,
                      "day_type": day_type, "disaster_start_hour": disaster_start_hour,
                      "disaster_end_hour": disaster_end_hour}
    _ck = _sim_cache_key(_cache_payload)
    if _ck and _ck in _SIM_CACHE:
        _ts, _res = _SIM_CACHE[_ck]
        if time.time() - _ts < _SIM_CACHE_TTL_SEC:
            return jsonify(_res)
    try:
        results = execute_simulation(
            outage_hours=outage_hours,
            disaster_type=disaster_type,
            is_disaster_active=is_disaster_active,
            isolated_block=isolated_block,
            hazard_hour=hazard_hour,
            battery_soh_pct=battery_soh_pct,
            days_in_service=days_in_service,
            driev_emergency_opt_in_count=driev_emergency_opt_in_count,
            solar_multiplier=solar_multiplier,
            load_multiplier=load_multiplier,
            block_load_overrides=block_load_overrides,
            day_name=day_name,
            day_type=day_type,
            disaster_start_hour=disaster_start_hour,
            disaster_end_hour=disaster_end_hour,
            cyclone_start_hour=disaster_start_hour,
            cyclone_end_hour=disaster_end_hour,
        )
    except Exception as exc:
        log.exception("simulation/run failed")
        return jsonify({"error": f"Simulation failed: {exc}"}), 500
    if _ck:
        _SIM_CACHE[_ck] = (time.time(), results)
        if len(_SIM_CACHE) > 64:
            _SIM_CACHE.pop(next(iter(_SIM_CACHE)))
    return jsonify(results)


@app.route("/api/simulation/compare", methods=["GET", "POST"])
def get_simulation_comparison():
    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
    else:
        data = request.args.to_dict()
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid parameters"}), 400

    try:
        outage_hours = _parse_outage_hours(data.get("outage_hours", [19, 20, 21]))
        disaster_type = str(data.get("disaster_type", "monsoon_waterlogging") or "none")
        is_disaster_active = bool(str(data.get("is_disaster_active", "true")).lower() not in ("false", "0", "no")
                                  and disaster_type != "none") if isinstance(data.get("is_disaster_active"), str) \
            else bool(data.get("is_disaster_active", True) and disaster_type != "none")
        isolated_block = data.get("isolated_block") or data.get("isolated_building")
        hazard_hour = _safe_int(data.get("hazard_hour", 20), 20, 0, 23)
        battery_soh_pct = None
        if "battery_soh_pct" in data and data["battery_soh_pct"] not in (None, ""):
            battery_soh_pct = _safe_float(data["battery_soh_pct"], 82.0, 0.0, 100.0)
        days_in_service = _safe_int(data.get("days_in_service", 200), 200, 0, 3000)
        driev_emergency_opt_in_count = _safe_int(data.get("driev_emergency_opt_in_count", 8), 8, 0, 12)
        solar_multiplier = _safe_float(data.get("solar_multiplier", 1.0), 1.0, 0.0, 3.0)
        load_multiplier = _safe_float(data.get("load_multiplier", 1.0), 1.0, 0.0, 3.0)
        day_name = str(data.get("day_name", "Mon") or "Mon")[:3]
        day_type = str(data.get("day_type", "weekday") or "weekday")
        if day_type not in ("weekday", "weekend"):
            day_type = "weekday"

        def _opt(k1, k2):
            v = data.get(k1, data.get(k2))
            if v in (None, ""):
                return None
            return _safe_int(v, None, 0, 23)  # type: ignore
        disaster_start_hour = _opt("disaster_start_hour", "cyclone_start_hour")
        disaster_end_hour = _opt("disaster_end_hour", "cyclone_end_hour")
    except Exception as exc:
        return jsonify({"error": f"Invalid parameters: {exc}"}), 400

    ok, err = _check_auth_and_rate("sim")
    if not ok:
        return err  # type: ignore
    try:
        results = execute_simulation(
            outage_hours=outage_hours,
            disaster_type=disaster_type,
            is_disaster_active=is_disaster_active,
            isolated_block=isolated_block,
            hazard_hour=hazard_hour,
            battery_soh_pct=battery_soh_pct,
            days_in_service=days_in_service,
            driev_emergency_opt_in_count=driev_emergency_opt_in_count,
            solar_multiplier=solar_multiplier,
            load_multiplier=load_multiplier,
            day_name=day_name,
            day_type=day_type,
            disaster_start_hour=disaster_start_hour,
            disaster_end_hour=disaster_end_hour,
            cyclone_start_hour=disaster_start_hour,
            cyclone_end_hour=disaster_end_hour,
        )
    except Exception as exc:
        log.exception("simulation/compare failed")
        return jsonify({"error": f"Simulation failed: {exc}"}), 500
    return jsonify(results.get("scenario_comparison", results.get("outage_comparison", {})))


@app.route("/api/alerts/active", methods=["GET", "POST"])
def get_active_alerts():
    """
    Returns the list of active simulated emergency alerts for the current simulation state.
    Supports GET (with query parameters) and POST (with JSON payload).
    Uses the 5-min simulation cache, so repeated polls for one hour don't re-run
    the full 24h + 48 LPs every time.
    """
    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
    else:
        data = request.args.to_dict()
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid parameters"}), 400

    ok, err = _check_auth_and_rate("sim")
    if not ok:
        return err  # type: ignore
    hour = _safe_int(data.get("hour", 20), 20, 0, 23)
    outage_hours = _parse_outage_hours(data.get("outage_hours", [19, 20, 21]))

    disaster_type = str(data.get("disaster_type", "monsoon_waterlogging") or "none")
    is_disaster_active = bool(data.get("is_disaster_active", True) and disaster_type != "none")
    isolated_block = data.get("isolated_block") or data.get("isolated_building")

    _ck = _sim_cache_key({"op": "alerts", "hour": hour, "outage_hours": outage_hours,
                          "disaster_type": disaster_type, "is_disaster_active": is_disaster_active,
                          "isolated_block": isolated_block})
    sim = None
    if _ck and _ck in _SIM_CACHE and time.time() - _SIM_CACHE[_ck][0] < _SIM_CACHE_TTL_SEC:
        sim = _SIM_CACHE[_ck][1]
    else:
        try:
            sim = execute_simulation(
                outage_hours=outage_hours,
                disaster_type=disaster_type,
                is_disaster_active=is_disaster_active,
                isolated_block=isolated_block,
                hazard_hour=hour,
            )
            if _ck:
                _SIM_CACHE[_ck] = (time.time(), sim)
        except Exception as exc:
            log.exception("alerts/active simulation failed")
            return jsonify({"error": f"Simulation failed: {exc}"}), 500

    target_hour_record = next((h_rec for h_rec in sim["hourly"] if h_rec["hour"] == hour), sim["hourly"][0])
    active_alerts = target_hour_record.get("alerts", [])

    return jsonify({
        "status": "success",
        "is_simulated": True,
        "disclaimer": SIMULATED_ALERT_DISCLAIMER,
        "hour": hour,
        "is_outage": target_hour_record["is_outage"],
        "is_disaster_active": target_hour_record["is_disaster_active"],
        "disaster_type": target_hour_record["disaster_type"],
        "alerts_count": len(active_alerts),
        "alerts": active_alerts,
    })


@app.route("/api/audit/certificate", methods=["GET"])
def get_audit_certificate():
    ok, err = _check_auth_and_rate("audit")
    if not ok:
        return err  # type: ignore
    sim_data = execute_simulation()
    return jsonify({
        "certificate_title": "SynapTwin Official SOA ITER Microgrid Energy Flexibility & Fairness Audit Certificate",
        "certificate_id": sim_data["audit_ledger"]["certificate_id"],
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S IST"),
        "institution": "Siksha 'O' Anusandhan (SOA) Deemed to be University, ITER Campus",
        "jurisdiction": "TPCODL / OERC Bhubaneswar Distribution Circle, Odisha, India",
        "financial_summary": sim_data["financial_metrics"],
        "environmental_summary": sim_data["environmental_metrics"],
        "audit_ledger": sim_data["audit_ledger"],
        "battery_health_audit": sim_data["battery_health"],
        "fairness_guarantee": {
            "algorithm": "Max-Min Fairness Linear Program (LP) & Lexicographic Priority Triage",
            "mathematical_objective": "Maximize minimum satisfaction ratio min_i(x_i / d_i) subject to feeder and capacity limits",
            # Honest: Tier-4 CAN starve by design in triage; routine fairness is
            # starvation-free only when battery > 0 and deficits finite.
            "starvation_probability": (
                "0.00% routine (non-zero battery, max-min guarantees non-zero share); "
                "Tier-4 sheddable by design in DISASTER_TRIAGE"
                if sim_data["audit_ledger"].get("tier1_unmet_kwh_day", 0) <= 0.01
                else f"Tier-1 shortfall {sim_data['audit_ledger'].get('tier1_unmet_kwh_day')} kWh — grid backup required"
            ),
            "disaster_protocol": "Life-safety (Medical Point & Server Room) locked Tier-1 priority",
            "verification_status": sim_data["audit_ledger"].get("verification_status"),
        },
    })


@lru_cache(maxsize=4)
def _cached_battery_trajectory(rated_kwh: float, rated_kw: float, throughput: float) -> dict:
    """Memoized 5-year aging curve — deterministic given inputs, so recomputing
    on EVERY request (previous behaviour, flagged in review) wasted CPU.
    Cache size 4 covers default + a few custom combos."""
    sim_battery = BatteryHealthState(
        rated_capacity_kwh=rated_kwh,
        rated_power_kw=rated_kw,
        soh_pct=82.0,
    )
    history = []
    milestones = []
    prev_tier = sim_battery.duty_tier
    for day in range(0, 1801, 15):
        if day > 0:
            for _ in range(15):
                sim_battery.record_day_cycling(throughput)
        curr_tier = sim_battery.duty_tier
        if curr_tier != prev_tier:
            milestones.append({
                "day": day,
                "year": round(day / 365.0, 1),
                "from_tier": prev_tier,
                "to_tier": curr_tier,
                "soh_pct": round(sim_battery.soh_pct, 2),
            })
            prev_tier = curr_tier
        history.append({
            "day": day,
            "year": round(day / 365.0, 2),
            "soh_pct": round(sim_battery.soh_pct, 2),
            "duty_tier": curr_tier,
            "usable_capacity_kwh": sim_battery.usable_capacity_kwh,
            "available_power_kw": sim_battery.available_power_kw,
            "total_cycles": round(sim_battery.total_equivalent_cycles, 1),
        })
    return {"trajectory": history, "milestones": milestones}


@app.route("/api/battery/trajectory", methods=["GET"])
def get_battery_trajectory():
    # Optional query overrides (validated + clamped); defaults preserve frontend contract.
    try:
        throughput = _safe_float(request.args.get("daily_throughput_kwh", 200.0), 200.0, 0.0, 1000.0)
    except Exception:
        throughput = 200.0
    data = _cached_battery_trajectory(BATTERY_RATED_CAPACITY_KWH, BATTERY_RATED_POWER_KW, throughput)
    return jsonify({
        "trajectory": data["trajectory"],
        "milestones": data["milestones"],
        "cached": True,
        "tiers": [
            {"tier": tier, "threshold_soh": thresh, "derate_factor": factor}
            for tier, thresh, factor in TIER_THRESHOLDS
        ],
    })


@app.route("/api/privacy/view", methods=["GET"])
def get_privacy_view():
    ok, err = _check_auth_and_rate("privacy")
    if not ok:
        return err  # type: ignore
    hour = _safe_int(request.args.get("hour", 20), 20, 0, 23)
    role = (request.args.get("role", "hostel_a") or "hostel_a").strip()

    try:
        sim_data = execute_simulation()
    except Exception as exc:
        log.exception("privacy/view simulation failed")
        return jsonify({"error": f"Simulation failed: {exc}"}), 500
    hourly_record = next((h for h in sim_data["hourly"] if h["hour"] == hour), sim_data["hourly"][0])

    store = SecureMeterStore()
    store.put_record("sample_hour", hourly_record)
    try:
        _ct = store.get_ciphertext("sample_hour")
        ciphertext_sample = _ct.decode("utf-8", errors="ignore")[:80] + "..."
    except Exception:
        ciphertext_sample = "<ciphertext unavailable>"

    # Legacy 3-block aliases + full 16-building names (Hostel 2 was previously
    # unreachable; hostel_b historically means Hostel 7 — kept for compat).
    role_mapping = {
        "hostel_a": "ITER Boys Hostel 1",
        "hostel_1": "ITER Boys Hostel 1",
        "hostel_b": "ITER Boys Hostel 7",
        "hostel_7": "ITER Boys Hostel 7",
        "hostel_2": "ITER Boys Hostel 2",
        "hostel2": "ITER Boys Hostel 2",
        "academic": "C-Block (Academic)",
        "c-block": "C-Block (Academic)",
        "cblock": "C-Block (Academic)",
        "e_block": "E-Block",
        "eblock": "E-Block",
        "e-block": "E-Block",
        "admin": "admin",
    }
    norm_role = role.lower().strip()
    if norm_role == "admin":
        view = admin_view(hourly_record)
        view_type = "UNREDACTED_CAMPUS_ADMIN"
    else:
        block_name = role_mapping.get(norm_role, role)
        try:
            view = block_view(hourly_record, block_name)
        except ValueError as exc:
            return jsonify({"error": str(exc),
                            "hint": "Use role=admin or a valid building name (e.g. hostel_a, hostel_2, hostel_7, academic)"}), 404
        view_type = f"REDACTED_BLOCK_VIEW_{block_name.upper().replace(' ', '_')}"

    return jsonify({
        "hour": hour,
        "role_requested": role,
        "view_type": view_type,
        "ciphertext_sample": ciphertext_sample,
        "encryption_scheme": "AES-128-CBC + HMAC-SHA256 (Fernet authenticated encryption)",
        "view_data": view,
    })


@app.route("/api/history/30day", methods=["GET"])
def get_historical_30day():
    hist_file = BASE_DIR / "data" / "historical_30day.json"
    if hist_file.exists():
        try:
            with open(hist_file, "r", encoding="utf-8") as f:
                payload = json.load(f)
            # Tag explicitly as static file (photo review noted this is NOT live data).
            if isinstance(payload, dict) and "data_type" not in payload:
                payload["data_type"] = "static_30day_file"
                payload["is_live"] = False
            return jsonify(payload)
        except (json.JSONDecodeError, OSError) as exc:
            log.warning("history/30day read failed: %s", exc)
            return jsonify({"error": f"historical data unreadable: {exc}"}), 500
    return jsonify({"error": "historical data not found — run data/generate_30day_history.py to create it"}), 404


@app.route("/api/history/multiyear", methods=["GET", "POST"])
def get_multiyear_projection():
    """
    Returns 5 to 10 year synthetic benchmark projection with yearly summaries.
    Every response includes the mandatory honesty disclaimer and data_type indicator.
    """
    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
    else:
        data = request.args.to_dict()
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid parameters"}), 400

    try:
        years = _safe_int(data.get("years", 5), 5, 1, 10)
        solar_degrade = _safe_float(data.get("solar_degradation_pct", 0.5), 0.5, 0.0, 5.0)
        tariff_esc = _safe_float(data.get("tariff_escalation_pct", 3.5), 3.5, -5.0, 20.0)
    except Exception as exc:
        return jsonify({"error": f"Invalid parameters: {exc}"}), 400
    include_battery = str(data.get("include_battery_aging", "true")).lower() in ("true", "1", "yes")
    source = str(data.get("source", "legacy") or "legacy").strip().lower()

    monthly_demand = None
    calibration_note = None
    if source == "campus":
        try:
            from data.campus_dataset_store import dataset_present, get_monthly_demand
        except ImportError as exc:
            return jsonify({"error": f"Dataset store unavailable: {exc}"}), 500
        if not dataset_present():
            # Honest fallback: cloud deploys without the 1 GB dataset still work.
            calibration_note = "campus dataset absent on this server — fell back to legacy planning tables"
            log.info("[multiyear] source=campus requested but dataset absent; legacy fallback")
        else:
            monthly_demand = get_monthly_demand()
            if monthly_demand is None:
                calibration_note = "campus dataset incomplete — fell back to legacy planning tables"
            else:
                calibration_note = "Year-1 calibrated from campus meter dataset"

    try:
        projection_result = generate_multiyear_projection(
            years=years,
            solar_degradation_pct=solar_degrade,
            tariff_escalation_pct=tariff_esc,
            include_battery_aging=include_battery,
            monthly_demand_kwh=monthly_demand,
        )
    except Exception as exc:
        log.exception("multiyear projection failed")
        return jsonify({"error": f"Projection failed: {exc}"}), 500
    projection_result["calibration"] = calibration_note or "legacy planning tables"
    return jsonify(projection_result)


# ---- Campus meter dataset (see data/generate_campus_dataset.py) ----
# Additive endpoints only; existing history routes untouched. 404 with a clear
# message when the dataset was never generated (e.g. fresh cloud deploy).
@app.route("/api/history/campus/summary", methods=["GET"])
def get_campus_summary():
    try:
        from data.campus_dataset_store import (dataset_present, get_manifest, get_months,
                                               get_buildings, get_building_monthly)
    except ImportError as exc:
        return jsonify({"error": f"Dataset store unavailable: {exc}"}), 500
    if not dataset_present():
        return jsonify({"error": "Campus meter dataset not generated on this server",
                        "hint": "Run data/generate_campus_dataset.py --days 365"}), 404
    return jsonify({"manifest": get_manifest(), "months": get_months(),
                    "buildings": get_buildings(),
                    "building_monthly": get_building_monthly(),
                    "data_type": "synthetic_campus_meters",
                    "is_live": False})


@app.route("/api/history/campus/daily", methods=["GET"])
def get_campus_daily():
    try:
        from data.campus_dataset_store import dataset_present, get_daily
    except ImportError as exc:
        return jsonify({"error": f"Dataset store unavailable: {exc}"}), 500
    if not dataset_present():
        return jsonify({"error": "Campus meter dataset not generated on this server"}), 404
    month = (request.args.get("month", "") or "").strip()
    if len(month) != 7 or month[4] != "-":
        return jsonify({"error": "month must be YYYY-MM"}), 400
    building = (request.args.get("building", "") or "").strip() or None
    return jsonify({"month": month, "building": building, "days": get_daily(month, building)})


@app.route("/api/history/campus/day", methods=["GET"])
def get_campus_day():
    try:
        from data.campus_dataset_store import dataset_present, get_day
    except ImportError as exc:
        return jsonify({"error": f"Dataset store unavailable: {exc}"}), 500
    if not dataset_present():
        return jsonify({"error": "Campus meter dataset not generated on this server"}), 404
    date = (request.args.get("date", "") or "").strip()
    if len(date) != 10 or date[4] != "-" or date[7] != "-":
        return jsonify({"error": "date must be YYYY-MM-DD"}), 400
    top = _safe_int(request.args.get("top", 6), 6, 1, 16)
    return jsonify(get_day(date, top))


# ---- Campus Load Forecast (Day-Ahead) ----
# Uses trained per-building models (see data/train_load_forecast.py)
# Returns 24-hour ahead forecasts for all buildings
@app.route("/api/forecast/day-ahead", methods=["GET"])
def get_day_ahead_forecast():
    try:
        from data.campus_dataset_store import dataset_present
    except ImportError as exc:
        return jsonify({"error": f"Dataset store unavailable: {exc}"}), 500
    if not dataset_present():
        return jsonify({"error": "Campus meter dataset not generated on this server"}), 404

    # Load all trained models
    import joblib
    import os
    from pathlib import Path

    models_dir = Path(__file__).parent / "data" / "forecast_models"
    if not models_dir.exists():
        return jsonify({"error": "Forecast models not trained. Run data/train_load_forecast.py first."}), 404

    # Get target date (default: tomorrow)
    target_date_str = (request.args.get("date") or "").strip()
    if not target_date_str:
        from datetime import date, timedelta
        target_date = (date.today() + timedelta(days=1)).strftime("%Y-%m-%d")
    else:
        target_date = target_date_str

    # Load weather forecast for target date (placeholder: use historical average or Open-Meteo)
    try:
        from data.open_meteo import fetch_open_meteo_solar
        weather = fetch_open_meteo_solar()
        # Use next day's forecast
        next_day_irradiance = weather.get("next_day_predicted_irradiance_w_per_m2", [])
        if len(next_day_irradiance) < 24:
            next_day_irradiance = [0.0] * 24
    except Exception:
        next_day_irradiance = [0.0] * 24

    # Load campus blocks for solar capacity
    try:
        from data.synthetic_load import real_campus_blocks
    except ImportError:
        from synthetic_load import real_campus_blocks
    campus_blocks = real_campus_blocks()

    # Load all trained models
    import joblib
    from pathlib import Path
    models_dir = Path(__file__).parent / "data" / "forecast_models"
    if not models_dir.exists():
        return jsonify({"error": "Forecast models not found. Run data/train_load_forecast.py first."}), 404

    # Load per-building models (optional - forecast works without them)
    models = {}
    try:
        for model_file in models_dir.glob("model_*.joblib"):
            building_name = model_file.stem.replace("model_", "")
            try:
                models[building_name] = joblib.load(models_dir / model_file)
            except Exception as model_exc:
                log.warning(f"Failed to load model {model_file.name}: {model_exc}")
                continue
    except Exception as exc:
        log.warning(f"Model loading failed, using simplified forecast: {exc}")
        models = {}

    # Load campus blocks for solar capacity
    blocks = {b.name: b for b in campus_blocks}

    # Load historical series for lag features (same source as training)
    import csv
    import math
    from datetime import datetime as dt_mod
    hist_path = Path(__file__).parent / "data" / "campus_dataset" / "hourly_building.csv"
    weather_path = Path(__file__).parent / "data" / "campus_dataset" / "weather.csv"
    series = {}
    weather_map = {}
    try:
        with open(hist_path, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                series.setdefault(r["building"], {})[(r["date"], int(r["hour"]))] = float(r["kwh"])
        with open(weather_path, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                weather_map[r["date"]] = (float(r["tmax_c"]), r.get("rain") == "1")
    except OSError as exc:
        log.warning(f"Historical data unavailable for forecast lags: {exc}")

    # Parse target date for calendar features
    try:
        target_dt = dt_mod.strptime(target_date_str or target_date, "%Y-%m-%d")
    except Exception:
        from datetime import date as date_cls, timedelta as td_cls
        target_dt = dt_mod.combine(date_cls.today() + td_cls(days=1), dt_mod.min.time())
        target_date_str = target_dt.strftime("%Y-%m-%d")
    target_date_s = target_dt.strftime("%Y-%m-%d")
    tmax_target, _ = weather_map.get(target_date_s, (32.0, False))

    HOLIDAYS = {(1, 26), (3, 14), (6, 27), (8, 15), (10, 20), (10, 21), (12, 25)}
    EVENT_THRESH = {"Auditorium": 100, "S-Block": 100, "G-Block": 100, "Library": 100,
                    "Hostel-7": 200, "E-Block": 120}
    # Map block full names (real_campus_blocks) -> CSV/model short names
    NAME_MAP = {
        "Bansuri Guru Auditorium": "Auditorium",
        "C-Block (Academic)": "C-Block",
        "Campus Utility Substation": "EV-Station",
        "Central Library": "Library",
        "Centre for Data Science": "Data-Science",
        "ITER Administrative Block": "B-Block",
        "ITER Boys Hostel 1": "Hostel-1",
        "ITER Boys Hostel 2": "Hostel-2",
        "ITER Boys Hostel 7": "Hostel-7",
        "ITER Cafeteria & Dining": "Cafeteria",
        "Research & Innovation Wing": "Data-Science",
        "S-Block (Sports Complex)": "S-Block",
    }

    def build_features(building, h):
        """21-feature vector matching train_load_forecast.rows_for()."""
        csv_name = NAME_MAP.get(building, building)
        wd = target_dt.weekday()
        doy = target_dt.timetuple().tm_yday
        month = target_dt.month
        day = target_dt.day
        is_weekend = 1.0 if wd >= 5 else 0.0
        holiday = 1.0 if (month, day) in HOLIDAYS else 0.0
        exam_week = 1.0 if month in {4, 5, 11, 12} else 0.0
        bdata = series.get(csv_name, {}) or series.get(building, {})
        d1 = (target_dt - __import__("datetime").timedelta(days=1)).strftime("%Y-%m-%d")
        lag1 = bdata.get((d1, h))
        lag7_vals = []
        for k in range(1, 8):
            dd = (target_dt - __import__("datetime").timedelta(days=k)).strftime("%Y-%m-%d")
            v = bdata.get((dd, h))
            lag7_vals.append(v)
        # Fall back to building mean if history missing (e.g. future dates)
        if lag1 is None or any(v is None for v in lag7_vals):
            all_vals = [v for v in bdata.values()] if bdata else [0.0]
            fallback = sum(all_vals) / max(len(all_vals), 1)
            lag1 = fallback if lag1 is None else lag1
            lag7_vals = [fallback if v is None else v for v in lag7_vals]
        d7_ago = (target_dt - __import__("datetime").timedelta(days=7)).strftime("%Y-%m-%d")
        lag_same_wd = bdata.get((d7_ago, h), lag1)
        mean7 = sum(lag7_vals) / 7.0
        var7 = sum((v - mean7) ** 2 for v in lag7_vals) / 7.0
        return [
            math.sin(2 * math.pi * h / 24), math.cos(2 * math.pi * h / 24),
            math.sin(2 * math.pi * doy / 365), math.cos(2 * math.pi * doy / 365),
            float(wd), float(month), is_weekend, holiday,
            float(lag1), float(lag_same_wd), float(mean7), math.sqrt(max(var7, 0.0)), float(tmax_target),
            0.0,  # is_event (unknown at forecast time -> assume non-event)
            exam_week, holiday, is_weekend,
            math.sin(2 * math.pi * month / 12), math.cos(2 * math.pi * month / 12),
            math.sin(2 * math.pi * day / 31), math.cos(2 * math.pi * day / 31),
        ]

    def predict_building(building, model_obj, h):
        """Run model inference, handling both single regressors and event-driven dicts."""
        x = build_features(building, h)
        try:
            if isinstance(model_obj, dict):
                clf = model_obj.get("clf")
                model_ne = model_obj.get("model_ne")
                model_ev = model_obj.get("model_ev")
                if clf is not None:
                    try:
                        prob = float(clf.predict_proba([x])[0][1])
                    except Exception:
                        prob = 0.0
                else:
                    prob = 0.0
                thresh = EVENT_THRESH.get(building, 100)
                if prob > 0.5 and model_ev is not None:
                    return max(0.0, float(model_ev.predict([x])[0]))
                elif model_ne is not None:
                    return max(0.0, float(model_ne.predict([x])[0]))
                else:
                    # Fallback: lag-based naive forecast
                    return max(0.0, x[8])
            else:
                return max(0.0, float(model_obj.predict([x])[0]))
        except Exception as exc:
            log.warning(f"Predict failed for {building} h={h}: {exc}")
            return max(0.0, x[8])  # lag1 fallback

    # Generate 24-hour forecast for each building using real model inference
    forecast = {}
    buildings_to_forecast = list(models.keys()) if models else list(blocks.keys())
    for building_name in buildings_to_forecast:
        if building_name not in blocks:
            continue
        block = blocks[building_name]
        solar_kwp = block.solar_kwp
        model_obj = models.get(building_name)

        def historical_mean(building, h):
            """7-day same-hour mean from hourly_building.csv (no ML needed)."""
            csv_name = NAME_MAP.get(building, building)
            bdata = series.get(csv_name, {}) or series.get(building, {})
            vals = []
            for k in range(1, 8):
                dd = (target_dt - __import__("datetime").timedelta(days=k)).strftime("%Y-%m-%d")
                v = bdata.get((dd, h))
                if v is not None:
                    vals.append(v)
            if vals:
                return sum(vals) / len(vals)
            all_vals = list(bdata.values()) if bdata else [0.0]
            return sum(all_vals) / max(len(all_vals), 1)

        hourly = []
        for h in range(24):
            solar_kw = round(max(0.0, solar_kwp * next_day_irradiance[h] / 1000.0 * 0.8), 2)
            if model_obj is not None:
                forecast_kw = round(predict_building(building_name, model_obj, h), 2)
            else:
                forecast_kw = round(max(0.0, historical_mean(building_name, h)), 2)
            hourly.append({"hour": h, "solar_kw": solar_kw, "forecast_kw": forecast_kw})

        forecast[building_name] = {
            "building": building_name,
            "solar_kwp": solar_kwp,
            "hourly": hourly,
        }

    model_count = len(models)
    return jsonify({
        "date": target_date_str,
        "forecast": forecast,
        "models_used": model_count,
        "note": f"Live inference from {model_count} trained models" if model_count else "Historical 7-day mean forecast (models unavailable - sklearn version)",
    })

# ---- Campus meter dataset (see data/generate_campus_dataset.py) ----
    return jsonify({"meter_id": meter_id, "date": date, "readings": drill_meter(meter_id, date)})


# Frontend static files routing
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    # Strict /api/ guard (§5.6): case-insensitive, exact segment (previously
    # "apiary/..." false-404'd as JSON while "/API/..." fell through to SPA).
    if (path or "").lower().split("/")[0] == "api":
        return jsonify({"error": "API endpoint not found", "path": path}), 404
    static_folder = Path(app.static_folder)
    if static_folder.exists() and (static_folder / path).exists() and path != "":
        return send_from_directory(str(static_folder), path)
    if static_folder.exists() and (static_folder / "index.html").exists():
        return send_from_directory(str(static_folder), "index.html")
    return jsonify({
        "message": "S24 Digital Twin Backend Server Running",
        "api_endpoints": [
            "/api/status",
            "/api/campus/geojson",
            "/api/simulation/default",
            "/api/simulation/run",
            "/api/simulation/compare",
            "/api/alerts/active",
            "/api/audit/certificate",
            "/api/battery/trajectory",
            "/api/privacy/view",
            "/api/history/30day",
            "/api/history/multiyear",
        ],
    })


if __name__ == "__main__":
    try:
        port = int((app_config.PORT if app_config is not None else os.environ.get("PORT", 5000)))
    except (TypeError, ValueError):
        port = 5000
    log.info("Starting S24 Digital Twin API Server on http://0.0.0.0:%s", port)
    app.run(host="0.0.0.0", port=port, debug=False)
