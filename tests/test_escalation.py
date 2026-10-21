"""The SLA escalation engine."""

from __future__ import annotations

from datetime import timedelta

from app.models import AlertLog, Match, utcnow
from app.services.escalation import escalate_request, run_escalation_cycle, target_tier
from tests.conftest import make_hospital, make_request, make_user


def test_target_tier_picks_the_highest_reached_threshold():
    tiers = [0, 15, 30]
    assert target_tier(0, tiers) == 0
    assert target_tier(14, tiers) == 0
    assert target_tier(15, tiers) == 1
    assert target_tier(29, tiers) == 1
    assert target_tier(30, tiers) == 2
    assert target_tier(500, tiers) == 2


def test_request_stays_at_tier_zero_before_fifteen_minutes(db):
    hospital = make_hospital(db)
    request = make_request(db, hospital, created_at=utcnow() - timedelta(minutes=5))

    outcome = escalate_request(db, request)

    assert outcome.current_tier == 0
    assert outcome.radius_km == 5
    assert outcome.action == "none"


def test_request_expands_radius_after_fifteen_minutes(db):
    hospital = make_hospital(db)
    request = make_request(db, hospital, created_at=utcnow() - timedelta(minutes=16))

    outcome = escalate_request(db, request)

    assert outcome.previous_tier == 0
    assert outcome.current_tier == 1
    assert outcome.radius_km == 15
    assert "escalated" in outcome.action


def test_wider_radius_reaches_donors_the_first_tier_missed(db):
    hospital = make_hospital(db)
    request = make_request(db, hospital, created_at=utcnow() - timedelta(minutes=16))
    # ~15 km away: outside the 5 km tier, inside the 15 km tier.
    make_user(db, blood_group="O-", latitude=11.0168 + 0.13, longitude=76.9558)

    outcome = escalate_request(db, request)

    assert outcome.donors_notified == 1
    assert db.query(Match).filter_by(request_id=request.id).count() == 1


def test_caregiver_sms_fires_after_thirty_minutes(db):
    hospital = make_hospital(db)
    request = make_request(db, hospital, created_at=utcnow() - timedelta(minutes=31))

    outcome = escalate_request(db, request)

    assert outcome.caregiver_alerted is True
    assert outcome.current_tier == 2
    assert outcome.radius_km == 50
    assert db.query(AlertLog).filter_by(channel="CAREGIVER_SMS").count() == 1


def test_escalation_is_idempotent(db):
    hospital = make_hospital(db)
    request = make_request(db, hospital, created_at=utcnow() - timedelta(minutes=31))
    make_user(db, blood_group="O-")

    first = escalate_request(db, request)
    second = escalate_request(db, request)

    assert first.donors_notified == 1
    assert second.donors_notified == 0
    assert second.current_tier == first.current_tier
    assert db.query(Match).filter_by(request_id=request.id).count() == 1
    assert db.query(AlertLog).filter_by(channel="CAREGIVER_SMS").count() == 1


def test_expired_request_is_not_escalated(db):
    hospital = make_hospital(db)
    request = make_request(db, hospital, created_at=utcnow() - timedelta(hours=10))
    make_user(db, blood_group="O-")

    outcome = escalate_request(db, request)

    assert outcome.expired is True
    assert outcome.donors_notified == 0
    assert request.status == "EXPIRED"


def test_closed_request_is_skipped(db):
    hospital = make_hospital(db)
    request = make_request(db, hospital, status="FULFILLED")

    outcome = escalate_request(db, request)

    assert outcome.action == "skipped_closed"


def test_run_cycle_only_touches_open_requests(db):
    hospital = make_hospital(db)
    open_request = make_request(db, hospital, created_at=utcnow() - timedelta(minutes=20))
    closed_request = make_request(db, hospital, status="CANCELLED")

    outcomes = run_escalation_cycle(db)

    assert {outcome.request_id for outcome in outcomes} == {open_request.id}
    assert closed_request.escalation_tier == 0
