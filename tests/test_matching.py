"""The donor matching engine."""

from __future__ import annotations

from datetime import timedelta

from app.models import Match, utcnow
from app.services.matching import (
    eligible_again_at,
    find_donors,
    is_eligible,
    notify_donors,
)
from tests.conftest import make_hospital, make_request, make_user

HOSPITAL_LAT, HOSPITAL_LON = 11.0168, 76.9558


def test_finds_compatible_donor_inside_radius(db):
    hospital = make_hospital(db)
    request = make_request(db, hospital, blood_group="O+")
    make_user(db, blood_group="O-", latitude=HOSPITAL_LAT + 0.01, longitude=HOSPITAL_LON)

    found = find_donors(db, request, radius_km=5)
    assert len(found) == 1


def test_excludes_donor_outside_radius(db):
    hospital = make_hospital(db)
    request = make_request(db, hospital, blood_group="O+")
    # ~1.1 degrees north is roughly 120 km away.
    make_user(db, blood_group="O-", latitude=HOSPITAL_LAT + 1.0, longitude=HOSPITAL_LON)

    assert find_donors(db, request, radius_km=5) == []


def test_excludes_unverified_donor(db):
    hospital = make_hospital(db)
    request = make_request(db, hospital, blood_group="O+")
    make_user(db, blood_group="O-", verified=False)

    assert find_donors(db, request, radius_km=5) == []


def test_excludes_unavailable_donor(db):
    hospital = make_hospital(db)
    request = make_request(db, hospital, blood_group="O+")
    make_user(db, blood_group="O-", is_available=False)

    assert find_donors(db, request, radius_km=5) == []


def test_excludes_donor_inside_the_120_day_cooldown(db):
    hospital = make_hospital(db)
    request = make_request(db, hospital, blood_group="O+")
    make_user(db, blood_group="O-", last_donation_at=utcnow() - timedelta(days=30))

    assert find_donors(db, request, radius_km=5) == []


def test_allows_donor_past_the_120_day_cooldown(db):
    hospital = make_hospital(db)
    request = make_request(db, hospital, blood_group="O+")
    make_user(db, blood_group="O-", last_donation_at=utcnow() - timedelta(days=121))

    assert len(find_donors(db, request, radius_km=5)) == 1


def test_blood_group_compatibility_is_respected(db):
    """An A+ donor can serve an AB+ request, but not an O- request."""
    hospital = make_hospital(db)

    ab_plus_request = make_request(db, hospital, blood_group="AB+")
    make_user(db, blood_group="A+")

    assert len(find_donors(db, ab_plus_request, radius_km=5)) == 1

    o_minus_request = make_request(db, hospital, blood_group="O-")
    assert find_donors(db, o_minus_request, radius_km=5) == []


def test_universal_donor_matches_every_group(db):
    hospital = make_hospital(db)
    make_user(db, blood_group="O-")
    for blood_group in ("O-", "O+", "A+", "B+", "AB+"):
        request = make_request(db, hospital, blood_group=blood_group)
        assert len(find_donors(db, request, radius_km=5)) == 1


def test_results_are_sorted_by_distance(db):
    hospital = make_hospital(db)
    request = make_request(db, hospital, blood_group="O+")
    make_user(db, blood_group="O-", latitude=HOSPITAL_LAT + 0.05, longitude=HOSPITAL_LON)
    make_user(db, blood_group="O-", latitude=HOSPITAL_LAT + 0.01, longitude=HOSPITAL_LON)

    found = find_donors(db, request, radius_km=50)
    distances = [distance for _, distance in found]
    assert distances == sorted(distances)


def test_notify_donors_creates_match_and_alert_rows(db):
    hospital = make_hospital(db)
    request = make_request(db, hospital, blood_group="O+")
    donor = make_user(db, blood_group="O-")

    created = notify_donors(db, request, radius_km=5)
    db.refresh(request)

    assert created == 1
    match = db.query(Match).filter_by(request_id=request.id).one()
    assert match.donor_id == donor.id
    assert match.status == "NOTIFIED"


def test_notify_donors_never_alerts_the_same_donor_twice(db):
    hospital = make_hospital(db)
    request = make_request(db, hospital, blood_group="O+")
    make_user(db, blood_group="O-")

    first = notify_donors(db, request, radius_km=5)
    second = notify_donors(db, request, radius_km=5)

    assert first == 1
    assert second == 0


def test_eligibility_window_is_exactly_120_days(db):
    donor = make_user(db, last_donation_at=utcnow() - timedelta(days=120))
    assert is_eligible(donor)
    assert eligible_again_at(donor) <= utcnow()


def test_donor_who_never_donated_is_eligible(db):
    donor = make_user(db, last_donation_at=None)
    assert is_eligible(donor)
