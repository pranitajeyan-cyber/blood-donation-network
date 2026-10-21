"""Password hashing and JWT issuing.

Passwords use PBKDF2-HMAC-SHA256 from the standard library (~200k iterations,
16-byte random salt, constant-time comparison). This avoids a native bcrypt
wheel on Windows while staying on an algorithm NIST accepts for password
storage.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import UTC, datetime, timedelta

import jwt

from app.config import get_settings

PBKDF2_ALGORITHM = "pbkdf2_sha256"
PBKDF2_ITERATIONS = 200_000
SALT_BYTES = 16


def hash_password(password: str) -> str:
    """Return a self-describing password hash: ``algo$iterations$salt$hash``."""
    salt = os.urandom(SALT_BYTES)
    derived = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    return "$".join(
        [
            PBKDF2_ALGORITHM,
            str(PBKDF2_ITERATIONS),
            base64.b64encode(salt).decode(),
            base64.b64encode(derived).decode(),
        ]
    )


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against a stored hash. Never raises on bad input."""
    try:
        algorithm, iterations, salt_b64, hash_b64 = stored_hash.split("$")
        if algorithm != PBKDF2_ALGORITHM:
            return False
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            base64.b64decode(salt_b64),
            int(iterations),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(base64.b64encode(derived).decode(), hash_b64)


def create_access_token(subject: str, role: str) -> str:
    """Issue a signed JWT for the given user id and role."""
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(subject),
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_expire_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """Decode and verify a JWT. Raises ``jwt.PyJWTError`` if invalid/expired."""
    settings = get_settings()
    return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
