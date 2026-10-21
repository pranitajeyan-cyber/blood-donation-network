"""Shortage forecasting.

The pitch claims we predict *which blood group runs out in which district in
six days*. This module implements that honestly:

* a **day-of-week adjusted moving average** baseline — deliberately simple,
  because a baseline you can explain and backtest beats a black box that
  nobody trusts;
* the same backtest harness applied to a **seasonal naive** predictor, so the
  numbers say which model is actually better;
* **WMAPE** as the accuracy metric (the metric the pitch commits to).

The pure functions are separated from the database code on purpose — the
forecasting maths is unit-testable without a database, which is where most of
the interesting logic lives.

Next step (see README roadmap): gradient boosting with festival/weather
features, evaluated through this exact same backtest harness.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ConsumptionLog, Hospital, Inventory

WINDOW = 7  # days used for the level estimate


# --------------------------------------------------------------------------
# Pure forecasting maths
# --------------------------------------------------------------------------


def moving_average(values: list[float], window: int = WINDOW) -> float:
    """Mean of the last ``window`` values (or all of them if shorter)."""
    if not values:
        return 0.0
    tail = values[-window:]
    return sum(tail) / len(tail)


def day_of_week_factors(series: list[tuple[date, float]]) -> dict[int, float]:
    """Multiplicative weekday effect, normalised so the mean factor is 1.

    Weekends and Mondays genuinely run differently in blood banks (elective
    surgeries cluster on weekdays, trauma is flat), so a weekday term is the
    single cheapest win over a plain moving average.
    """
    if not series:
        return {}

    by_dow: dict[int, list[float]] = {}
    for day, value in series:
        by_dow.setdefault(day.weekday(), []).append(value)

    overall = sum(value for _, value in series) / len(series)
    if overall <= 0:
        return {dow: 1.0 for dow in by_dow}

    factors: dict[int, float] = {}
    for dow, values in by_dow.items():
        dow_mean = sum(values) / len(values)
        factors[dow] = dow_mean / overall
    return factors


def forecast_series(
    history: list[tuple[date, float]], horizon: int = 7
) -> list[tuple[date, float]]:
    """Forecast the next ``horizon`` days from a dated history.

    ``level * weekday_factor`` where ``level`` is a 7-day moving average.
    """
    if not history:
        return []

    history = sorted(history, key=lambda item: item[0])
    level = moving_average([value for _, value in history], WINDOW)
    factors = day_of_week_factors(history)

    last_day = history[-1][0]
    predictions: list[tuple[date, float]] = []
    for step in range(1, horizon + 1):
        target = last_day + timedelta(days=step)
        factor = factors.get(target.weekday(), 1.0)
        predictions.append((target, round(level * factor, 3)))
    return predictions


def seasonal_naive(history: list[tuple[date, float]], horizon: int = 7) -> list[tuple[date, float]]:
    """Repeat the value from the same weekday one week earlier."""
    if not history:
        return []

    history = sorted(history, key=lambda item: item[0])
    lookup = {day: value for day, value in history}
    last_day = history[-1][0]

    predictions: list[tuple[date, float]] = []
    for step in range(1, horizon + 1):
        target = last_day + timedelta(days=step)
        source = target - timedelta(days=7)
        predictions.append((target, float(lookup.get(source, 0.0))))
    return predictions


def wmape(actual: list[float], predicted: list[float]) -> float:
    """Weighted Mean Absolute Percentage Error.

    ``sum(|actual - predicted|) / sum(|actual|)``. Robust to zero-denominator
    days in a way that plain MAPE is not, which matters because blood demand
    has genuine zero days.
    """
    if not actual:
        return 0.0
    denominator = sum(abs(a) for a in actual)
    if denominator == 0:
        return 0.0
    numerator = sum(abs(a - p) for a, p in zip(actual, predicted, strict=True))
    return numerator / denominator


def mae(actual: list[float], predicted: list[float]) -> float:
    """Mean Absolute Error."""
    if not actual:
        return 0.0
    return sum(abs(a - p) for a, p in zip(actual, predicted, strict=True)) / len(actual)


@dataclass
class BacktestResult:
    wmape: float
    mae: float
    samples: int
    horizon: int
    actual: list[float]
    predicted: list[float]


def backtest(
    history: list[tuple[date, float]],
    horizon: int = 7,
    split: float = 0.8,
    model: str = "adjusted_ma",
) -> BacktestResult:
    """Train on the first ``split`` of history, predict the remainder.

    ``model`` is ``"adjusted_ma"`` or ``"seasonal_naive"``. Both are scored
    with the same harness so the comparison is apples-to-apples.
    """
    if len(history) < 4:
        return BacktestResult(0.0, 0.0, 0, horizon, [], [])

    history = sorted(history, key=lambda item: item[0])
    split_index = max(1, int(len(history) * split))
    train = history[:split_index]
    test = history[split_index:]

    predictor = forecast_series if model == "adjusted_ma" else seasonal_naive
    predictions = predictor(train, horizon=len(test))
    predicted_values = [value for _, value in predictions][: len(test)]
    actual_values = [value for _, value in test][: len(predicted_values)]

    if not actual_values:
        return BacktestResult(0.0, 0.0, 0, horizon, [], [])

    return BacktestResult(
        wmape=round(wmape(actual_values, predicted_values), 4),
        mae=round(mae(actual_values, predicted_values), 4),
        samples=len(actual_values),
        horizon=horizon,
        actual=actual_values,
        predicted=predicted_values,
    )


# --------------------------------------------------------------------------
# Database-backed service layer
# --------------------------------------------------------------------------


def load_series(db: Session) -> dict[tuple[str, str], list[tuple[date, float]]]:
    """Build ``{(district, blood_group): [(date, units), ...]}`` from the log."""
    rows = (
        db.execute(
            select(
                ConsumptionLog.district,
                ConsumptionLog.blood_group,
                ConsumptionLog.log_date,
                func.sum(ConsumptionLog.units_consumed).label("units"),
            )
            .group_by(
                ConsumptionLog.district,
                ConsumptionLog.blood_group,
                ConsumptionLog.log_date,
            )
            .order_by(ConsumptionLog.log_date)
        )
        .all()
    )

    series: dict[tuple[str, str], list[tuple[date, float]]] = {}
    for district, blood_group, log_date, units in rows:
        key = (district, blood_group)
        series.setdefault(key, []).append(
            (log_date if isinstance(log_date, date) else log_date.date(), float(units))
        )
    return series


def current_stock(db: Session) -> dict[tuple[str, str], int]:
    """Total units on hand per ``(district, blood_group)``."""
    rows = (
        db.execute(
            select(
                Hospital.district,
                Inventory.blood_group,
                func.sum(Inventory.units_in_stock),
            )
            .join(Inventory, Inventory.hospital_id == Hospital.id)
            .group_by(Hospital.district, Inventory.blood_group)
        )
        .all()
    )
    return {(district, blood_group): int(units or 0) for district, blood_group, units in rows}


def risk_level(stock: int, predicted: float) -> str:
    """HIGH when stock cannot cover the forecast, MEDIUM when it is tight."""
    if predicted <= 0:
        return "LOW"
    if stock < predicted:
        return "HIGH"
    if stock < predicted * 1.25:
        return "MEDIUM"
    return "LOW"


def forecast_shortages(
    db: Session, horizon_days: int = 7
) -> list[dict]:
    """Produce one row per district/blood-group/day of the forecast horizon."""
    series = load_series(db)
    stock = current_stock(db)

    results: list[dict] = []
    for (district, blood_group), history in sorted(series.items()):
        if len(history) < 4:
            continue
        for forecast_date, predicted in forecast_series(history, horizon_days):
            units_on_hand = stock.get((district, blood_group), 0)
            results.append(
                {
                    "district": district,
                    "blood_group": blood_group,
                    "forecast_date": forecast_date,
                    "predicted_units": predicted,
                    "stock_units": units_on_hand,
                    "risk": risk_level(units_on_hand, predicted),
                }
            )
    return results
