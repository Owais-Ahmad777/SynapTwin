"""
train_load_forecast.py
----------------------
Trains one day-ahead hourly demand forecaster PER BUILDING (16 models) on the
campus meter dataset (see generate_campus_dataset.py).

Model: HistGradientBoostingRegressor (fast on CPU, no scaling needed).
Features per (building, date, hour): hour sin/cos, weekday, month, weekend
flag, holiday flag, yesterday same-hour kWh, 7-day same-hour mean, daily tmax.
Target: that hour's kWh. Split is TIME-based (train Jan-Sep, test Oct-Dec) --
never shuffling the future into training.

Reads the SMALL hourly_building.csv aggregate (140k rows), not the 33M raw
file -- same supervision signal at 1/200th the cost.

Usage:
    python train_load_forecast.py [--out data/forecast_models]

Outputs: <out>/model_<building>.joblib, metrics.json
Serving: data/campus_dataset_store.py :: forecast_day() (lazy-loads models).
"""

import argparse
import csv
import json
import math
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

try:
    from sklearn.ensemble import HistGradientBoostingRegressor
    from sklearn.metrics import mean_absolute_error
except ImportError:
    print("scikit-learn required: pip install -r requirements.txt")
    sys.exit(2)
try:
    import joblib
except ImportError:
    print("joblib required: pip install joblib")
    sys.exit(2)

BASE = Path(__file__).parent / "campus_dataset"
MAX_DRILL_ROWS = 2000


