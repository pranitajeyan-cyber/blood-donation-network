"""Shared pytest fixtures.

Every test gets an isolated in-memory SQLite database — no containers, no
migrations, fast enough to run on every save.
"""

from __future__ import annotations

import itertools
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import create_app
from app.models import (
    BloodRequest,
    ConsumptionLog,
    Hospital,
    Role,
    User,
    utcnow,
)
from app.security import hash_password


@pytest.fixture()
def engine():
    """A fresh in-memory database per test.

    ``StaticPool`` is essential: without it SQLAlchemy opens a new connection
    per thread, and every thread would get its own empty in-memory database.
    FastAPI's TestClient runs the app in a different thread to the test.
    """
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(bind=test_engine)
    yield test_engine
    test_engine.dispose()


@pytest.fixture()
def db(engine):
    """A session bound to the in-memory database."""
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db, engine):
    """A TestClient whose dependency override points at the test database."""
    import app.database as database

    # Point the app's startup create_all() at the in-memory engine so running
    # the tests never touches the real bdn.db file.
    original_engine = database.engine
    database.engine = engine

    app = create_app()

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        database.engine = original_engine


# --------------------------------------------------------------------------
# Factory helpers
# --------------------------------------------------------------------------

_user_counter = itertools.count(1)


def make_user(
    db,
    *,
    role: str = Role.DONOR.value,
    blood_group: str | None = "O+",
    latitude: float | None = 11.0168,
    longitude: float | None = 76.9558,
    verified: bool = True,
    is_available: bool = True,
    email: str | None = None,
    last_donation_at=None,
) -> User:
    counter = next(_user_counter)
    user = User(
        name="Test User",
        email=email or f"user{counter}@example.com",
        phone=f"9{counter:09d}",
        password_hash=hash_password("password123"),
        role=role,
        blood_group=blood_group,
        district="Coimbatore",
        latitude=latitude,
        longitude=longitude,
        verified=verified,
        is_available=is_available,
        last_donation_at=last_donation_at,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def make_hospital(
    db,
    *,
    name: str = "Test Hospital",
    district: str = "Coimbatore",
    latitude: float = 11.0168,
    longitude: float = 76.9558,
    verified: bool = True,
) -> Hospital:
    staff = make_user(
        db,
        role=Role.HOSPITAL.value,
        blood_group=None,
        latitude=latitude,
        longitude=longitude,
        verified=verified,
        email=f"hospital{next(_user_counter)}@example.com",
    )
    hospital = Hospital(
        user_id=staff.id,
        name=name,
        license_no=f"LIC-{next(_user_counter)}",
        district=district,
        latitude=latitude,
        longitude=longitude,
        verified=verified,
    )
    db.add(hospital)
    db.commit()
    db.refresh(hospital)
    return hospital


def make_request(
    db,
    hospital: Hospital,
    *,
    blood_group: str = "O+",
    units_needed: int = 2,
    urgency: str = "URGENT",
    created_at=None,
    radius_km: int = 5,
    escalation_tier: int = 0,
    status: str = "OPEN",
) -> BloodRequest:
    request = BloodRequest(
        hospital_id=hospital.id,
        blood_group=blood_group,
        units_needed=units_needed,
        urgency=urgency,
        status=status,
        district=hospital.district,
        latitude=hospital.latitude,
        longitude=hospital.longitude,
        radius_km=radius_km,
        escalation_tier=escalation_tier,
        expires_at=utcnow() + timedelta(hours=6),
    )
    if created_at is not None:
        request.created_at = created_at
        request.expires_at = created_at + timedelta(hours=6)
        request.last_escalated_at = created_at
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


def make_consumption_series(
    db,
    hospital: Hospital,
    blood_group: str = "O+",
    days: int = 30,
    base: float = 3.0,
) -> list[ConsumptionLog]:
    """Create a dated consumption history for one hospital and blood group."""
    rows: list[ConsumptionLog] = []
    today = utcnow().date()
    for days_ago in range(days, 0, -1):
        day = today - timedelta(days=days_ago)
        units = int(base + (days_ago % 3))
        row = ConsumptionLog(
            hospital_id=hospital.id,
            district=hospital.district,
            blood_group=blood_group,
            units_consumed=units,
            log_date=day,
        )
        db.add(row)
        rows.append(row)
    db.commit()
    return rows


def auth_headers(user: User) -> dict:
    """Build an Authorization header for a given user."""
    from app.security import create_access_token

    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role)}"}
