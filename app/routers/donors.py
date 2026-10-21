"""Donor-facing endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import require_donor
from app.models import DonationBag, Match, User, utcnow
from app.schemas import (
    BagOut,
    DonorUpdate,
    EligibilityOut,
    MatchOut,
    UserOut,
    VerificationRequest,
)
from app.services.matching import eligible_again_at, is_eligible

router = APIRouter(prefix="/donors", tags=["donors"])


@router.get("/me", response_model=UserOut)
def read_profile(donor: User = Depends(require_donor)) -> UserOut:
    return UserOut.model_validate(donor)


@router.patch("/me", response_model=UserOut)
def update_profile(
    payload: DonorUpdate,
    donor: User = Depends(require_donor),
    db: Session = Depends(get_db),
) -> UserOut:
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(donor, field, value)
    db.commit()
    db.refresh(donor)
    return UserOut.model_validate(donor)


@router.post("/me/verify", response_model=UserOut, summary="Submit DigiLocker attestation")
def verify_identity(
    payload: VerificationRequest,
    donor: User = Depends(require_donor),
    db: Session = Depends(get_db),
) -> UserOut:
    """Store an attestation token and mark the donor verified.

    Only the *attestation* is stored — never the Aadhaar number itself — so
    the platform satisfies the DPDP Act's data-minimisation requirement and a
    database breach cannot leak identity numbers.
    """
    donor.digilocker_token = payload.digilocker_token
    donor.verified = True
    db.commit()
    db.refresh(donor)
    return UserOut.model_validate(donor)


@router.get("/me/eligibility", response_model=EligibilityOut)
def read_eligibility(donor: User = Depends(require_donor)) -> EligibilityOut:
    settings = get_settings()
    now = utcnow()
    eligible_again = eligible_again_at(donor, settings.donor_lock_days)
    days = max(0, (eligible_again - now).days)
    return EligibilityOut(
        donor_id=donor.id,
        blood_group=donor.blood_group,
        eligible=is_eligible(donor, now, settings.donor_lock_days),
        eligible_again_at=eligible_again,
        days_until_eligible=days,
    )


@router.get("/me/matches", response_model=list[MatchOut], summary="Open requests I was alerted to")
def list_my_matches(
    donor: User = Depends(require_donor), db: Session = Depends(get_db)
) -> list[MatchOut]:
    rows = (
        db.execute(
            select(Match).where(Match.donor_id == donor.id).order_by(Match.notified_at.desc())
        )
        .scalars()
        .all()
    )
    return [
        MatchOut(
            id=match.id,
            request_id=match.request_id,
            donor_id=donor.id,
            donor_name=donor.name,
            blood_group=donor.blood_group,
            distance_km=match.distance_km,
            status=match.status,
            notified_at=match.notified_at,
            responded_at=match.responded_at,
        )
        for match in rows
    ]


@router.get("/me/bags", response_model=list[BagOut], summary="My donation history (barcode trail)")
def list_my_bags(
    donor: User = Depends(require_donor), db: Session = Depends(get_db)
) -> list[BagOut]:
    rows = (
        db.execute(
            select(DonationBag).where(DonationBag.donor_id == donor.id).order_by(
                DonationBag.donated_at.desc()
            )
        )
        .scalars()
        .all()
    )
    return [
        BagOut(
            id=bag.id,
            bag_code=bag.bag_code,
            blood_group=bag.blood_group,
            units=bag.units,
            status=bag.status,
            donated_at=bag.donated_at,
        )
        for bag in rows
    ]


@router.post("/me/cooldown", response_model=EligibilityOut, summary="Record a donation")
def record_donation(
    donor: User = Depends(require_donor), db: Session = Depends(get_db)
) -> EligibilityOut:
    """Mark the donor as having donated now, starting the 120-day cooldown.

    The authoritative donation record is created by the hospital (it is the
    party that physically collects the unit); this endpoint exists so a donor
    can self-report a donation made elsewhere.
    """
    settings = get_settings()
    now = utcnow()
    donor.last_donation_at = now
    db.commit()

    eligible_again = eligible_again_at(donor, settings.donor_lock_days)
    return EligibilityOut(
        donor_id=donor.id,
        blood_group=donor.blood_group,
        eligible=False,
        eligible_again_at=eligible_again,
        days_until_eligible=(eligible_again - now).days,
    )
