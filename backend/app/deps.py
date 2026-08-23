"""Reusable FastAPI dependencies.

get_current_user is what protects private routes. Any route that lists it as a
parameter will only run if the request carried a valid access token; otherwise
the request is rejected with 401 before the route body ever runs.
"""
import uuid

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from .database import get_db
from .models import User
from .security import decode_token

# Tells FastAPI to read the "Authorization: Bearer <token>" header. It also makes
# an "Authorize" button appear in the auto-generated docs at /docs.
_bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Turn the bearer token into the logged-in User, or reject the request."""
    # One deliberately vague error for every failure case -- we don't reveal
    # *why* authentication failed.
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # 1. Verify the token's signature and expiry.
    try:
        payload = decode_token(credentials.credentials)
    except jwt.PyJWTError:
        raise credentials_error

    # 2. Only *access* tokens may reach protected routes (not refresh tokens).
    if payload.get("type") != "access":
        raise credentials_error

    # 3. Pull the user id out of the token's "sub" claim.
    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_error

    # 4. Load the user and make sure they still exist and aren't soft-deleted.
    user = (
        db.query(User)
        .filter(User.id == uuid.UUID(user_id), User.deleted_at.is_(None))
        .first()
    )
    if user is None:
        raise credentials_error

    return user
