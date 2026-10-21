"""Donor matching engine.

Given an open request this finds the donors who are (a) the right blood type,
(b) verified, (c) available, (d) past the statutory 120-day gap and (e) within
the current escalation radius — then ranks them by distance.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.geo import bounding_box, haversine_km
from app.models import (
    RECIPIENT_TO_DONORS,
    AlertLog,
    BloodRequest,
    Match,
    Role,
    User,
    utcnow,
)


def eligible_again_at(donor: User, lock_days: int | None = None) -> datetime:
    """When this donor may donate again (120-day gap by default)."""
    settings = get_settings()
    lock_days = lock_days if lock_days is not None else settings.donor_lock_days
    if donor.last_donation_at is None:
        return datetime.min
    return donor.last_donation_at + timedelta(days=lock_days)


def is_eligible(donor: User, now: datetime | None = None, lock_days: int | None = None) -> bool:
    """True when the donor has served the mandatory gap between donations."""
    if donor.last_donation_at is None:
        return True
    now = now or utcnow()
    return eligible_again_at(donor, lock_days) <= now


def find_donors(
    db: Session,
    request: BloodRequest,
    radius_km: int,
    now: datetime | None = None,
) -> list[tuple[User, float]]:
    """Return ``(donor, distance_km)`` pairs, nearest first.

    The SQL stage is a bounding-box pre-filter — the cheap part that a GIST
    index handles in production via ``ST_DWithin``. The exact haversine
    distance is then computed in Python.
    """
    now = now or utcnow()
    settings = get_settings()

    min_lat, max_lat, min_lon, max_lon = bounding_box(
        request.latitude, request.longitude, radius_km
    )
    compatible_groups = list(RECIPIENT_TO_DONORS.get(request.blood_group, ()))

    rows = (
        db.execute(
            select(User).where(
                User.role == Role.DONOR.value,
                User.verified.is_(True),
                User.is_available.is_(True),
                User.blood_group.in_(compatible_groups),
                User.latitude.is_not(None),
                User.longitude.is_not(None),
                User.latitude.between(min_lat, max_lat),
                User.longitude.between(min_lon, max_lon),
            )
        )
        .scalars()
        .all()
    )

    already_notified = set(
        db.execute(select(Match.donor_id).where(Match.request_id == request.id)).scalars().all()
    )

    candidates: list[tuple[User, float]] = []
    for donor in rows:
        if donor.id in already_notified:
            continue
        if not is_eligible(donor, now, settings.donor_lock_days):
            continue
        distance = haversine_km(
            request.latitude, request.longitude, donor.latitude, donor.longitude
        )
        if distance <= radius_km:
            candidates.append((donor, round(distance, 3)))

    candidates.sort(key=lambda pair: pair[1])
    return candidates


def notify_donors(
    db: Session,
    request: BloodRequest,
    radius_km: int,
    now: datetime | None = None,
) -> int:
    """Create match + alert records for every eligible donor in the radius.

    Returns the number of newly notified donors. Donors who were already
    notified in an earlier escalation tier are skipped, so a request never
    double-alerts the same person.
    """
    now = now or utcnow()
    candidates = find_donors(db, request, radius_km, now)

    for donor, distance in candidates:
        db.add(
            Match(
                request_id=request.id,
                donor_id=donor.id,
                distance_km=distance,
                status="NOTIFIED",
                notified_at=now,
            )
        )
        db.add(
            AlertLog(
                request_id=request.id,
                donor_id=donor.id,
                channel="PUSH",
                tier=request.escalation_tier,
                sent_at=now,
            )
        )

    db.commit()
    return len(candidates)
