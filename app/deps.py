"""Reusable FastAPI dependencies (authentication and role guards)."""

from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise CREDENTIALS_ERROR

    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload.get("sub", ""))
    except (jwt.PyJWTError, ValueError, TypeError):
        raise CREDENTIALS_ERROR from None

    user = db.get(User, user_id)
    if user is None:
        raise CREDENTIALS_ERROR
    return user


def require_roles(*roles: str):
    """Dependency factory restricting an endpoint to the given roles."""

    def _guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"requires role: {' or '.join(roles)}",
            )
        return user

    return _guard


require_donor = require_roles("donor")
require_hospital = require_roles("hospital")
require_admin = require_roles("admin")
require_staff = require_roles("hospital", "admin")