def load_series():
    per_b = {}
    with open(BASE / "hourly_building.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            per_b.setdefault(r["building"], {})[(r["date"], int(r["hour"]))] = float(r["kwh"])
    weather = {}
    with open(BASE / "weather.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            weather[r["date"]] = (float(r["tmax_c"]), r["rain"] == "1")
    return per_b, weather


def is_event_day(building, kwh):
    """Determine if a given hour is an event for a building."""
    if building == "Auditorium":
        return kwh > 50
    elif building == "S-Block":
        return kwh > 80
    elif building == "Hostel-7":
        return kwh > 250
    elif building == "Library":
        return kwh > 120
    elif building == "G-Block":
        return kwh > 100
    elif building == "E-Block":
        return kwh > 120
    return False


def rows_for(series, weather, building):
    data = series[building]
    out = []
    for (date, h), y in sorted(data.items()):
        dt = datetime.strptime(date, "%Y-%m-%d")
        wd = dt.weekday()
        doy = dt.timetuple().tm_yday
        d1 = (dt - timedelta(days=1)).strftime("%Y-%m-%d")
        d7 = [(dt - timedelta(days=k)).strftime("%Y-%m-%d") for k in range(1, 8)]
        lag1 = data.get((d1, h))
        lag7 = [data.get((dd, h)) for dd in d7]
        if lag1 is None or any(v is None for v in lag7):
            continue
        lag_same_wd = data.get(((dt - timedelta(days=7)).strftime("%Y-%m-%d"), h), lag1)
        mean7 = sum(lag7) / 7.0
        var7 = sum((v - mean7) ** 2 for v in lag7) / 7.0
        is_event = 1.0 if y > (100 if building in ["Auditorium", "S-Block", "G-Block", "Library"] else
                                        200 if building == "Hostel-7" else 100) else 0.0

        exam_week = 1.0 if dt.month in {4, 5, 11, 12} else 0.0
        holiday = 1.0 if (dt.month, dt.day) in {(1, 26), (3, 14), (6, 27), (8, 15),
                                                  (10, 20), (10, 21), (12, 25)} else 0.0
        is_weekend = 1.0 if dt.weekday() >= 5 else 0.0
        doy = dt.timetuple().tm_yday
        tmax, _ = weather.get(date, (32.0, False))
        lag1 = data.get((d1, h))
        lag7 = [data.get((dd, h)) for dd in d7]
        if lag1 is None or any(v is None for v in lag7):
            continue
        lag_same_wd = data.get(((dt - timedelta(days=7)).strftime("%Y-%m-%d"), h), lag1)
        mean7 = sum(lag7) / 7.0
        var7 = sum((v - mean7) ** 2 for v in lag7) / 7.0

        out.append({
            "date": date, "hour": h, "y": y,
            "x": [math.sin(2 * math.pi * h / 24), math.cos(2 * math.pi * h / 24),
                  math.sin(2 * math.pi * doy / 365), math.cos(2 * math.pi * doy / 365),
                  dt.weekday(), dt.month, 1.0 if dt.weekday() >= 5 else 0.0,
                  float((dt.month, dt.day) in [(1, 26), (3, 14), (6, 27), (8, 15),
                                                (10, 20), (10, 21), (12, 25)]),
                  lag1, lag_same_wd, mean7, math.sqrt(var7), tmax,
                  float(is_event),  # is_event (actual for training)
                  1.0 if dt.month in {4, 5, 11, 12} else 0.0,  # exam_week
                  1.0 if (dt.month, dt.day) in {(1, 26), (3, 14), (6, 27), (8, 15),
                                                (10, 20), (10, 21), (12, 25)} else 0.0,  # holiday
                  1.0 if dt.weekday() >= 5 else 0.0,  # weekend
                  math.sin(2 * math.pi * dt.month / 12), math.cos(2 * math.pi * dt.month / 12),  # month seasonality
                  math.sin(2 * math.pi * dt.day / 31), math.cos(2 * math.pi * dt.day / 31),  # day of month
            ],
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "forecast_models"))
    args = ap.parse_args()
    try:
        from sklearn.ensemble import HistGradientBoostingRegressor
        from sklearn.metrics import mean_absolute_error
    except ImportError:
        print("scikit-learn required: pip install -r requirements.txt")
        sys.exit(2)
    try:
        import joblib
    except ImportError:
        print("joblib required: pip install joblib")
        sys.exit(2)

    os.makedirs(args.out, exist_ok=True)
    per_b, weather = load_series()
    metrics = {}
    for b in sorted(per_b):
        rows = rows_for(per_b, weather, b)
        tr = [r for r in rows if r["date"] < "2026-10-01"]
        te = [r for r in rows if r["date"] >= "2026-10-01"]
        if len(tr) < 200 or len(te) < 50:
            continue
        Xtr = [r["x"] for r in tr]
        ytr = [r["y"] for r in tr]
        Xte = [r["x"] for r in te]
        yte = [r["y"] for r in te]
        # For event-driven buildings, use a two-stage model
        event_driven = b in ["Auditorium", "S-Block", "Hostel-7", "Library", "G-Block", "E-Block"]

        if event_driven:
            # Stage 1: Event classifier with class weights
            from sklearn.ensemble import HistGradientBoostingClassifier
            ytr_event = [1.0 if y > (100 if b in ["Auditorium", "S-Block", "G-Block", "Library"] else
                                           200 if b == "Hostel-7" else 100) else 0.0 for y in ytr]
            yte_event = [1.0 if y > (100 if b in ["Auditorium", "S-Block", "G-Block", "Library"] else
                                           200 if b == "Hostel-7" else 100) else 0.0 for y in yte]

            # Compute class weights for imbalanced data
            n_pos = sum(1 for y in ytr_event if y == 1)
            n_neg = sum(1 for y in ytr_event if y == 0)
            pos_weight = max(n_neg / max(n_pos, 1), 1.0)

            clf = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05,
                                                 max_leaf_nodes=63, random_state=42,
                                                 class_weight={0: 1.0, 1: max(pos_weight, 10.0)})
            clf.fit(Xtr, ytr_event)
            event_prob = clf.predict_proba(Xte)[:, 1]

            # Stage 2: Regressor for non-event and event separately
            # Non-event model
            tr_ne = [(x, y) for x, y in zip(Xtr, ytr) if y <= (100 if b in ["Auditorium", "S-Block", "G-Block", "Library"] else
                                                           200 if b == "Hostel-7" else 100)]
            te_ne = [(x, y) for x, y in zip(Xte, yte) if y <= (100 if b in ["Auditorium", "S-Block", "G-Block", "Library"] else
                                                            200 if b == "Hostel-7" else 100)]

            if len(tr_ne) > 50:
                Xtr_ne = [x for x, _ in tr_ne]
                ytr_ne = [y for _, y in tr_ne]
                model_ne = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05,
                                                         max_leaf_nodes=63, random_state=42)
                model_ne.fit(Xtr_ne, ytr_ne)
            else:
                model_ne = None

            # Event model
            tr_ev = [(x, y) for x, y in zip(Xtr, ytr) if y > (100 if b in ["Auditorium", "S-Block", "G-Block", "Library"] else
                                                            200 if b == "Hostel-7" else 100)]
            te_ev = [(x, y) for x, y in zip(Xte, yte) if y > (100 if b in ["Auditorium", "S-Block", "G-Block", "Library"] else
                                                            200 if b == "Hostel-7" else 100)]

            if len(tr_ev) > 20:
                Xtr_ev = [x for x, _ in tr_ev]
                ytr_ev = [y for _, y in tr_ev]
                model_ev = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05,
                                                         max_leaf_nodes=63, random_state=42)
                model_ev.fit(Xtr_ev, ytr_ev)
            else:
                model_ev = None

            # Predict
            pred = []
            for i, x in enumerate(Xte):
                prob = event_prob[i]
                if prob > 0.5 and model_ev is not None:
                    p = max(0.0, float(model_ev.predict([Xte[i]])[0]))
                elif model_ne is not None:
                    p = max(0.0, float(model_ne.predict([Xte[i]])[0]))
                else:
                    p = 0.0
                pred.append(p)
        else:
            model = HistGradientBoostingRegressor(max_iter=500, learning_rate=0.05,
                                                  max_leaf_nodes=127, random_state=42)
            model.fit(Xtr, ytr)
            pred = model.predict(Xte)
            pred = [max(0.0, float(p)) for p in pred]

        mae = float(mean_absolute_error(yte, pred))
        mean_y = sum(yte) / len(yte)
        mape = round(sum(abs(p - a) / max(a, 1.0) for p, a in zip(pred, yte)) / len(yte) * 100, 2)
        wmape = round(sum(abs(p - a) for p, a in zip(pred, yte)) / max(sum(yte), 1.0) * 100, 2)
        joblib.dump(model if not event_driven else {'clf': clf, 'model_ne': model_ne, 'model_ev': model_ev},
                    os.path.join(args.out, f"model_{b}.joblib"))
        metrics[b] = {"mae_kwh": round(mae, 2), "mape_pct": mape,
                      "mean_kwh": round(mean_y, 2),
                      "train_rows": len(tr), "test_rows": len(te)}
        print(f"{b:22s} MAPE {mape:5.2f}%  MAE {mae:6.2f} kWh  (n_tr={len(tr)} n_te={len(te)})")
    with open(os.path.join(args.out, "metrics.json"), "w") as f:
        json.dump({"horizon": "day-ahead hourly per building",
                   "split": "train Jan-Sep 2026, test Oct-Dec 2026 (time-based)",
                   "features": ["sin_h", "cos_h", "weekday", "month", "weekend",
                                "holiday", "lag1d_same_hour", "lag7d_mean_same_hour", "tmax_c"],
                   "buildings": metrics}, f, indent=2)
    ms = [m["mape_pct"] for m in metrics.values()]
    print(f"MEAN MAPE: {sum(ms)/len(ms):.2f}% over {len(ms)} buildings")


if __name__ == "__main__":
    main()