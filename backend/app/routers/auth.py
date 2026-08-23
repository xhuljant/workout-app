"""Authentication routes: register, login, refresh, and "who am I" (me).

Every route here is mounted under the /api/auth prefix (set just below and wired
up in main.py).
"""
import uuid

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import UserCreate, UserLogin, UserPublic, Token, RefreshRequest
from ..security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)

# An APIRouter is a group of related routes. prefix adds "/api/auth" to each path.
router = APIRouter(prefix="/api/auth", tags=["auth"])


def _tokens_for(user: User) -> Token:
    """Small helper: build a fresh access + refresh token pair for a user."""
    return Token(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(body: UserCreate, db: Session = Depends(get_db)):
    """Create a new account and return tokens, so the user is logged in immediately."""
    # Fail early with a clear message if the email is already taken.
    existing = db.query(User).filter(User.email == body.email).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists.",
        )

    user = User(
        email=body.email,
        display_name=body.display_name,
        password_hash=hash_password(body.password),  # store the hash, never the password
    )
    db.add(user)      # stage the new row
    db.commit()       # actually write it to Postgres
    db.refresh(user)  # reload so we have the generated id and timestamps

    return _tokens_for(user)


@router.post("/login", response_model=Token)
def login(body: UserLogin, db: Session = Depends(get_db)):
    """Check email + password and return tokens on success."""
    user = (
        db.query(User)
        .filter(User.email == body.email, User.deleted_at.is_(None))
        .first()
    )

    # Use the SAME error whether the email is unknown or the password is wrong,
    # so an attacker can't use it to discover which emails have accounts.
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    return _tokens_for(user)


@router.post("/refresh", response_model=Token)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    """Exchange a valid refresh token for a new access + refresh pair.

    This is how the app stays logged in without keeping the password: the short
    access token expires quickly, and the client quietly uses the refresh token
    to get a new one.
    """
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token.",
    )

    try:
        payload = decode_token(body.refresh_token)
    except jwt.PyJWTError:
        raise invalid

    # Must actually be a refresh token, not an access token.
    if payload.get("type") != "refresh":
        raise invalid

    user = (
        db.query(User)
        .filter(User.id == uuid.UUID(payload["sub"]), User.deleted_at.is_(None))
        .first()
    )
    if user is None:
        raise invalid

    return _tokens_for(user)


@router.get("/me", response_model=UserPublic)
def me(current_user: User = Depends(get_current_user)):
    """Return the logged-in user's public profile.

    There's no manual token handling here: the get_current_user dependency does
    it, and this route only runs if a valid access token was provided.
    """
    return current_user
