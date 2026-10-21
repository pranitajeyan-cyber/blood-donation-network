"""Hospital-facing endpoints: inventory, consumption logging, collection."""

from __future__ import annotations

import secrets
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_hospital
from app.models import (
    BloodRequest,
    ConsumptionLog,
    DonationBag,
    Hospital,
    Inventory,
    Match,
    User,
    utcnow,
)
from app.schemas import (
    ConsumptionEntry,
    DonationRecord,
    HospitalOut,
    InventoryItem,
    InventoryUpdate,
)
from app.services.matching import eligible_again_at

router = APIRouter(prefix="/hospitals", tags=["hospitals"])


def _current_hospital(db: Session, user: User) -> Hospital:
    hospital = db.execute(
        select(Hospital).where(Hospital.user_id == user.id)
    ).scalar_one_or_none()
    if hospital is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no hospital linked to this account")
    return hospital


def _parse_date(value: str | None) -> date:
    if value is None:
        return utcnow().date()
    try:
        return datetime.fromisoformat(value).date()
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "log_date must be ISO format") from exc


@router.get("/me", response_model=HospitalOut)
def read_hospital(
    user: User = Depends(require_hospital), db: Session = Depends(get_db)
) -> HospitalOut:
    return HospitalOut.model_validate(_current_hospital(db, user))


@router.get("/me/inventory", response_model=list[InventoryItem])
def read_inventory(
    user: User = Depends(require_hospital), db: Session = Depends(get_db)
) -> list[InventoryItem]:
    hospital = _current_hospital(db, user)
    rows = (
        db.execute(select(Inventory).where(Inventory.hospital_id == hospital.id))
        .scalars()
        .all()
    )
    return [
        InventoryItem(blood_group=item.blood_group, units_in_stock=item.units_in_stock)
        for item in rows
    ]


@router.put("/me/inventory", response_model=InventoryItem)
def set_inventory(
    payload: InventoryItem,
    user: User = Depends(require_hospital),
    db: Session = Depends(get_db),
) -> InventoryItem:
    """Set the absolute stock level for a blood group (idempotent upsert)."""
    hospital = _current_hospital(db, user)
    item = db.execute(
        select(Inventory).where(
            Inventory.hospital_id == hospital.id, Inventory.blood_group == payload.blood_group
        )
    ).scalar_one_or_none()

    if item is None:
        item = Inventory(
            hospital_id=hospital.id, blood_group=payload.blood_group, units_in_stock=0
        )
        db.add(item)

    item.units_in_stock = payload.units_in_stock
    item.updated_at = utcnow()
    db.commit()
    db.refresh(item)
    return InventoryItem(blood_group=item.blood_group, units_in_stock=item.units_in_stock)


@router.post("/me/inventory/adjust", response_model=InventoryItem)
def adjust_inventory(
    payload: InventoryUpdate,
    user: User = Depends(require_hospital),
    db: Session = Depends(get_db),
) -> InventoryItem:
    """Adjust stock by a delta — used when a unit leaves or enters cold storage."""
    hospital = _current_hospital(db, user)
    item = db.execute(
        select(Inventory).where(
            Inventory.hospital_id == hospital.id, Inventory.blood_group == payload.blood_group
        )
    ).scalar_one_or_none()

    if item is None:
        item = Inventory(
            hospital_id=hospital.id, blood_group=payload.blood_group, units_in_stock=0
        )
        db.add(item)

    new_value = item.units_in_stock + payload.delta
    if new_value < 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "inventory cannot go negative")
    item.units_in_stock = new_value
    item.updated_at = utcnow()
    db.commit()
    db.refresh(item)
    return InventoryItem(blood_group=item.blood_group, units_in_stock=item.units_in_stock)


@router.post("/me/consumption", status_code=status.HTTP_201_CREATED)
def log_consumption(
    payload: ConsumptionEntry,
    user: User = Depends(require_hospital),
    db: Session = Depends(get_db),
) -> dict:
    """Record a day of consumption for one blood group.

    This is the input to the forecaster — without this table there is no
    training data and no forecast.
    """
    hospital = _current_hospital(db, user)
    log_date = _parse_date(payload.log_date)

    existing = db.execute(
        select(ConsumptionLog).where(
            ConsumptionLog.hospital_id == hospital.id,
            ConsumptionLog.blood_group == payload.blood_group,
            ConsumptionLog.log_date == log_date,
        )
    ).scalar_one_or_none()

    if existing is None:
        existing = ConsumptionLog(
            hospital_id=hospital.id,
            district=hospital.district,
            blood_group=payload.blood_group,
            units_consumed=payload.units_consumed,
            log_date=log_date,
            is_festival=payload.is_festival,
        )
        db.add(existing)
    else:
        existing.units_consumed = payload.units_consumed
        existing.is_festival = payload.is_festival

    db.commit()
    return {"id": existing.id, "blood_group": existing.blood_group, "log_date": str(existing.log_date)}


@router.post("/me/donations", status_code=status.HTTP_201_CREATED)
def record_donation(
    payload: DonationRecord,
    user: User = Depends(require_hospital),
    db: Session = Depends(get_db),
) -> dict:
    """Register a unit physically collected from a donor.

    This is the authoritative donation record: it creates the barcode-tracked
    bag, starts the donor's 120-day cooldown, decrements cold storage and
    advances the request towards fulfilment.
    """
    hospital = _current_hospital(db, user)

    request = db.get(BloodRequest, payload.request_id)
    if request is None or request.hospital_id != hospital.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "request not found for this hospital")

    donor = db.get(User, payload.donor_id)
    if donor is None or donor.role != "donor":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "donor not found")

    match = db.execute(
        select(Match).where(
            Match.request_id == request.id, Match.donor_id == donor.id
        )
    ).scalar_one_or_none()
    if match is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "this donor was never notified for this request"
        )

    bag_code = payload.bag_code or f"BDN-{secrets.token_hex(5).upper()}"
    bag = DonationBag(
        bag_code=bag_code,
        donor_id=donor.id,
        hospital_id=hospital.id,
        blood_group=donor.blood_group or request.blood_group,
        units=payload.units,
        status="COLLECTED",
        donated_at=utcnow(),
    )
    db.add(bag)

    donor.last_donation_at = bag.donated_at
    match.status = "CONFIRMED"
    match.responded_at = match.responded_at or bag.donated_at

    request.units_fulfilled += payload.units
    if request.units_fulfilled >= request.units_needed:
        request.status = "FULFILLED"
    elif request.status == "OPEN":
        request.status = "MATCHED"

    # Cold storage: the unit is consumed from the requested group's stock.
    inventory = db.execute(
        select(Inventory).where(
            Inventory.hospital_id == hospital.id,
            Inventory.blood_group == request.blood_group,
        )
    ).scalar_one_or_none()
    if inventory is not None:
        inventory.units_in_stock = max(0, inventory.units_in_stock - payload.units)
        inventory.updated_at = utcnow()

    db.commit()
    db.refresh(bag)

    return {
        "bag_code": bag.bag_code,
        "donor_id": donor.id,
        "request_id": request.id,
        "units_fulfilled": request.units_fulfilled,
        "units_needed": request.units_needed,
        "status": request.status,
        "eligible_again_at": eligible_again_at(donor).isoformat(),
    }
