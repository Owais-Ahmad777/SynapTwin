"""
solar_forecast.py
-------------------
Predicts next-day solar generation from recent irradiance history, so the
optimizer can plan battery charge/discharge ahead of time instead of only
reacting to real-time numbers.

Model: a simple, explainable linear regression (scikit-learn) over engineered
features (hour-of-day sin/cos encoding + yesterday's same-hour irradiance +
a 3-day trailing average), rather than a black-box deep model. This is a
deliberate choice: judges and campus operators can sanity-check *why* the
model predicts what it does, and it's cheap enough to retrain on-the-fly
with only a few days of data.

Since NASA POWER has ~3-day latency and the live API wasn't reachable from
this build environment, this module generates a small synthetic historical
dataset with realistic day-to-day weather variability (clear / partly
cloudy / monsoon-overcast days) to train and validate against — swap
`generate_synthetic_history()` for real multi-day NASA POWER pulls once you
have network access, no other code changes needed.
"""

import math
import random

import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error

from data.nasa_power import _synthetic_clear_sky_curve


WEATHER_SCALE = {
    "clear": 1.00,
    "partly_cloudy": 0.72,
    "overcast": 0.40,
    "monsoon": 0.22,
}


def generate_synthetic_history(days: int = 14, seed: int = 7) -> list[list[float]]:
    """
    Returns `days` lists of 24 hourly irradiance values (W/m^2), each day
    randomly assigned a weather condition so the training data has the kind
    of day-to-day variability a real Bhubaneswar week would show.
    """
    rng = random.Random(seed)
    base = _synthetic_clear_sky_curve()
    history = []
    for _ in range(days):
        weather = rng.choices(
            list(WEATHER_SCALE.keys()), weights=[0.45, 0.30, 0.15, 0.10]
        )[0]
        scale = WEATHER_SCALE[weather]
        day_curve = [round(v * scale * rng.uniform(0.92, 1.08), 1) for v in base]
        history.append(day_curve)
    return history


def _build_features(history: list[list[float]]) -> tuple[np.ndarray, np.ndarray]:
    """
    For each (day, hour) after day 0, builds a feature row:
      [sin(hour), cos(hour), same_hour_yesterday, trailing_3day_avg_same_hour]
    and the target: that day's actual irradiance at that hour.
    """
    X, y = [], []
    for d in range(1, len(history)):
        for h in range(24):
            same_hour_yesterday = history[d - 1][h]
            window = history[max(0, d - 3):d]
            trailing_avg = sum(day[h] for day in window) / len(window)
            X.append([
                math.sin(2 * math.pi * h / 24),
                math.cos(2 * math.pi * h / 24),
                same_hour_yesterday,
                trailing_avg,
            ])
            y.append(history[d][h])
    return np.array(X), np.array(y)


def train_forecast_model(history: list[list[float]]) -> tuple[LinearRegression, float]:
    """Trains the regression and returns (model, mean_absolute_error on a held-out last day)."""
    if len(history) < 4:
        raise ValueError("Need at least 4 days of history to train + validate the forecast model")

    train_history, test_day = history[:-1], history[-1]
    X_train, y_train = _build_features(train_history)

    model = LinearRegression()
    model.fit(X_train, y_train)

    # Validate on the held-out last day
    X_test, y_test = _build_features(train_history[-3:] + [test_day])
    # only the rows corresponding to the held-out day (last 24 rows)
    X_test_day, y_test_day = X_test[-24:], y_test[-24:]
    preds = model.predict(X_test_day)
    mae = mean_absolute_error(y_test_day, preds)

    return model, mae


def predict_next_day(model: LinearRegression, history: list[list[float]]) -> list[float]:
    """Predicts tomorrow's 24 hourly irradiance values from the last few days of history."""
    features = []
    yesterday = history[-1]
    window = history[-3:]
    for h in range(24):
        same_hour_yesterday = yesterday[h]
        trailing_avg = sum(day[h] for day in window) / len(window)
        features.append([
            math.sin(2 * math.pi * h / 24),
            math.cos(2 * math.pi * h / 24),
            same_hour_yesterday,
            trailing_avg,
        ])
    preds = model.predict(np.array(features))
    return [round(max(float(v), 0.0), 1) if v > 5 else 0.0 for v in preds]


if __name__ == "__main__":
    history = generate_synthetic_history(days=14)
    model, mae = train_forecast_model(history)
    print(f"Validation MAE on held-out day: {mae:.1f} W/m^2")

    forecast = predict_next_day(model, history)
    print("Predicted next-day hourly irradiance (W/m^2):", forecast)
    print("Actual last day (for comparison):            ", history[-1])
