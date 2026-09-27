"""
generate_campus_dataset.py
--------------------------
Synthetic-but-realistic campus meter dataset for SynapTwin (SOA ITER).

Grain: one row per meter per 15-min interval.
Method: bottom-up. Every room gets (diversified peak kW, type shape, noise);
campus totals emerge — never top-down targets. Seeded RNG => byte-identical
regeneration for the same seed.

Inventory source: campus survey (floor plans, guide maps, signboards, room
counts from SOA team). Entries tagged [M]easured / [A]ssumed in BUILDINGS.

Usage:
    python generate_campus_dataset.py --days 2 --start 2026-01-05   # quick test
    python generate_campus_dataset.py --days 365 --start 2026-01-01 # full year

Outputs (under --out, default data/campus_dataset/):
    buildings.csv, rooms.csv, weather.csv, manifest.json,
    readings/YYYY-MM.csv  (meter_id, timestamp, kw, flag)
    hourly_building.csv   (building, hour, kwh, peak_kw)  # dashboard aggregate

Keep raw 15-min + hourly aggregates: dashboard reads hourly; 15-min stays for
drill-downs and judge questions.
"""

import argparse
import csv
import json
import math
import os
import random
import sys
from datetime import datetime, timedelta

# ----------------------------------------------------------------------------
# Room-type electrical model: connected kW per unit + daily shape family
# ----------------------------------------------------------------------------
# shape params: (day, evening, night) base fractions + peaks list
# peaks: (hour, width_h, height, days) days subset of {WD, SAT, SUN}
ROOM_TYPES = {
    # hostels
    "hostel_ac":      {"kw": 1.50, "base": (0.30, 0.75, 0.90), "peaks": [(8, 1.5, 0.15, "ALL"), (13.5, 1.0, 0.10, "ALL"), (20, 2.0, 0.10, "ALL")]},
    "hostel_nonac":   {"kw": 0.25, "base": (0.30, 0.70, 0.88), "peaks": [(8, 1.5, 0.15, "ALL"), (13.5, 1.0, 0.10, "ALL"), (20, 2.0, 0.10, "ALL")]},
    "hostel_common":  {"kw": 0.40, "base": (0.40, 0.70, 0.90), "peaks": []},
    # academic
    "classroom":      {"kw": 4.00, "base": (0.85, 0.10, 0.00), "peaks": [(13, 1.0, -0.55, "WD")]},
    "lab_machine":    {"kw": 12.0, "base": (0.70, 0.05, 0.00), "peaks": [(10, 2.0, 0.20, "WD"), (15, 2.0, 0.20, "WD")]},
    "lab_computer":   {"kw": 6.00, "base": (0.80, 0.10, 0.00), "peaks": []},
    "lab_science":    {"kw": 8.00, "base": (0.75, 0.10, 0.00), "peaks": []},
    "lab_research":   {"kw": 14.0, "base": (0.70, 0.45, 0.35), "peaks": []},
    "lab_clean":      {"kw": 10.0, "base": (0.80, 0.70, 0.65), "peaks": []},
    "faculty":        {"kw": 1.20, "base": (0.75, 0.10, 0.00), "peaks": []},
    "office":         {"kw": 2.00, "base": (0.80, 0.05, 0.00), "peaks": []},
    "hod":            {"kw": 2.50, "base": (0.80, 0.05, 0.00), "peaks": []},
    "seminar":        {"kw": 10.0, "base": (0.30, 0.10, 0.00), "peaks": [(11, 2.0, 0.50, "WD"), (15, 2.0, 0.50, "WD")]},
    "server":         {"kw": 7.00, "base": (1.00, 1.00, 1.00), "peaks": []},
    # halls / public
    "auditorium_hvac": {"kw": 60.0, "base": (0.00, 0.00, 0.00), "peaks": []},  # event-driven only
    "auditorium_hall": {"kw": 15.0, "base": (0.00, 0.00, 0.00), "peaks": []},  # event-driven only
    "court_hall":     {"kw": 25.0, "base": (0.10, 0.50, 0.00), "peaks": [(18, 2.5, 0.40, "ALL")]},
    "games_room":     {"kw": 4.00, "base": (0.20, 0.60, 0.00), "peaks": [(18, 2.5, 0.30, "ALL")]},
    "library_hall":   {"kw": 15.0, "base": (0.85, 0.30, 0.00), "peaks": [(19, 2.0, 0.15, "ALL")]},
    "kitchen":        {"kw": 20.0, "base": (0.15, 0.15, 0.05), "peaks": [(8, 1.5, 0.65, "ALL"), (13, 1.5, 0.80, "ALL"), (20, 1.5, 0.70, "ALL")]},
    "dining_hvac":    {"kw": 20.0, "base": (0.10, 0.10, 0.00), "peaks": [(8, 1.5, 0.60, "ALL"), (13, 1.5, 0.80, "ALL"), (20, 1.5, 0.65, "ALL")]},
    "corridor":       {"kw": 0.40, "base": (0.70, 0.80, 0.60), "peaks": []},
    "toilet":         {"kw": 0.30, "base": (0.60, 0.40, 0.20), "peaks": []},
    "store":          {"kw": 0.30, "base": (0.30, 0.00, 0.00), "peaks": []},
    "sump":           {"kw": 5.00, "base": (0.00, 0.00, 0.00), "peaks": []},  # rain-driven only
    "lift":           {"kw": 8.00, "base": (0.05, 0.05, 0.02), "peaks": [(9, 1.0, 0.25, "ALL"), (18, 1.0, 0.30, "ALL")]},
    "parking":        {"kw": 0.20, "base": (0.20, 0.80, 0.60), "peaks": []},
    "waiting_hall":   {"kw": 8.00, "base": (0.75, 0.05, 0.00), "peaks": []},
    "fee_counter":    {"kw": 3.00, "base": (0.85, 0.05, 0.00), "peaks": [(11, 2.0, 0.15, "WD")]},
}

