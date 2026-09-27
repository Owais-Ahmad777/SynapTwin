"""
campus_dataset_store.py
-----------------------
Read-only query layer over the generated campus meter dataset
(data/campus_dataset/, see generate_campus_dataset.py).

Dashboard reads the SMALL hourly_building.csv (~5 MB); the 33M-row raw
15-min readings are only touched for capped single-meter drill-downs.
Everything is lazily loaded + memoized. Returns None when the dataset has
not been generated (e.g. fresh Render deploy) so endpoints can 404 cleanly.
"""

import csv
import logging
from functools import lru_cache
from pathlib import Path

log = logging.getLogger("synaptwin.dataset")

BASE_DIR = Path(__file__).parent / "campus_dataset"
MAX_DRILL_ROWS = 2000


def dataset_present() -> bool:
    return (BASE_DIR / "manifest.json").exists() and (BASE_DIR / "hourly_building.csv").exists()


@lru_cache(maxsize=1)
def _load_manifest() -> dict | None:
    try:
        with open(BASE_DIR / "manifest.json", encoding="utf-8") as f:
            return dict(json_load(f))
    except (OSError, ValueError) as exc:
        log.warning("[dataset] manifest unreadable: %s", exc)
        return None


def json_load(f):
    import json
    return json.load(f)


@lru_cache(maxsize=1)
def _load_rooms() -> list[dict]:
    try:
        with open(BASE_DIR / "rooms.csv", encoding="utf-8") as f:
            return list(csv.DictReader(f))
    except OSError:
        return []


@lru_cache(maxsize=1)
def _load_weather() -> dict:
    try:
        with open(BASE_DIR / "weather.csv", encoding="utf-8") as f:
            return {r["date"]: r for r in csv.DictReader(f)}
    except OSError:
        return {}


@lru_cache(maxsize=1)
def _load_hourly() -> list[dict]:
    rows: list[dict] = []
    try:
        with open(BASE_DIR / "hourly_building.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                try:
                    rows.append({"building": r["building"], "date": r["date"],
                                 "hour": int(r["hour"]), "kwh": float(r["kwh"]),
                                 "peak_kw": float(r["peak_kw"])})
                except (ValueError, KeyError):
                    continue
    except OSError as exc:
        log.warning("[dataset] hourly read failed: %s", exc)
    return rows


def get_manifest() -> dict | None:
    return _load_manifest()


def get_monthly_demand() -> list[float] | None:
    """12 monthly campus kWh totals (Jan-Dec) for projection calibration.
    Returns None when the dataset is absent."""
    if not dataset_present():
        return None
    months = get_months()
    if len(months) < 12:
        return None
    return [months[m]["kwh"] for m in range(12)]


def get_buildings() -> list[dict]:
    rooms = _load_rooms()
    agg: dict[str, dict] = {}
    for r in rooms:
        b = agg.setdefault(r["building"], {"building": r["building"], "meters": 0, "types": set()})
        b["meters"] += 1
        b["types"].add(r["type"])
    return [{"building": b["building"], "meters": b["meters"],
             "room_types": sorted(b["types"])} for b in sorted(agg.values(), key=lambda x: x["building"])]


def get_months() -> list[dict]:
    months: dict[str, dict] = {}
    for r in _load_hourly():
        m = r["date"][:7]
        a = months.setdefault(m, {"month": m, "kwh": 0.0, "peak_kw": 0.0, "days": set()})
        a["kwh"] += r["kwh"]
        a["days"].add(r["date"])
    out = [{"month": m, "kwh": round(v["kwh"], 1),
            "peak_kw": 0.0,
            "days": len(v["days"])} for m, v in sorted(months.items())]
    # monthly campus peak = max over hours of summed building kwh
    for o in out:
        mk = o["month"]
        per_hour: dict[tuple, float] = {}
        for r in _load_hourly():
            if r["date"].startswith(mk):
                k = (r["date"], r["hour"])
                per_hour[k] = per_hour.get(k, 0.0) + r["kwh"]
        o["peak_kw"] = round(max(per_hour.values()) if per_hour else 0.0, 1)
    return out


def get_building_monthly() -> list[dict]:
    """Per-building monthly kWh + peak (192 rows max). Lets frontend rank
    buildings (e.g. Hostel-7 vs Hostel-1) from metered data."""
    agg: dict[tuple, dict] = {}
    for r in _load_hourly():
        k = (r["building"], r["date"][:7])
        a = agg.setdefault(k, {"building": r["building"], "month": r["date"][:7],
                               "kwh": 0.0, "peak_kw": 0.0})
        a["kwh"] += r["kwh"]
        a["peak_kw"] = max(a["peak_kw"], r["peak_kw"])
    return [{"building": b, "month": m, "kwh": round(v["kwh"], 1),
             "peak_kw": round(v["peak_kw"], 1)}
            for (b, m), v in sorted(agg.items())]


def get_daily(month: str, building: str | None = None) -> list[dict]:
    days: dict[str, dict] = {}
    for r in _load_hourly():
        if not r["date"].startswith(month):
            continue
        if building and r["building"] != building:
            continue
        a = days.setdefault(r["date"], {"date": r["date"], "kwh": 0.0, "peak_kw": 0.0})
        a["kwh"] += r["kwh"]
        a["peak_kw"] = max(a["peak_kw"], r["peak_kw"])
    w = _load_weather()
    out = []
    for d in sorted(days):
        out.append({"date": d, "kwh": round(days[d]["kwh"], 1),
                    "peak_kw": round(days[d]["peak_kw"], 1),
                    "rain": (w.get(d) or {}).get("rain", "0") == "1",
                    "tmax_c": (w.get(d) or {}).get("tmax_c")})
    return out


def get_day(date: str, top: int = 6) -> dict:
    per_b: dict[str, list] = {}
    for r in _load_hourly():
        if r["date"] == date:
            per_b.setdefault(r["building"], []).append(r)
    totals = {b: sum(x["kwh"] for x in v) for b, v in per_b.items()}
    leaders = sorted(totals, key=lambda b: -totals[b])[: max(1, top)]
    hours = []
    for h in range(24):
        row: dict = {"hour": h}
        for b in leaders:
            v = next((x for x in per_b[b] if x["hour"] == h), None)
            row[b] = round(v["kwh"], 2) if v else 0.0
        row["campus"] = round(sum(x["kwh"] for b, v in per_b.items()
                                  for x in v if x["hour"] == h), 1)
        hours.append(row)
    return {"date": date, "top_buildings": leaders, "hours": hours,
            "totals": {b: round(totals[b], 1) for b in leaders}}


def drill_meter(meter_id: str, date: str) -> list[dict]:
    month = date[:7]
    path = BASE_DIR / "readings" / f"{month}.csv"
    out: list[dict] = []
    try:
        with open(path, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r["meter_id"] == meter_id and r["timestamp"].startswith(date):
                    out.append({"timestamp": r["timestamp"],
                                "kw": float(r["kw"]), "flag": r.get("flag", "")})
                    if len(out) >= MAX_DRILL_ROWS:
                        break
    except (OSError, ValueError) as exc:
        log.warning("[dataset] drill failed: %s", exc)
    return out
