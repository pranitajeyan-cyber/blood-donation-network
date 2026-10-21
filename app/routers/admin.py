"""Admin endpoints: forecasting, metrics, escalation control and verification."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin
from app.models import AuditLog, Hospital, User
from app.schemas import BacktestOut, ForecastPoint, MetricsOut, UserOut
from app.services.escalation import EscalationOutcome, run_escalation_cycle
from app.services.forecasting import backtest, forecast_shortages, load_series
from app.services.metrics import collect_metrics

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/metrics", response_model=MetricsOut, summary="Headline impact metrics")
def read_metrics(
    db: Session = Depends(get_db), admin: User = Depends(require_admin)
) -> MetricsOut:
    return MetricsOut.model_validate(collect_metrics(db))


@router.get(
    "/forecast",
    response_model=list[ForecastPoint],
    summary="7-day shortage forecast per district and blood group",
)
def read_forecast(
    horizon_days: int = 7,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[ForecastPoint]:
    rows = forecast_shortages(db, horizon_days)
    return [ForecastPoint(**row) for row in rows]


@router.get(
    "/backtest",
    response_model=list[BacktestOut],
    summary="Backtest the forecaster against a seasonal-naive baseline",
)
def read_backtest(
    model: str = "adjusted_ma",
    horizon: int = 7,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[BacktestOut]:
    """Score the model on history it has not seen.

    Run with ``model=adjusted_ma`` and ``model=seasonal_naive`` to compare the
    two numbers directly — the README quotes both.
    """
    if model not in ("adjusted_ma", "seasonal_naive"):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "model must be adjusted_ma or seasonal_naive"
        )

    results: list[BacktestOut] = []
    for (district, blood_group), history in sorted(load_series(db).items()):
        if len(history) < 8:
            continue
        outcome = backtest(history, horizon=horizon, model=model)
        if outcome.samples == 0:
            continue
        results.append(
            BacktestOut(
                district=district,
                blood_group=blood_group,
                wmape=outcome.wmape,
                mae=outcome.mae,
                samples=outcome.samples,
                horizon=outcome.horizon,
            )
        )
    return results


@router.post("/escalate", response_model=list[EscalationOutcome], summary="Run one escalation cycle")
def trigger_escalation(db: Session = Depends(get_db)) -> list[EscalationOutcome]:
    """Sweep every open request through the SLA engine.

    In production this is driven by a Celery beat job every minute; the
    endpoint exists so the behaviour can be demonstrated and tested on demand.
    """
    return run_escalation_cycle(db)


@router.get("/users", response_model=list[UserOut], summary="List all users")
def list_users(
    role: str | None = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[UserOut]:
    query = select(User)
    if role:
        query = query.where(User.role == role.lower())
    rows = (
        db.execute(query.order_by(User.id).limit(limit).offset(offset)).scalars().all()
    )
    return [UserOut.model_validate(row) for row in rows]


@router.post("/hospitals/{hospital_id}/verify", response_model=UserOut)
def verify_hospital(
    hospital_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> UserOut:
    """Approve a hospital's licence after manual review."""
    hospital = db.get(Hospital, hospital_id)
    if hospital is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "hospital not found")

    hospital.verified = True
    db.add(
        AuditLog(
            actor_id=admin.id,
            action="hospital_verified",
            entity="hospital",
            entity_id=str(hospital.id),
            detail=hospital.name,
        )
    )
    db.commit()
    db.refresh(hospital)
    return UserOut.model_validate(hospital.user)


@router.get("/audit", response_model=list[dict])
def read_audit(
    limit: int = 100,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[dict]:
    rows = db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)).all()
    return [
        {
            "id": row.id,
            "actor_id": row.actor_id,
            "action": row.action,
            "entity": row.entity,
            "entity_id": row.entity_id,
            "detail": row.detail,
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]
