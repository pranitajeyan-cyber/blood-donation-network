"""SQLAlchemy ORM models.

Schema follows ``docs/TECHNICAL_FRAMEWORK.md`` (section 3) with two deliberate
changes for the local MVP:

* ``users`` is the single identity table for donors, hospital staff and admins
  (one auth path, role-based authorisation), and ``hospitals`` holds the
  hospital-specific attributes keyed by ``user_id``.
* Coordinates are stored as plain ``latitude`` / ``longitude`` floats rather
  than a PostGIS ``geography`` column. The column names map 1:1 to the PostGIS
  design, so the migration is a data-type swap plus a generated column.
"""

from __future__ import annotations

import enum
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# --------------------------------------------------------------------------
# Domain vocabularies
# --------------------------------------------------------------------------

BLOOD_GROUPS: tuple[str, ...] = ("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")

#: Which recipient blood groups a donor of a given group can donate to.
DONOR_TO_RECIPIENT: dict[str, frozenset[str]] = {
    "O-": frozenset(BLOOD_GROUPS),
    "O+": frozenset({"O+", "A+", "B+", "AB+"}),
    "A-": frozenset({"A-", "A+", "AB-", "AB+"}),
    "A+": frozenset({"A+", "AB+"}),
    "B-": frozenset({"B-", "B+", "AB-", "AB+"}),
    "B+": frozenset({"B+", "AB+"}),
    "AB-": frozenset({"AB-", "AB+"}),
    "AB+": frozenset({"AB+"}),
}

#: The inverse view — which donor groups can serve a request for a given
#: recipient group. This is the direction the matching engine needs.
RECIPIENT_TO_DONORS: dict[str, frozenset[str]] = {
    recipient: frozenset(
        donor
        for donor, recipients in DONOR_TO_RECIPIENT.items()
        if recipient in recipients
    )
    for recipient in BLOOD_GROUPS
}

URGENCY_LEVELS = ("NORMAL", "URGENT", "EMERGENCY")
REQUEST_STATUSES = ("OPEN", "MATCHED", "FULFILLED", "EXPIRED", "CANCELLED")
MATCH_STATUSES = ("NOTIFIED", "ACCEPTED", "DECLINED", "CONFIRMED", "EXPIRED")
BAG_STATUSES = ("COLLECTED", "RECEIVED", "TRANSFUSED", "DISCARDED")
ALERT_CHANNELS = ("PUSH", "SMS", "CAREGIVER_SMS")


class Role(enum.StrEnum):
    DONOR = "donor"
    HOSPITAL = "hospital"
    ADMIN = "admin"


def utcnow() -> datetime:
    """Naive UTC timestamp.

    SQLite has no timezone-aware type, so we normalise to naive UTC everywhere
    and compare naive-to-naive. Mixing naive and aware datetimes is the classic
    source of silent off-by-hours bugs in escalation timers.
    """
    return datetime.now(UTC).replace(tzinfo=None)


# --------------------------------------------------------------------------
# Tables
# --------------------------------------------------------------------------


