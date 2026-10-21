"""Public platform metadata.

Nothing in here is user data — just the SLA parameters the escalation engine
actually reads, plus aggregate counts. The web client renders these instead of
hard-coding its own copy of the rules, so the site can never drift away from
the backend's real configuration.
"""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import BLOOD_GROUPS, BloodRequest, DonationBag, Hospital, User
from app.services.forecasting import backtest, load_series

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/spec", summary="The operating rules the platform actually runs")
def read_spec() -> dict:
    """The escalation ladder, cooldown window and forecast horizon.

    These values are read straight out of :class:`app.config.Settings`, so what
    the site describes is exactly what the engine will do.
    """
    settings = get_settings()
    return {
        "app_name": settings.app_name,
        "version": settings.version,
        "blood_groups": list(BLOOD_GROUPS),
        "escalation": {
            "tier_minutes": settings.escalation_tiers_minutes,
            "radii_km": settings.escalation_radii_km,
            "caregiver_escalation_minutes": settings.caregiver_escalation_minutes,
        },
        "donor_lock_days": settings.donor_lock_days,
        "request_ttl_hours": settings.request_ttl_hours,
        "forecast_horizon_days": settings.forecast_horizon_days,
    }


@router.get("/pulse", summary="Aggregate network counters")
def read_pulse(db: Session = Depends(get_db)) -> dict:
    """Counts only — never a name, an email or a location.

    These are what the landing page renders, so the figures on the front page
    are counted from the live database rather than written into the markup.
    """
    donors_total = db.execute(
        select(func.count()).select_from(User).where(User.role == "donor")
    ).scalar_one()
    donors_verified = db.execute(
        select(func.count())
        .select_from(User)
        .where(User.role == "donor", User.verified.is_(True))
    ).scalar_one()
    donors_available = db.execute(
        select(func.count())
        .select_from(User)
        .where(User.role == "donor", User.is_available.is_(True))
    ).scalar_one()
    hospitals = db.execute(select(func.count()).select_from(Hospital)).scalar_one()
    open_requests = db.execute(
        select(func.count())
        .select_from(BloodRequest)
        .where(BloodRequest.status.in_(("OPEN", "MATCHED")))
    ).scalar_one()
    fulfilled_requests = db.execute(
        select(func.count())
        .select_from(BloodRequest)
        .where(BloodRequest.status == "FULFILLED")
    ).scalar_one()
    units_fulfilled = db.execute(
        select(func.coalesce(func.sum(BloodRequest.units_fulfilled), 0))
    ).scalar_one()
    bags = db.execute(select(func.count()).select_from(DonationBag)).scalar_one()

    return {
        "donors_total": donors_total,
        "donors_verified": donors_verified,
        "donors_available": donors_available,
        "hospitals": hospitals,
        "open_requests": open_requests,
        "fulfilled_requests": fulfilled_requests,
        "units_fulfilled": int(units_fulfilled),
        "bags_tracked": bags,
    }


# --------------------------------------------------------------------------
# Model accuracy — computed live, not baked into the markup
# --------------------------------------------------------------------------

_ACCURACY_CACHE: dict[str, object] = {"at": 0.0, "value": None}
_ACCURACY_TTL_SECONDS = 60.0


@router.get("/accuracy", summary="Backtest scores for the shortage forecaster")
def read_accuracy(db: Session = Depends(get_db)) -> dict:
    """Score both forecasters through the same harness, right now.

    The landing page renders whatever comes back from here, so the accuracy
    figure on the front page is the accuracy of the model running on this
    database — not a number someone typed into a README.
    """
    now = time.monotonic()
    if (
        _ACCURACY_CACHE["value"] is not None
        and now - float(_ACCURACY_CACHE["at"]) < _ACCURACY_TTL_SECONDS
    ):
        return _ACCURACY_CACHE["value"]  # type: ignore[return-value]

    settings = get_settings()
    horizon = settings.forecast_horizon_days
    series = load_series(db)

    scores: dict[str, list[float]] = {"adjusted_ma": [], "seasonal_naive": []}
    rows: list[dict] = []

    for (district, blood_group), history in sorted(series.items()):
        if len(history) < 8:
            continue
        model_scores: dict[str, float] = {}
        for model in scores:
            outcome = backtest(
                history,
                horizon=horizon,
                split=settings.backtest_split,
                model=model,
            )
            if outcome.samples == 0:
                continue
            scores[model].append(outcome.wmape)
            model_scores[model] = outcome.wmape
        if len(model_scores) == 2:
            rows.append(
                {
                    "district": district,
                    "blood_group": blood_group,
                    "adjusted_ma": model_scores["adjusted_ma"],
                    "seasonal_naive": model_scores["seasonal_naive"],
                }
            )

    def mean(values: list[float]) -> float | None:
        if not values:
            return None
        return round(sum(values) / len(values), 4)

    payload = {
        "horizon_days": horizon,
        "backtest_split": settings.backtest_split,
        "series_scored": len(rows),
        "mean_wmape": {
            "adjusted_ma": mean(scores["adjusted_ma"]),
            "seasonal_naive": mean(scores["seasonal_naive"]),
        },
        "rows": rows,
    }

    _ACCURACY_CACHE["at"] = now
    _ACCURACY_CACHE["value"] = payload
    return payload
