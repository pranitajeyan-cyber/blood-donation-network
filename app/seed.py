"""Seed the database with a realistic demo dataset.

Run with::

    python -m app.seed

Creates two hospitals, ~60 donors spread across a district, cold-storage
inventory, and 120 days of consumption history so the forecaster has
something real to train and backtest on.
"""

from __future__ import annotations

import math
import random
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal, create_all
from app.models import (
    BLOOD_GROUPS,
    ConsumptionLog,
    Hospital,
    Inventory,
    Role,
    User,
    utcnow,
)
from app.security import hash_password

SEED = 42
DISTRICT = "Coimbatore"
CENTER_LAT, CENTER_LON = 11.0168, 76.9558

#: Relative consumption per blood group (AB- is genuinely rare, O- is the
#: universal donor and therefore always in demand).
GROUP_WEIGHT = {
    "O+": 1.35,
    "O-": 0.45,
    "A+": 1.10,
    "A-": 0.40,
    "B+": 1.00,
    "B-": 0.38,
    "AB+": 0.55,
    "AB-": 0.20,
}

#: Monday-heavy weekday effect for elective procedures.
DOW_FACTOR = {0: 1.15, 1: 1.20, 2: 1.12, 3: 1.05, 4: 1.00, 5: 0.85, 6: 0.75}

FIRST_NAMES = [
    "Arun", "Bhavana", "Chetan", "Deepa", "Ezhil", "Fathima", "Ganesh", "Harini",
    "Ibrahim", "Janani", "Karthik", "Lakshmi", "Mohan", "Nandhini", "Omkar",
    "Priya", "Rakesh", "Sneha", "Tharun", "Uthara", "Vijay", "Yamuna",
]
LAST_NAMES = [
    "Kumar", "Ravi", "Suresh", "Meena", "Krishnan", "Nair", "Iyer", "Pillai",
    "Reddy", "Chowdhury", "Mohan", "Bose", "Sharma", "Patel", "Varma",
]


def _random_point(rng: random.Random, max_km: float = 30.0) -> tuple[float, float]:
    """Scatter a point within ``max_km`` of the district centre.

    The radial distribution is skewed towards the centre (``u ** 1.5``) because
    a real blood bank's donors cluster around it. A uniform spread would leave
    most donors outside even the widest escalation radius and make the demo
    look broken.
    """
    distance = max_km * (rng.random() ** 1.5)
    bearing = rng.uniform(0, 2 * math.pi)
    d_lat = (distance / 111.32) * math.cos(bearing)
    d_lon = (distance / (111.32 * math.cos(math.radians(CENTER_LAT)))) * math.sin(bearing)
    return round(CENTER_LAT + d_lat, 6), round(CENTER_LON + d_lon, 6)


def seed(db: Session) -> None:
    rng = random.Random(SEED)

    existing = db.execute(select(User).where(User.role == Role.ADMIN.value)).scalar_one_or_none()
    if existing is not None:
        print("Database already seeded. Nothing to do.")
        return

    # --- admin ---------------------------------------------------------
    admin = User(
        name="Platform Admin",
        email="admin@bdn.dev",
        phone="9000000001",
        password_hash=hash_password("admin12345"),
        role=Role.ADMIN.value,
        district=DISTRICT,
        latitude=CENTER_LAT,
        longitude=CENTER_LON,
    )
    db.add(admin)
    db.flush()

    # --- hospitals -----------------------------------------------------
    hospital_specs = [
        ("City General Hospital", "LIC-TN-0001", CENTER_LAT, CENTER_LON, True),
        ("Community Blood Bank", "LIC-TN-0002", 11.0358, 76.9695, True),
    ]
    hospitals: list[Hospital] = []
    for index, (name, license_no, lat, lon, verified) in enumerate(hospital_specs, start=1):
        staff = User(
            name=f"{name} Admin",
            email=f"hospital{index}@bdn.dev",
            phone=f"900000001{index}",
            password_hash=hash_password("hospital12345"),
            role=Role.HOSPITAL.value,
            district=DISTRICT,
            latitude=lat,
            longitude=lon,
        )
        db.add(staff)
        db.flush()

        hospital = Hospital(
            user_id=staff.id,
            name=name,
            license_no=license_no,
            district=DISTRICT,
            latitude=lat,
            longitude=lon,
            verified=verified,
        )
        db.add(hospital)
        db.flush()
        hospitals.append(hospital)

        for blood_group in BLOOD_GROUPS:
            db.add(
                Inventory(
                    hospital_id=hospital.id,
                    blood_group=blood_group,
                    units_in_stock=rng.randint(0, 9),
                )
            )

    # --- donors --------------------------------------------------------
    for index in range(60):
        first = FIRST_NAMES[index % len(FIRST_NAMES)]
        last = LAST_NAMES[(index * 7) % len(LAST_NAMES)]
        email = f"{first.lower()}.{last.lower()}{index}@example.com"

        blood_group = BLOOD_GROUPS[index % len(BLOOD_GROUPS)]
        lat, lon = _random_point(rng)
        donor = User(
            name=f"{first} {last}",
            email=email,
            phone=f"9{rng.randint(100000000, 999999999)}",
            password_hash=hash_password("donor12345"),
            role=Role.DONOR.value,
            blood_group=blood_group,
            district=DISTRICT,
            latitude=lat,
            longitude=lon,
            # ~80% of donors are verified; the rest exercise the filter.
            verified=rng.random() < 0.8,
            is_available=rng.random() < 0.9,
            digilocker_token=(
                f"dlk_{rng.getrandbits(96):024x}" if rng.random() < 0.8 else None
            ),
        )
        # A few donors have donated recently and are inside the 120-day lock.
        if rng.random() < 0.15:
            donor.last_donation_at = utcnow() - timedelta(days=rng.randint(1, 90))
        db.add(donor)

    # --- consumption history (the forecasting training set) -------------
    today = utcnow().date()
    for hospital in hospitals:
        for blood_group in BLOOD_GROUPS:
            base = 2.6 * GROUP_WEIGHT[blood_group]
            for days_ago in range(120, 0, -1):
                day = today - timedelta(days=days_ago)
                seasonal = 1 + 0.18 * math.sin(days_ago / 9.0)
                expected = base * DOW_FACTOR[day.weekday()] * seasonal
                units = max(0, int(round(rng.gauss(expected, expected * 0.22))))
                # Occasional festival surge.
                if rng.random() < 0.02:
                    units += rng.randint(2, 5)
                db.add(
                    ConsumptionLog(
                        hospital_id=hospital.id,
                        district=DISTRICT,
                        blood_group=blood_group,
                        units_consumed=units,
                        log_date=day,
                        is_festival=False,
                    )
                )

    db.commit()

    print("Seeded:")
    print("  admin     admin@bdn.dev      / admin12345")
    print("  hospital  hospital1@bdn.dev  / hospital12345")
    print("  hospital  hospital2@bdn.dev  / hospital12345")
    print("  donors    <name>.<last>N@example.com / donor12345")


def main() -> None:
    create_all()
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