# (room_type, count) per floor; floor 0 = ground, -1 = basement
# [M] = measured from team evidence, [A] = assumed (correct freely)
BUILDINGS = {
    "A-Block": {"floors": {0: [("office", 20), ("hod", 3), ("waiting_hall", 1), ("fee_counter", 4), ("store", 2)],
                           1: [("office", 25), ("hod", 2), ("server", 1), ("store", 2)],
                           2: [("office", 25), ("hod", 2), ("store", 2)],
                           3: [("office", 20), ("hod", 2), ("store", 3)]}},
    "B-Block": {"floors": {0: [("lab_machine", 6), ("lab_science", 1), ("faculty", 4)],
                           1: [("classroom", 6), ("faculty", 5), ("hod", 1), ("office", 2), ("lab_computer", 1)],
                           2: [("seminar", 1), ("classroom", 5), ("faculty", 5), ("lab_computer", 2)]}},
    "C-Block": {"floors": {f: [("classroom", 12), ("lab_science", 4), ("faculty", 8), ("office", 3)] for f in (0, 1, 2)}},
    "Auditorium": {"floors": {0: [("auditorium_hall", 1), ("auditorium_hvac", 1)],
                              1: [("auditorium_hall", 1)], 2: [("auditorium_hall", 1)],
                              3: [("office", 4)], 4: [("store", 4)]}},
    "Hostel-1": {"floors": {f: [("hostel_nonac", 30), ("hostel_common", 4)] for f in (0, 1, 2)}},
    "Hostel-2": {"floors": {f: [("hostel_nonac", 30), ("hostel_common", 4)] for f in (0, 1, 2)}},
    "Hostel-7": {"floors": {**{-1: [("parking", 6), ("sump", 2)]},
                            **{f: [("hostel_ac", 33), ("hostel_common", 5)] for f in range(6)}}},
    "F-Block": {"floors": {0: [("lab_machine", 2), ("lab_science", 1), ("store", 3), ("office", 1)],
                           1: [("lab_computer", 1), ("lab_science", 1), ("faculty", 3), ("classroom", 2)],
                           2: [("classroom", 6), ("faculty", 3), ("lab_computer", 1)],
                           3: [("classroom", 7), ("faculty", 3)]}},
    "E-Block": {"floors": {0: [("lab_machine", 4), ("lab_science", 1), ("store", 2)],
                           1: [("classroom", 8), ("faculty", 4)],
                           2: [("classroom", 8), ("faculty", 4)],
                           3: [("lab_science", 4), ("faculty", 3), ("hod", 1)],
                           4: [("lab_science", 4), ("faculty", 3)],
                           5: [("lab_computer", 2), ("seminar", 1), ("faculty", 2)]}},
    "S-Block": {"floors": {-1: [("parking", 8), ("sump", 1)], 0: [("parking", 8)],
                           1: [("classroom", 8), ("faculty", 2)], 2: [("classroom", 8), ("faculty", 2)],
                           3: [("classroom", 6), ("faculty", 2)],
                           4: [("court_hall", 1), ("games_room", 3)], 5: [("court_hall", 1), ("games_room", 2)]}},
    "Data-Science": {"floors": {0: [("lab_computer", 3), ("classroom", 2), ("server", 1)],
                                1: [("lab_computer", 3), ("classroom", 2), ("faculty", 4)]}},
    "Cafeteria": {"floors": {0: [("kitchen", 1), ("dining_hvac", 1), ("store", 2)]}},
    "D-Block": {"floors": {f: [("classroom", 8), ("lab_science", 2), ("faculty", 4)] for f in range(4)}},
    "G-Block": {"floors": {0: [("lab_research", 3), ("office", 2)],
                           1: [("lab_research", 2), ("lab_clean", 1), ("office", 2)],
                           2: [("lab_clean", 2), ("lab_research", 1), ("office", 2)],
                           3: [("lab_research", 2), ("office", 3)],
                           4: [("office", 6), ("hod", 1)],
                           5: [("office", 4), ("seminar", 1)]}},
    "Library": {"floors": {0: [("parking", 6)],
                           **{f: [("library_hall", 2), ("office", 1)] for f in range(1, 6)}}},
    "EV-Station": {"floors": {0: [("lift", 1)]}},
}

