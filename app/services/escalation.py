"""SLA escalation engine.

The promise in the pitch: *a request that finds no donor in 15 minutes expands
its radius; at 30 minutes it SMS-blasts the family's emergency caregivers.*

Escalation is a pure function of elapsed time, so it can be replayed for
backtesting and is trivially testable by injecting ``now``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AlertLog, BloodRequest, utcnow
from app.services.matching import notify_donors


@dataclass
class EscalationOutcome:
    """What the engine did for one request on this tick."""

    request_id: int
    previous_tier: int
    current_tier: int
    radius_km: int
    donors_notified: int
    caregiver_alerted: bool
    expired: bool
    action: str


def target_tier(elapsed_minutes: float, tier_minutes: list[int]) -> int:
    """Highest tier whose threshold has been reached."""
    tier = 0
    for index, threshold in enumerate(tier_minutes):
        if elapsed_minutes >= threshold:
            tier = index
    return tier


def escalate_request(
    db: Session, request: BloodRequest, now: datetime | None = None
) -> EscalationOutcome:
    """Advance one request to the tier its age warrants.

    Idempotent: running it twice in the same window changes nothing the
    second time, which is what makes the periodic scheduler safe to retry.
    """
    now = now or utcnow()
    settings = get_settings()

    previous_tier = request.escalation_tier
    previous_radius = request.radius_km
    action = "none"

    # 1. Expiry check comes first — an expired request must not be escalated.
    if now >= request.expires_at and request.status in ("OPEN", "MATCHED"):
        request.status = "EXPIRED"
        db.commit()
        return EscalationOutcome(
            request_id=request.id,
            previous_tier=previous_tier,
            current_tier=previous_tier,
            radius_km=previous_radius,
            donors_notified=0,
            caregiver_alerted=request.caregiver_alerted,
            expired=True,
            action="expired",
        )

    if request.status not in ("OPEN", "MATCHED"):
        return EscalationOutcome(
            request_id=request.id,
            previous_tier=previous_tier,
            current_tier=previous_tier,
            radius_km=previous_radius,
            donors_notified=0,
            caregiver_alerted=request.caregiver_alerted,
            expired=False,
            action="skipped_closed",
        )

    elapsed = (now - request.created_at).total_seconds() / 60.0
    tier = target_tier(elapsed, settings.escalation_tiers_minutes)

    donors_notified = 0
    if tier > previous_tier:
        request.escalation_tier = tier
        request.radius_km = settings.escalation_radii_km[tier]
        request.last_escalated_at = now
        donors_notified = notify_donors(db, request, request.radius_km, now)
        action = f"escalated_to_tier_{tier}"

    # 2. Caregiver SMS blast at the configured deadline.
    caregiver_alerted = request.caregiver_alerted
    if (
        not caregiver_alerted
        and elapsed >= settings.caregiver_escalation_minutes
    ):
        request.caregiver_alerted = True
        caregiver_alerted = True
        db.add(
            AlertLog(
                request_id=request.id,
                donor_id=None,
                channel="CAREGIVER_SMS",
                tier=request.escalation_tier,
                sent_at=now,
            )
        )
        action = f"{action}+caregiver_sms" if action != "none" else "caregiver_sms"

    db.commit()
    return EscalationOutcome(
        request_id=request.id,
        previous_tier=previous_tier,
        current_tier=request.escalation_tier,
        radius_km=request.radius_km,
        donors_notified=donors_notified,
        caregiver_alerted=caregiver_alerted,
        expired=False,
        action=action,
    )


def run_escalation_cycle(db: Session, now: datetime | None = None) -> list[EscalationOutcome]:
    """Run the engine across every request that is still open."""
    now = now or utcnow()
    open_requests = (
        db.execute(
            select(BloodRequest).where(BloodRequest.status.in_(("OPEN", "MATCHED")))
        )
        .scalars()
        .all()
    )
    return [escalate_request(db, request, now) for request in open_requests]
