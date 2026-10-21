"""The forecasting models and their backtest harness."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.services.forecasting import (
    backtest,
    current_stock,
    day_of_week_factors,
    forecast_series,
    forecast_shortages,
    load_series,
    mae,
    risk_level,
    seasonal_naive,
    wmape,
)
from tests.conftest import make_consumption_series, make_hospital


def _series(values: list[float], start: date = date(2026, 1, 1)) -> list[tuple[date, float]]:
    return [(start + timedelta(days=i), float(v)) for i, v in enumerate(values)]


def test_wmape_is_zero_for_a_perfect_prediction():
    assert wmape([1, 2, 3], [1, 2, 3]) == 0.0


def test_wmape_matches_the_hand_calculation():
    # (|10-12| + |20-18|) / (10 + 20) = 4 / 30
    assert wmape([10, 20], [12, 18]) == pytest.approx(4 / 30)


def test_wmape_handles_an_all_zero_actual_series():
    assert wmape([0, 0], [0, 0]) == 0.0


def test_mae_is_the_mean_absolute_error():
    assert mae([1, 2, 3], [2, 2, 2]) == pytest.approx(2 / 3)


def test_day_of_week_factors_average_around_one():
    series = _series([10, 10, 10, 10, 10, 10, 10])
    factors = day_of_week_factors(series)
    assert sum(factors.values()) / len(factors) == pytest.approx(1.0)


def test_forecast_series_returns_the_requested_horizon():
    series = _series([3, 4, 5, 6, 7, 8, 9])
    predictions = forecast_series(series, horizon=7)

    assert len(predictions) == 7
    assert predictions[0][0] == series[-1][0] + timedelta(days=1)
    assert predictions[-1][0] == series[-1][0] + timedelta(days=7)


def test_forecast_of_a_flat_series_is_flat():
    series = _series([4] * 21)
    predictions = forecast_series(series, horizon=7)
    assert all(value == pytest.approx(4.0) for _, value in predictions)


def test_forecast_uses_the_weekday_effect():
    """Monday-heavy demand should produce a higher Monday forecast."""
    history: list[tuple[date, float]] = []
    start = date(2026, 1, 5)  # a Monday
    for week in range(4):
        for day in range(7):
            history.append((start + timedelta(days=week * 7 + day), 12.0 if day == 0 else 6.0))

    predictions = forecast_series(history, horizon=7)
    by_weekday = {day.weekday(): value for day, value in predictions}

    assert by_weekday[0] > by_weekday[3]  # Monday above Wednesday


def test_seasonal_naive_repeats_the_previous_week():
    history = _series([1, 2, 3, 4, 5, 6, 7])
    predictions = seasonal_naive(history, horizon=7)

    assert len(predictions) == 7
    assert predictions[0][1] == pytest.approx(1.0)
    assert predictions[6][1] == pytest.approx(7.0)


def test_backtest_reports_a_positive_sample_count():
    history = _series([3 + (i % 4) for i in range(40)])
    outcome = backtest(history, horizon=7, split=0.8)

    assert outcome.samples > 0
    assert outcome.wmape >= 0
    assert outcome.mae >= 0
    assert len(outcome.actual) == len(outcome.predicted)


def test_backtest_needs_enough_history():
    outcome = backtest(_series([1, 2]), horizon=7)
    assert outcome.samples == 0


def test_both_models_run_through_the_same_harness():
    history = _series([5 + (i % 3) for i in range(60)])
    for model in ("adjusted_ma", "seasonal_naive"):
        outcome = backtest(history, horizon=7, model=model)
        assert outcome.samples > 0


def test_risk_levels():
    assert risk_level(0, 5) == "HIGH"      # nothing in stock, demand expected
    assert risk_level(5, 5) == "MEDIUM"    # exactly enough, no buffer
    assert risk_level(6, 5) == "MEDIUM"    # within 25% of demand
    assert risk_level(20, 5) == "LOW"      # comfortable buffer
    assert risk_level(0, 0) == "LOW"       # no demand expected


def test_load_series_groups_by_district_and_group(db):
    hospital = make_hospital(db)
    make_consumption_series(db, hospital, blood_group="O+", days=10)

    series = load_series(db)

    assert ("Coimbatore", "O+") in series
    assert len(series[("Coimbatore", "O+")]) == 10


def test_forecast_shortages_returns_one_row_per_future_day(db):
    hospital = make_hospital(db)
    make_consumption_series(db, hospital, blood_group="O+", days=30)

    rows = forecast_shortages(db, horizon_days=7)

    assert len(rows) == 7
    assert {row["district"] for row in rows} == {"Coimbatore"}
    assert {row["blood_group"] for row in rows} == {"O+"}
    assert all(row["risk"] in ("HIGH", "MEDIUM", "LOW") for row in rows)


def test_current_stock_sums_inventory_across_hospitals(db):
    from app.models import Inventory

    hospital_a = make_hospital(db, name="A")
    hospital_b = make_hospital(db, name="B")
    db.add(Inventory(hospital_id=hospital_a.id, blood_group="O+", units_in_stock=3))
    db.add(Inventory(hospital_id=hospital_b.id, blood_group="O+", units_in_stock=4))
    db.commit()

    assert current_stock(db)[("Coimbatore", "O+")] == 7
