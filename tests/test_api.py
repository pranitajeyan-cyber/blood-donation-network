"""End-to-end API flow: request -> notification -> acceptance -> collection."""

from __future__ import annotations

from tests.conftest import auth_headers, make_hospital, make_user

HOSPITAL_LAT, HOSPITAL_LON = 11.0168, 76.9558


def test_full_donation_lifecycle(client, db):
    hospital = make_hospital(db, name="City General")
    staff = hospital.user
    donor = make_user(db, blood_group="O-", email="donor@example.com")

    donor_headers = auth_headers(donor)
    staff_headers = auth_headers(staff)

    # 1. The hospital raises a request.
    response = client.post(
        "/api/requests",
        headers=staff_headers,
        json={"blood_group": "O+", "units_needed": 1, "urgency": "EMERGENCY"},
    )
    assert response.status_code == 201
    request_id = response.json()["id"]

    # 2. The nearby compatible donor was notified.
    matches = client.get("/api/donors/me/matches", headers=donor_headers).json()
    assert len(matches) == 1
    assert matches[0]["request_id"] == request_id
    assert matches[0]["status"] == "NOTIFIED"

    match_id = matches[0]["id"]

    # 3. The donor accepts.
    response = client.post(f"/api/matches/{match_id}/accept", headers=donor_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "ACCEPTED"

    # 4. The hospital collects the unit.
    response = client.post(
        "/api/hospitals/me/donations",
        headers=staff_headers,
        json={"request_id": request_id, "donor_id": donor.id, "units": 1},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "FULFILLED"
    assert body["bag_code"].startswith("BDN-")

    # 5. The donor sees the bag and is now on cooldown.
    bags = client.get("/api/donors/me/bags", headers=donor_headers).json()
    assert len(bags) == 1
    assert bags[0]["blood_group"] == "O-"

    eligibility = client.get("/api/donors/me/eligibility", headers=donor_headers).json()
    assert eligibility["eligible"] is False
    assert eligibility["days_until_eligible"] >= 119

    # 6. The donor is not re-notified for the same request.
    assert client.get("/api/donors/me/matches", headers=donor_headers).json()[0]["status"] == "CONFIRMED"


def test_donor_cannot_raise_a_request(client, db):
    donor = make_user(db)
    response = client.post(
        "/api/requests",
        headers=auth_headers(donor),
        json={"blood_group": "O+", "units_needed": 1, "urgency": "NORMAL"},
    )
    assert response.status_code == 403


def test_donor_cannot_read_hospital_inventory(client, db):
    donor = make_user(db)
    response = client.get("/api/hospitals/me/inventory", headers=auth_headers(donor))
    assert response.status_code == 403


def test_donor_cannot_access_admin_metrics(client, db):
    donor = make_user(db)
    response = client.get("/api/admin/metrics", headers=auth_headers(donor))
    assert response.status_code == 403


def test_hospital_sees_only_its_own_requests(client, db):
    hospital_a = make_hospital(db, name="A")
    hospital_b = make_hospital(db, name="B")

    client.post(
        "/api/requests",
        headers=auth_headers(hospital_a.user),
        json={"blood_group": "O+", "units_needed": 1, "urgency": "NORMAL"},
    )
    client.post(
        "/api/requests",
        headers=auth_headers(hospital_b.user),
        json={"blood_group": "A+", "units_needed": 1, "urgency": "NORMAL"},
    )

    rows = client.get("/api/requests", headers=auth_headers(hospital_a.user)).json()
    assert len(rows) == 1
    assert rows[0]["blood_group"] == "O+"

    rows_b = client.get("/api/requests", headers=auth_headers(hospital_b.user)).json()
    assert len(rows_b) == 1
    assert rows_b[0]["blood_group"] == "A+"


def test_unverified_donor_is_not_notified(client, db):
    hospital = make_hospital(db, name="City General")
    donor = make_user(db, blood_group="O-", verified=False)

    client.post(
        "/api/requests",
        headers=auth_headers(hospital.user),
        json={"blood_group": "O+", "units_needed": 1, "urgency": "URGENT"},
    )

    assert client.get("/api/donors/me/matches", headers=auth_headers(donor)).json() == []


def test_donor_can_verify_and_then_be_notified(client, db):
    hospital = make_hospital(db, name="City General")
    donor = make_user(db, blood_group="O-", verified=False)

    response = client.post(
        "/api/donors/me/verify",
        headers=auth_headers(donor),
        json={"digilocker_token": "dlk_abcdef123456"},
    )
    assert response.status_code == 200
    assert response.json()["verified"] is True

    client.post(
        "/api/requests",
        headers=auth_headers(hospital.user),
        json={"blood_group": "O+", "units_needed": 1, "urgency": "URGENT"},
    )

    assert len(client.get("/api/donors/me/matches", headers=auth_headers(donor)).json()) == 1


def test_inventory_can_be_set_and_adjusted(client, db):
    hospital = make_hospital(db, name="City General")
    headers = auth_headers(hospital.user)

    response = client.put(
        "/api/hospitals/me/inventory", headers=headers, json={"blood_group": "O+", "units_in_stock": 10}
    )
    assert response.status_code == 200
    assert response.json()["units_in_stock"] == 10

    response = client.post(
        "/api/hospitals/me/inventory/adjust",
        headers=headers,
        json={"blood_group": "O+", "delta": -3},
    )
    assert response.json()["units_in_stock"] == 7


def test_inventory_cannot_go_negative(client, db):
    hospital = make_hospital(db, name="City General")
    response = client.post(
        "/api/hospitals/me/inventory/adjust",
        headers=auth_headers(hospital.user),
        json={"blood_group": "O+", "delta": -1},
    )
    assert response.status_code == 409


def test_collection_decrements_cold_storage(client, db):
    hospital = make_hospital(db, name="City General")
    donor = make_user(db, blood_group="O-")
    headers = auth_headers(hospital.user)

    client.put("/api/hospitals/me/inventory", headers=headers, json={"blood_group": "O+", "units_in_stock": 5})

    request_id = client.post(
        "/api/requests",
        headers=headers,
        json={"blood_group": "O+", "units_needed": 1, "urgency": "URGENT"},
    ).json()["id"]

    match_id = client.get("/api/donors/me/matches", headers=auth_headers(donor)).json()[0]["id"]
    client.post(f"/api/matches/{match_id}/accept", headers=auth_headers(donor))

    client.post(
        "/api/hospitals/me/donations",
        headers=headers,
        json={"request_id": request_id, "donor_id": donor.id, "units": 1},
    )

    inventory = client.get("/api/hospitals/me/inventory", headers=headers).json()
    o_plus = next(item for item in inventory if item["blood_group"] == "O+")
    assert o_plus["units_in_stock"] == 4


def test_admin_metrics_reflect_activity(client, db):
    hospital = make_hospital(db, name="City General")
    admin = make_user(db, role="admin", blood_group=None, email="admin@example.com")
    donor = make_user(db, blood_group="O-")

    client.post(
        "/api/requests",
        headers=auth_headers(hospital.user),
        json={"blood_group": "O+", "units_needed": 1, "urgency": "URGENT"},
    )
    match_id = client.get("/api/donors/me/matches", headers=auth_headers(donor)).json()[0]["id"]
    client.post(f"/api/matches/{match_id}/accept", headers=auth_headers(donor))

    metrics = client.get("/api/admin/metrics", headers=auth_headers(admin)).json()

    assert metrics["matches_created"] == 1
    assert metrics["matches_accepted"] == 1
    assert metrics["open_requests"] == 1
    assert metrics["median_match_to_donation_minutes"] is not None


def test_admin_can_run_the_escalation_cycle(client, db):
    hospital = make_hospital(db, name="City General")
    admin = make_user(db, role="admin", blood_group=None, email="admin@example.com")

    request_id = client.post(
        "/api/requests",
        headers=auth_headers(hospital.user),
        json={"blood_group": "O+", "units_needed": 1, "urgency": "URGENT"},
    ).json()["id"]

    response = client.post("/api/admin/escalate", headers=auth_headers(admin))
    assert response.status_code == 200
    assert response.json()[0]["request_id"] == request_id


def test_request_can_be_cancelled(client, db):
    hospital = make_hospital(db, name="City General")
    request_id = client.post(
        "/api/requests",
        headers=auth_headers(hospital.user),
        json={"blood_group": "O+", "units_needed": 1, "urgency": "NORMAL"},
    ).json()["id"]

    response = client.post(f"/api/requests/{request_id}/cancel", headers=auth_headers(hospital.user))
    assert response.status_code == 200
    assert response.json()["status"] == "CANCELLED"


def test_health_endpoint_is_public(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_robots_and_sitemap_are_generated_for_the_request_origin(client):
    robots = client.get("/robots.txt")
    assert robots.status_code == 200
    assert "Sitemap: http://testserver/sitemap.xml" in robots.text
    assert "Disallow: /admin" in robots.text

    sitemap = client.get("/sitemap.xml")
    assert sitemap.status_code == 200
    assert sitemap.headers["content-type"].startswith("application/xml")
    for path in ("/", "/privacy", "/terms"):
        assert f"<loc>http://testserver{path}</loc>" in sitemap.text


def test_unknown_api_path_is_a_real_404_not_the_spa(client):
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
