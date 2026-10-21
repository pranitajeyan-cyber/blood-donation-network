"""Registration, login and JWT handling."""

from __future__ import annotations

from app.security import hash_password, verify_password

REGISTRATION = {
    "name": "Asha Menon",
    "email": "asha.menon@example.com",
    "phone": "9876543210",
    "password": "supersecret1",
    "blood_group": "O+",
    "district": "Coimbatore",
    "latitude": 11.0168,
    "longitude": 76.9558,
}


def test_register_returns_token_and_user(client):
    response = client.post("/api/auth/register", json=REGISTRATION)
    assert response.status_code == 201

    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["email"] == "asha.menon@example.com"
    assert body["user"]["role"] == "donor"
    assert body["user"]["verified"] is False


def test_register_rejects_duplicate_email(client):
    client.post("/api/auth/register", json=REGISTRATION)
    response = client.post("/api/auth/register", json=REGISTRATION)
    assert response.status_code == 409
    assert "already registered" in response.json()["detail"]


def test_register_rejects_duplicate_phone(client):
    client.post("/api/auth/register", json=REGISTRATION)
    payload = {**REGISTRATION, "email": "someone.else@example.com"}
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 409
    assert "phone" in response.json()["detail"]


def test_register_rejects_invalid_blood_group(client):
    payload = {**REGISTRATION, "blood_group": "Z+"}
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 422


def test_register_rejects_invalid_email(client):
    payload = {**REGISTRATION, "email": "not-an-email"}
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 422


def test_register_rejects_short_password(client):
    payload = {**REGISTRATION, "password": "short"}
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 422


def test_login_succeeds_with_correct_password(client):
    client.post("/api/auth/register", json=REGISTRATION)
    response = client.post(
        "/api/auth/login",
        json={"email": REGISTRATION["email"], "password": REGISTRATION["password"]},
    )
    assert response.status_code == 200
    assert response.json()["access_token"]


def test_login_fails_with_wrong_password(client):
    client.post("/api/auth/register", json=REGISTRATION)
    response = client.post(
        "/api/auth/login",
        json={"email": REGISTRATION["email"], "password": "wrongpassword"},
    )
    assert response.status_code == 401


def test_login_fails_for_unknown_email(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "whatever123"},
    )
    assert response.status_code == 401


def test_me_requires_a_token(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_rejects_a_garbage_token(client):
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert response.status_code == 401


def test_me_returns_the_current_user(client):
    token = client.post("/api/auth/register", json=REGISTRATION).json()["access_token"]
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["email"] == REGISTRATION["email"]


def test_password_hash_is_salted_and_verifiable():
    first = hash_password("hunter2hunter2")
    second = hash_password("hunter2hunter2")

    assert first != second, "each hash must use a fresh random salt"
    assert verify_password("hunter2hunter2", first)
    assert verify_password("hunter2hunter2", second)
    assert not verify_password("wrong", first)


def test_verify_password_handles_garbage_input():
    assert not verify_password("anything", "not-a-hash")
    assert not verify_password("anything", "")