class User(Base):
    """A person who can log in. Donors, hospital staff and admins alike."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    role: Mapped[str] = mapped_column(String(20), nullable=False, default=Role.DONOR.value)

    # Donor attributes
    blood_group: Mapped[str | None] = mapped_column(String(2), nullable=True)
    district: Mapped[str | None] = mapped_column(String(80), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    #: DigiLocker *attestation* token. Never an Aadhaar number — only proof of
    #: identity, so the platform stays inside the DPDP Act's minimisation rule.
    digilocker_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_donation_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    hospital: Mapped[Hospital | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("role IN ('donor','hospital','admin')", name="ck_users_role"),
        CheckConstraint(
            "blood_group IS NULL OR blood_group IN "
            "('A+','A-','B+','B-','AB+','AB-','O+','O-')",
            name="ck_users_blood_group",
        ),
    )


class Hospital(Base):
    """A blood bank or hospital, linked 1:1 to the staff account that owns it."""

    __tablename__ = "hospitals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    license_no: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    district: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    user: Mapped[User] = relationship(back_populates="hospital")
    inventory: Mapped[list[Inventory]] = relationship(
        back_populates="hospital", cascade="all, delete-orphan"
    )


class Inventory(Base):
    """Units of each blood group currently in a hospital's cold storage."""

    __tablename__ = "inventory"

    id: Mapped[int] = mapped_column(primary_key=True)
    hospital_id: Mapped[int] = mapped_column(
        ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    blood_group: Mapped[str] = mapped_column(String(2), nullable=False)
    units_in_stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    hospital: Mapped[Hospital] = relationship(back_populates="inventory")

    __table_args__ = (
        UniqueConstraint("hospital_id", "blood_group", name="uq_inventory_hospital_group"),
        CheckConstraint("units_in_stock >= 0", name="ck_inventory_non_negative"),
    )


class BloodRequest(Base):
    """An active need for blood, raised by a hospital."""

    __tablename__ = "requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    hospital_id: Mapped[int] = mapped_column(
        ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    blood_group: Mapped[str] = mapped_column(String(2), nullable=False, index=True)
    units_needed: Mapped[int] = mapped_column(Integer, nullable=False)
    units_fulfilled: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    urgency: Mapped[str] = mapped_column(String(16), nullable=False, default="NORMAL")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="OPEN", index=True)

    #: Denormalised from the hospital at creation time so that later hospital
    #: moves do not rewrite the history of an open request.
    district: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)

    # Escalation state
    radius_km: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    escalation_tier: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_escalated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    caregiver_alerted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    hospital: Mapped[Hospital] = relationship()
    matches: Mapped[list[Match]] = relationship(
        back_populates="request", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')",
            name="ck_requests_blood_group",
        ),
        CheckConstraint("units_needed BETWEEN 1 AND 10", name="ck_requests_units_needed"),
        CheckConstraint("urgency IN ('NORMAL','URGENT','EMERGENCY')", name="ck_requests_urgency"),
        CheckConstraint(
            "status IN ('OPEN','MATCHED','FULFILLED','EXPIRED','CANCELLED')",
            name="ck_requests_status",
        ),
    )


class Match(Base):
    """A donor notification for a request."""

    __tablename__ = "matches"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    donor_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    distance_km: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="NOTIFIED")
    notified_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    request: Mapped[BloodRequest] = relationship(back_populates="matches")
    donor: Mapped[User] = relationship()

    __table_args__ = (
        UniqueConstraint("request_id", "donor_id", name="uq_match_request_donor"),
        CheckConstraint(
            "status IN ('NOTIFIED','ACCEPTED','DECLINED','CONFIRMED','EXPIRED')",
            name="ck_match_status",
        ),
    )


class DonationBag(Base):
    """A collected blood bag, tracked end-to-end by barcode.

    This is the "impact transparency" loop: a donor scans their own bag later
    and can see that it reached a patient.
    """

    __tablename__ = "donation_bags"

    id: Mapped[int] = mapped_column(primary_key=True)
    bag_code: Mapped[str] = mapped_column(String(60), unique=True, nullable=False, index=True)
    donor_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hospital_id: Mapped[int] = mapped_column(
        ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False
    )
    blood_group: Mapped[str] = mapped_column(String(2), nullable=False)
    units: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="COLLECTED")
    donated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    donor: Mapped[User] = relationship()
    hospital: Mapped[Hospital] = relationship()

    __table_args__ = (
        CheckConstraint(
            "status IN ('COLLECTED','RECEIVED','TRANSFUSED','DISCARDED')",
            name="ck_bag_status",
        ),
    )


class ConsumptionLog(Base):
    """Daily units consumed per hospital and blood group — the training data
    for the shortage forecaster."""

    __tablename__ = "consumption_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    hospital_id: Mapped[int] = mapped_column(
        ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False
    )
    district: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    blood_group: Mapped[str] = mapped_column(String(2), nullable=False)
    units_consumed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    log_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    is_festival: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    __table_args__ = (
        UniqueConstraint(
            "hospital_id", "blood_group", "log_date", name="uq_consumption_hospital_group_date"
        ),
        Index("ix_consumption_series", "district", "blood_group", "log_date"),
    )


class AlertLog(Base):
    """Audit trail of every notification sent — push, SMS or caregiver SMS.

    Doubles as the raw data for the 'time to first alert' metric.
    """

    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    donor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    channel: Mapped[str] = mapped_column(String(24), nullable=False)
    tier: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sent_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    __table_args__ = (CheckConstraint("channel IN ('PUSH','SMS','CAREGIVER_SMS')", name="ck_alert_channel"),)


class AuditLog(Base):
    """Generic append-only audit trail for admin-sensitive actions."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detail: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
