"""End-to-end demo of the Blood Donation Network API.

Runs the full lifecycle against a locally running server and a seeded
database, printing what happens at every step::

    python -m app.seed
    python -m uvicorn app.main:app --reload
    python scripts/demo.py

This is the script behind the transcript in the README.
"""

from __future__ import annotations

import sys
from datetime import timedelta
from pathlib import Path

import httpx

# Allow running the file directly: `python scripts/demo.py`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

BASE = "http://127.0.0.1:8099"

HOSPITAL_EMAIL = "hospital1@bdn.dev"
HOSPITAL_PASSWORD = "hospital12345"
ADMIN_EMAIL = "admin@bdn.dev"
ADMIN_PASSWORD = "admin12345"
DONOR_PASSWORD = "donor12345"


def rule(title: str) -> None:
    print()
    print("=" * 72)
    print(f"  {title}")
    print("=" * 72)


def login(client: httpx.Client, email: str, password: str) -> dict:
    response = client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )
    response.raise_for_status()
    return response.json()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def main() -> int:
    client = httpx.Client(base_url=BASE, timeout=30.0)

    try:
        client.get("/health").raise_for_status()
    except httpx.HTTPError:
        print(f"Cannot reach {BASE}. Start the server first:")
        print("  python -m uvicorn app.main:app --reload")
        return 1

    # ------------------------------------------------------------------
    rule("1. Hospital signs in")
    hospital = login(client, HOSPITAL_EMAIL, HOSPITAL_PASSWORD)
    hospital_headers = auth(hospital["access_token"])
    print(f"  signed in as {hospital['user']['name']} ({HOSPITAL_EMAIL})")

    # ------------------------------------------------------------------
    rule("2. Hospital raises an EMERGENCY request for O+ (2 units)")
    response = client.post(
        "/api/requests",
        headers=hospital_headers,
        json={
            "blood_group": "O+",
            "units_needed": 2,
            "urgency": "EMERGENCY",
            "notes": "Post-op requirement",
        },
    )
    response.raise_for_status()
    request = response.json()
    print(f"  request #{request['id']} status={request['status']} "
          f"urgency={request['urgency']} tier={request['escalation_tier']} "
          f"radius={request['radius_km']}km")

    # ------------------------------------------------------------------
    rule("3. Tier 0 - donors within 5 km were alerted immediately")
    matches = client.get(
        f"/api/requests/{request['id']}/matches", headers=hospital_headers
    ).json()
    print(f"  {len(matches)} donor(s) notified:")
    for match in matches:
        print(f"    - {match['donor_name']:<22} {match['blood_group']:<3} "
              f"{match['distance_km']:>6.2f} km   {match['status']}")

    if not matches:
        print("  (no donors in range - run `python -m app.seed` first)")
        return 1

    # ------------------------------------------------------------------
    rule("4. SLA escalation - the request ages past 15 minutes")
    # The scheduler would do this over time; the demo backdates the request
    # directly so the escalation can be shown without waiting.
    from app.database import SessionLocal
    from app.models import BloodRequest

    db = SessionLocal()
    try:
        row = db.get(BloodRequest, request["id"])
        row.created_at = row.created_at - timedelta(minutes=16)
        db.commit()
    finally:
        db.close()

    response = client.post(
        f"/api/requests/{request['id']}/escalate", headers=hospital_headers
    )
    response.raise_for_status()
    outcome = response.json()
    print(f"  tier {outcome['previous_tier']} -> {outcome['current_tier']}, "
          f"radius {outcome['radius_km']}km, "
          f"{outcome['donors_notified']} new donor(s) alerted, "
          f"caregiver SMS: {outcome['caregiver_alerted']}")

    matches = client.get(
        f"/api/requests/{request['id']}/matches", headers=hospital_headers
    ).json()
    print(f"  {len(matches)} donor(s) notified in total")

    # ------------------------------------------------------------------
    rule("5. A donor accepts")
    admin = login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    admin_headers = auth(admin["access_token"])
    users = client.get("/api/admin/users?role=donor", headers=admin_headers).json()
    emails = {user["id"]: user["email"] for user in users}

    target = next(m for m in matches if m["status"] == "NOTIFIED")
    donor = login(client, emails[target["donor_id"]], DONOR_PASSWORD)
    donor_headers = auth(donor["access_token"])

    response = client.post(f"/api/matches/{target['id']}/accept", headers=donor_headers)
    response.raise_for_status()
    print(f"  {target['donor_name']} accepted "
          f"({response.json()['distance_km']} km away)")

    # ------------------------------------------------------------------
    rule("6. Hospital collects the unit")
    response = client.post(
        "/api/hospitals/me/donations",
        headers=hospital_headers,
        json={
            "request_id": request["id"],
            "donor_id": target["donor_id"],
            "units": 1,
        },
    )
    response.raise_for_status()
    collection = response.json()
    print(f"  bag {collection['bag_code']}  "
          f"status={collection['status']}  "
          f"fulfilled {collection['units_fulfilled']}/{collection['units_needed']}")
    print(f"  donor eligible again at {collection['eligible_again_at'][:10]} "
          f"(120-day rule)")

    # ------------------------------------------------------------------
    rule("7. Impact transparency - the donor sees their own bag")
    bags = client.get("/api/donors/me/bags", headers=donor_headers).json()
    for bag in bags:
        print(f"  {bag['bag_code']}  {bag['blood_group']}  {bag['status']}")

    # ------------------------------------------------------------------
    rule("8. Admin view - metrics and the 7-day shortage forecast")
    metrics = client.get("/api/admin/metrics", headers=admin_headers).json()
    for key, value in metrics.items():
        print(f"  {key:<36} {value}")

    print()
    forecast = client.get("/api/admin/forecast?horizon_days=7", headers=admin_headers).json()
    high_risk = [row for row in forecast if row["risk"] == "HIGH"]
    print(f"  {len(high_risk)} HIGH-risk (district, group, day) combinations in the "
          f"next 7 days")
    for row in high_risk[:8]:
        print(f"    - {row['district']:<12} {row['blood_group']:<3} "
              f"{row['forecast_date'][:10]}  need {row['predicted_units']:.1f} "
              f"vs stock {row['stock_units']}")

    # ------------------------------------------------------------------
    rule("9. Model quality - backtest against a seasonal-naive baseline")
    for model in ("adjusted_ma", "seasonal_naive"):
        rows = client.get(
            f"/api/admin/backtest?model={model}", headers=admin_headers
        ).json()
        average = sum(row["wmape"] for row in rows) / len(rows) if rows else 0
        print(f"  {model:<16} mean WMAPE = {average:.4f}  ({len(rows)} series)")

    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
