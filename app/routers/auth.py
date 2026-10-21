"""Registration, login and hospital onboarding."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Hospital, Role, User
from app.schemas import (
    HospitalCreate,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_token(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(subject=str(user.id), role=user.role),
        user=UserOut.model_validate(user),
    )


def _get_user_by_email(db: Session, email: str) -> User | None:
    return db.execute(select(User).where(User.email == email.lower())).scalar_one_or_none()


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register as a donor",
)
def register_donor(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    if _get_user_by_email(db, payload.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
    if db.execute(select(User).where(User.phone == payload.phone)).scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "phone already registered")

    user = User(
        name=payload.name,
        email=payload.email.lower(),
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        role=Role.DONOR.value,
        blood_group=payload.blood_group,
        district=payload.district,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _issue_token(user)


@router.post("/hospital/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register_hospital(
    payload: HospitalCreate,
    admin_email: str,
    admin_password: str,
    admin_name: str = "Hospital Admin",
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Create a hospital together with the staff account that manages it.

    In production this endpoint is invitation-only (a hospital is onboarded by
    the regulator); it is public here so the demo can be driven end to end.
    """
    if _get_user_by_email(db, admin_email):
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
    if db.execute(select(Hospital).where(Hospital.license_no == payload.license_no)).scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "license number already registered")

    user = User(
        name=admin_name,
        email=admin_email.lower(),
        phone="9000000000",
        password_hash=hash_password(admin_password),
        role=Role.HOSPITAL.value,
        district=payload.district,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )
    db.add(user)
    db.flush()

    hospital = Hospital(
        user_id=user.id,
        name=payload.name,
        license_no=payload.license_no,
        district=payload.district,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )
    db.add(hospital)
    db.commit()
    db.refresh(user)
    return _issue_token(user)


@router.post("/login", response_model=TokenResponse, summary="Exchange credentials for a JWT")
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = _get_user_by_email(db, payload.email)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "incorrect email or password")
    return _issue_token(user)


@router.get("/me", response_model=UserOut, summary="Current user profile")
def read_me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)
