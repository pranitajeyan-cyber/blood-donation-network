"""Blood request lifecycle and donor responses."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user, require_donor, require_staff
from app.models import BloodRequest, Hospital, Match, User, utcnow
from app.schemas import (
    AcceptResponse,
    MatchOut,
    RequestCreate,
    RequestOut,
)
from app.services.escalation import EscalationOutcome, escalate_request
from app.services.matching import notify_donors

router = APIRouter(tags=["requests"])


def _visible_requests_query(user: User):
    if user.role == "admin":
        return select(BloodRequest)
    if user.role == "hospital":
        hospital_id = user.hospital.id if user.hospital else None
        return select(BloodRequest).where(BloodRequest.hospital_id == hospital_id)
    return select(BloodRequest).where(BloodRequest.id == -1)


@router.post(
    "/requests",
    response_model=RequestOut,
    status_code=status.HTTP_201_CREATED,
    summary="Raise a blood request",
)
def create_request(
    payload: RequestCreate,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> RequestOut:
    settings = get_settings()

    if user.role == "hospital":
        hospital = user.hospital
        if hospital is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "no hospital linked to this account")
    else:
        hospital = db.execute(
            select(Hospital).where(Hospital.user_id == user.id)
        ).scalar_one_or_none()
        if hospital is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "admin is not linked to a hospital")

    request = BloodRequest(
        hospital_id=hospital.id,
        blood_group=payload.blood_group,
        units_needed=payload.units_needed,
        urgency=payload.urgency,
        status="OPEN",
        district=hospital.district,
        latitude=hospital.latitude,
        longitude=hospital.longitude,
        radius_km=settings.escalation_radii_km[0],
        escalation_tier=0,
        notes=payload.notes,
        expires_at=utcnow() + timedelta(hours=settings.request_ttl_hours),
    )
    db.add(request)
    db.commit()
    db.refresh(request)

    # Tier 0: alert everyone inside the first radius straight away.
    notify_donors(db, request, request.radius_km)
    return RequestOut.model_validate(request)


@router.get("/requests", response_model=list[RequestOut], summary="List requests")
def list_requests(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    status_filter: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[RequestOut]:
    query = _visible_requests_query(user)
    if status_filter:
        query = query.where(BloodRequest.status == status_filter.upper())
    rows = (
        db.execute(query.order_by(BloodRequest.created_at.desc()).limit(limit).offset(offset))
        .scalars()
        .all()
    )
    return [RequestOut.model_validate(row) for row in rows]


def _load_request(db: Session, request_id: int, user: User) -> BloodRequest:
    request = db.get(BloodRequest, request_id)
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "request not found")
    if user.role == "donor":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "donors cannot read requests directly")
    if user.role == "hospital" and request.hospital_id != (
        user.hospital.id if user.hospital else None
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not your request")
    return request


@router.get("/requests/{request_id}", response_model=RequestOut)
def read_request(
    request_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> RequestOut:
    return RequestOut.model_validate(_load_request(db, request_id, user))


@router.get("/requests/{request_id}/matches", response_model=list[MatchOut])
def list_matches(
    request_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[MatchOut]:
    request = _load_request(db, request_id, user)
    rows = (
        db.execute(select(Match).where(Match.request_id == request.id).order_by(Match.distance_km))
        .scalars()
        .all()
    )
    return [
        MatchOut(
            id=match.id,
            request_id=match.request_id,
            donor_id=match.donor_id,
            donor_name=match.donor.name,
            blood_group=match.donor.blood_group,
            distance_km=match.distance_km,
            status=match.status,
            notified_at=match.notified_at,
            responded_at=match.responded_at,
        )
        for match in rows
    ]


@router.post("/requests/{request_id}/escalate", summary="Force an escalation tick")
def force_escalation(
    request_id: int,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> EscalationOutcome:
    """Run the SLA engine for one request right now.

    Exposed so the escalation behaviour can be demonstrated (and tested)
    without waiting for the scheduler.
    """
    request = _load_request(db, request_id, user)
    return escalate_request(db, request)


@router.post("/requests/{request_id}/cancel", response_model=RequestOut)
def cancel_request(
    request_id: int, user: User = Depends(require_staff), db: Session = Depends(get_db)
) -> RequestOut:
    request = _load_request(db, request_id, user)
    if request.status in ("FULFILLED", "EXPIRED", "CANCELLED"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"request is already {request.status}")
    request.status = "CANCELLED"
    db.commit()
    db.refresh(request)
    return RequestOut.model_validate(request)


@router.post("/matches/{match_id}/accept", response_model=AcceptResponse)
def accept_match(
    match_id: int, donor: User = Depends(require_donor), db: Session = Depends(get_db)
) -> AcceptResponse:
    """A donor accepts the alert and commits to coming in."""
    match = db.get(Match, match_id)
    if match is None or match.donor_id != donor.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "match not found")
    if match.status != "NOTIFIED":
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"match is already {match.status.lower()}"
        )

    request = db.get(BloodRequest, match.request_id)
    if request is None or request.status not in ("OPEN", "MATCHED"):
        raise HTTPException(status.HTTP_409_CONFLICT, "request is no longer open")

    match.status = "ACCEPTED"
    match.responded_at = utcnow()
    if request.status == "OPEN":
        request.status = "MATCHED"
    db.commit()

    return AcceptResponse(
        match_id=match.id,
        request_id=request.id,
        status=match.status,
        distance_km=match.distance_km,
    )


@router.post("/matches/{match_id}/decline", response_model=AcceptResponse)
def decline_match(
    match_id: int, donor: User = Depends(require_donor), db: Session = Depends(get_db)
) -> AcceptResponse:
    """A donor declines — the match closes and the request keeps escalating."""
    match = db.get(Match, match_id)
    if match is None or match.donor_id != donor.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "match not found")
    if match.status != "NOTIFIED":
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"match is already {match.status.lower()}"
        )

    match.status = "DECLINED"
    match.responded_at = utcnow()
    db.commit()

    return AcceptResponse(
        match_id=match.id,
        request_id=match.request_id,
        status=match.status,
        distance_km=match.distance_km,
        message="Thanks for letting us know.",
    )