# Bhubaneswar planning climate: monthly (avg_high_C, rain_day_fraction)
CLIMATE = [(28, .02), (31, .02), (35, .05), (37, .08), (38, .15), (35, .45),
           (32, .60), (31, .55), (32, .45), (32, .20), (30, .05), (28, .02)]

HOLIDAYS = {(1, 26), (3, 14), (6, 27), (8, 15), (10, 20), (10, 21), (12, 25)}
EXAM_MONTHS = {4, 5, 11, 12}
SUMMER_BREAK = {6}


def gauss(h, c, w):
    return math.exp(-((h - c) ** 2) / (2 * w * w))


def shape_value(spec, h, daykind, ac_boost, rng):
    day, eve, night = spec["base"]
    if 8 <= h < 18:
        v = day
    elif 18 <= h < 22:
        v = eve
    else:
        v = night
    for (c, w, ht, days) in spec["peaks"]:
        if days == "ALL" or (days == "WD" and daykind == "WD"):
            v += ht * gauss(h, c, w)
    return max(0.0, v)


def build_calendar(start, days):
    cal = []
    for i in range(days):
        d = start + timedelta(days=i)
        wd = d.weekday()
        if wd == 6:
            dk = "SUN"
        elif wd == 5:
            dk = "SAT"
        else:
            dk = "WD"
        holiday = (d.month, d.day) in HOLIDAYS
        if holiday:
            dk = "SUN"
        exam = d.month in EXAM_MONTHS
        summer = d.month in SUMMER_BREAK
        cal.append({"date": d, "daykind": dk, "exam": exam, "summer": summer,
                    "holiday": holiday})
    return cal


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--start", default="2026-01-05")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "campus_dataset"))
    args = ap.parse_args()
    rng = random.Random(args.seed)
    start = datetime.strptime(args.start, "%Y-%m-%d")
    cal = build_calendar(start, args.days)

    # Auditorium + court event days: ~2/week + exam blackout
    n_days = args.days
    event_days = {i for i in range(n_days)
                  if cal[i]["daykind"] in ("SAT", "WD") and not cal[i]["exam"] and rng.random() < 0.30}
    court_days = {i for i in range(n_days) if rng.random() < 0.55}

    os.makedirs(args.out, exist_ok=True)
    rdir = os.path.join(args.out, "readings")
    os.makedirs(rdir, exist_ok=True)

    # Meters inventory
    rooms, mid = [], 0
    for bname, b in BUILDINGS.items():
        for floor, groups in sorted(b["floors"].items()):
            for rtype, count in groups:
                for k in range(count):
                    mid += 1
                    spec = ROOM_TYPES[rtype]
                    rooms.append({"meter_id": f"M{mid:05d}", "building": bname, "floor": floor,
                                  "room": f"{bname[:2].upper()}-{floor if floor >= 0 else 'B'}{k+1:02d}",
                                  "type": rtype, "kw": spec["kw"] * rng.uniform(0.92, 1.08)})

    with open(os.path.join(args.out, "rooms.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["meter_id", "building", "floor", "room", "type", "kw"])
        w.writeheader()
        w.writerows(rooms)
    with open(os.path.join(args.out, "buildings.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["building", "meters"])
        w.writeheader()
        for bname in BUILDINGS:
            w.writerow({"building": bname,
                        "meters": sum(1 for r in rooms if r["building"] == bname)})

    # Outage events: roughly monthly, 2-3 h evening window, seeded
    outage = {}
    for i in range(0, n_days, 20):
        if rng.random() < 0.75:
            outage[i] = (rng.choice([18, 19]), rng.choice([2, 3]))

    # Weather table (monthly climate + daily jitter)
    weather = []
    for i, c in enumerate(cal):
        m = c["date"].month - 1
        t_hi, rain_p = CLIMATE[m]
        rain = 1 if rng.random() < rain_p else 0
        t = round(t_hi - rng.uniform(4, 7) + rng.uniform(-1.5, 1.5), 1)
        weather.append({"date": c["date"].strftime("%Y-%m-%d"), "tmax_c": t,
                        "rain": rain, "ghi_peak": round(rng.uniform(640, 860) * (0.35 if rain else 1.0), 1)})
    with open(os.path.join(args.out, "weather.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["date", "tmax_c", "rain", "ghi_peak"])
        w.writeheader()
        w.writerows(weather)

    # Readings, month-partitioned
    files = {}
    hourly = {}
    quarter = {}
    total = 0
    for i, c in enumerate(cal):
        dk, rain = c["daykind"], weather[i]["rain"]
        t = weather[i]["tmax_c"]
        ac_boost = max(0.0, min(1.0, (t - 28) / 10.0))
        occ = 0.25 if (c["summer"] and dk == "WD") else 1.0
        exam_boost = 1.2 if c["exam"] else 1.0
        wknd = 0.15 if dk == "SUN" else (0.5 if dk == "SAT" else 1.0)
        out_h = outage.get(i, (None, 0))
        for q in range(96):
            h = q / 4.0
            ts = (c["date"] + timedelta(minutes=15 * q)).strftime("%Y-%m-%d %H:%M")
            mkey = c["date"].strftime("%Y-%m")
            if mkey not in files:
                fp = open(os.path.join(rdir, f"{mkey}.csv"), "w", newline="")
                wr = csv.writer(fp)
                wr.writerow(["meter_id", "timestamp", "kw", "flag"])
                files[mkey] = (fp, wr)
            _, wr = files[mkey]
            in_outage = out_h[0] is not None and out_h[0] <= h < out_h[0] + out_h[1]
            for r in rooms:
                spec = ROOM_TYPES[r["type"]]
                if in_outage:
                    kw, flag = 0.0, "outage"
                elif r["type"] in ("auditorium_hvac", "auditorium_hall"):
                    kw = r["kw"] * (0.9 if i in event_days and 10 <= h < 22 else 0.0)
                    flag = "event" if kw > 0 else ""
                elif r["type"] in ("court_hall", "games_room"):
                    kw = r["kw"] * (shape_value(spec, h, dk, ac_boost, rng) if i in court_days else spec["base"][2] * 0.3)
                    flag = "" if kw > 0 else ""
                elif r["type"] == "sump":
                    kw = r["kw"] * (0.9 if rain and 6 <= h < 23 else 0.0)
                    flag = "rain" if kw > 0 else ""
                else:
                    v = shape_value(spec, h, dk, ac_boost, rng)
                    if r["type"] in ("classroom", "office", "faculty", "hod", "lab_machine",
                                     "lab_computer", "lab_science", "waiting_hall", "fee_counter",
                                     "seminar"):
                        v *= occ * (wknd if dk != "WD" else 1.0)
                    if r["type"] == "library_hall":
                        v *= exam_boost
                    if r["type"] in ("hostel_ac",):
                        v *= (0.75 + 0.45 * ac_boost)
                    kw = r["kw"] * v * rng.uniform(0.97, 1.03)
                    flag = ""
                    if rng.random() < 0.0008:
                        kw, flag = 0.0, "meter_fault"
                kw = round(max(0.0, kw), 3)
                wr.writerow([r["meter_id"], ts, kw, flag])
                total += 1
                qk = (r["building"], c["date"].strftime("%Y-%m-%d"), q)
                quarter[qk] = quarter.get(qk, 0.0) + kw
                hk = (r["building"], c["date"].strftime("%Y-%m-%d"), int(h))
                a = hourly.get(hk, [0.0, 0.0])
                a[0] += kw / 4.0
                hourly[hk] = a
    for (b, d, q), v in quarter.items():
        hk = (b, d, q // 4)
        a = hourly.get(hk)
        if a is not None:
            a[1] = max(a[1], round(v, 2))
    for fp, _ in files.values():
        fp.close()
    with open(os.path.join(args.out, "hourly_building.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["building", "date", "hour", "kwh", "peak_kw"])
        for (b, d, hh) in sorted(hourly):
            kwh, pk = hourly[(b, d, hh)]
            w.writerow([b, d, hh, round(kwh, 2), round(pk, 2)])
    with open(os.path.join(args.out, "manifest.json"), "w") as f:
        json.dump({"days": args.days, "start": args.start, "seed": args.seed,
                   "meters": len(rooms), "rows": total,
                   "event_days": len(event_days),
                   "note": "Bottom-up synthetic campus telemetry. [M]easured room counts, [A]ssumed densities."}, f, indent=2)
    print(f"meters={len(rooms)} rows={total} months={sorted(set(k[:7] for k in [r for r in os.listdir(rdir)]))}")


if __name__ == "__main__":
    main()
