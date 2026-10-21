"""Pydantic request/response schemas."""

from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import BLOOD_GROUPS

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^[0-9]{10}$")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(max_length=255)
    phone: str = Field(min_length=10, max_length=20)
    password: str = Field(min_length=8, max_length=128)
    blood_group: str | None = None
    district: str | None = Field(default=None, max_length=80)
    latitude: float | None = None
    longitude: float | None = None

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("invalid email address")
        return v

    @field_validator("phone")
    @classmethod
    def _check_phone(cls, v: str) -> str:
        v = v.strip()
        if not PHONE_RE.match(v):
            raise ValueError("phone must be 10 digits")
        return v

    @field_validator("blood_group")
    @classmethod
    def _check_group(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if v not in BLOOD_GROUPS:
            raise ValueError(f"blood_group must be one of {list(BLOOD_GROUPS)}")
        return v

    @field_validator("latitude")
    @classmethod
    def _check_lat(cls, v: float | None) -> float | None:
        if v is not None and not -90 <= v <= 90:
            raise ValueError("latitude out of range")
        return v

    @field_validator("longitude")
    @classmethod
    def _check_lon(cls, v: float | None) -> float | None:
        if v is not None and not -180 <= v <= 180:
            raise ValueError("longitude out of range")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(ORMModel):
    id: int
    name: str
    email: str
    phone: str
    role: str
    blood_group: str | None = None
    district: str | None = None
    verified: bool
    is_available: bool
    last_donation_at: datetime | None = None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --------------------------------------------------------------------------
# Donors
# --------------------------------------------------------------------------


class DonorUpdate(BaseModel):
    blood_group: str | None = None
    district: str | None = Field(default=None, max_length=80)
    latitude: float | None = None
    longitude: float | None = None
    is_available: bool | None = None

    @field_validator("blood_group")
    @classmethod
    def _check_group(cls, v: str | None) -> str | None:
        if v is not None and v not in BLOOD_GROUPS:
            raise ValueError(f"blood_group must be one of {list(BLOOD_GROUPS)}")
        return v


class EligibilityOut(BaseModel):
    donor_id: int
    blood_group: str | None
    eligible: bool
    eligible_again_at: datetime | None
    days_until_eligible: int


class VerificationRequest(BaseModel):
    """DigiLocker attestation token — never an Aadhaar number."""

    digilocker_token: str = Field(min_length=8, max_length=255)


# --------------------------------------------------------------------------
# Hospitals & inventory
# --------------------------------------------------------------------------


class HospitalCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    license_no: str = Field(min_length=3, max_length=60)
    district: str = Field(min_length=2, max_length=80)
    latitude: float
    longitude: float


class HospitalOut(ORMModel):
    id: int
    name: str
    license_no: str
    district: str
    latitude: float
    longitude: float
    verified: bool


class InventoryItem(BaseModel):
    blood_group: str
    units_in_stock: int = Field(ge=0)


class InventoryUpdate(BaseModel):
    blood_group: str
    delta: int = Field(ge=-1000, le=1000)


# --------------------------------------------------------------------------
# Requests & matches
# --------------------------------------------------------------------------


class RequestCreate(BaseModel):
    blood_group: str
    units_needed: int = Field(ge=1, le=10)
    urgency: str = "NORMAL"
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("blood_group")
    @classmethod
    def _check_group(cls, v: str) -> str:
        if v not in BLOOD_GROUPS:
            raise ValueError(f"blood_group must be one of {list(BLOOD_GROUPS)}")
        return v

    @field_validator("urgency")
    @classmethod
    def _check_urgency(cls, v: str) -> str:
        v = v.upper()
        if v not in ("NORMAL", "URGENT", "EMERGENCY"):
            raise ValueError("urgency must be NORMAL, URGENT or EMERGENCY")
        return v


class RequestOut(ORMModel):
    id: int
    hospital_id: int
    blood_group: str
    units_needed: int
    units_fulfilled: int
    urgency: str
    status: str
    district: str
    latitude: float
    longitude: float
    radius_km: int
    escalation_tier: int
    caregiver_alerted: bool
    notes: str | None
    expires_at: datetime
    created_at: datetime


class MatchOut(BaseModel):
    id: int
    request_id: int
    donor_id: int
    donor_name: str
    blood_group: str | None
    distance_km: float
    status: str
    notified_at: datetime
    responded_at: datetime | None


class AcceptResponse(BaseModel):
    match_id: int
    request_id: int
    status: str
    distance_km: float
    message: str = "Thanks for accepting. The hospital has been notified."


class DonationResponse(BaseModel):
    donor_id: int
    donated_at: datetime
    eligible_again_at: datetime
    on_hospital_cooldown: bool


class DonationRecord(BaseModel):
    """A unit physically collected by the hospital against an open request."""

    request_id: int
    donor_id: int
    units: int = Field(default=1, ge=1, le=4)
    bag_code: str | None = Field(default=None, max_length=60)


class ConsumptionEntry(BaseModel):
    """One day's units consumed — the training data for the forecaster."""

    blood_group: str
    units_consumed: int = Field(ge=0, le=1000)
    log_date: str | None = None  # ISO date; defaults to today
    is_festival: bool = False

    @field_validator("blood_group")
    @classmethod
    def _check_group(cls, v: str) -> str:
        if v not in BLOOD_GROUPS:
            raise ValueError(f"blood_group must be one of {list(BLOOD_GROUPS)}")
        return v


class BagOut(ORMModel):
    id: int
    bag_code: str
    blood_group: str
    units: int
    status: str
    donated_at: datetime
    hospital_name: str | None = None


# --------------------------------------------------------------------------
# Forecasting & metrics
# --------------------------------------------------------------------------


class ForecastPoint(BaseModel):
    district: str
    blood_group: str
    forecast_date: datetime
    predicted_units: float
    stock_units: int
    risk: str
    wmape: float | None = None


class BacktestOut(BaseModel):
    district: str
    blood_group: str
    wmape: float
    mae: float
    samples: int
    horizon: int


class MetricsOut(BaseModel):
    open_requests: int
    matches_created: int
    matches_accepted: int
    median_match_to_donation_minutes: float | None
    donor_repeat_rate: float
    units_fulfilled: int
