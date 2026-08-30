"""Authentication routes: register, login, refresh, and "who am I" (me).

Every route here is mounted under the /api/auth prefix (set just below and wired
up in main.py).
"""
import uuid
from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, token_predates_password_change
from ..models import Routine, User, Workout
from ..schemas import (
    PasswordChange,
    RefreshRequest,
    RegisterResult,
    ResetPasswordRequest,
    ResetPasswordResult,
    Token,
    UserCreate,
    UserLogin,
    UserPublic,
    UserUpdate,
)
from ..security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_recovery_code,
    hash_recovery_code,
    verify_recovery_code,
)

# An APIRouter is a group of related routes. prefix adds "/api/auth" to each path.
router = APIRouter(prefix="/api/auth", tags=["auth"])


def _tokens_for(user: User) -> Token:
    """Small helper: build a fresh access + refresh token pair for a user."""
    return Token(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


# Email is the login identifier, so it's case- and whitespace-insensitive:
# "Bob@X.com " and "bob@x.com" are the same account.
def _normalize_email(email: str) -> str:
    return email.strip().lower()


@router.post(
    "/register", response_model=RegisterResult, status_code=status.HTTP_201_CREATED
)
def register(body: UserCreate, db: Session = Depends(get_db)):
    """Create a new account and return tokens (so the user is logged in
    immediately) plus a one-time recovery code -- the only way back into the
    account if the password is forgotten. Shown once, never retrievable again."""
    email = _normalize_email(body.email)

    # Fail early with a clear message if the email is already taken.
    existing = db.query(User).filter(User.email == email).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists.",
        )

    recovery_code = generate_recovery_code()
    user = User(
        email=email,
        display_name=body.display_name,
        password_hash=hash_password(body.password),  # store the hash, never the password
        recovery_code_hash=hash_recovery_code(recovery_code),
    )
    db.add(user)      # stage the new row
    db.commit()       # actually write it to Postgres
    db.refresh(user)  # reload so we have the generated id and timestamps

    tokens = _tokens_for(user)
    return RegisterResult(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        recovery_code=recovery_code,
    )


@router.post("/login", response_model=Token)
def login(body: UserLogin, db: Session = Depends(get_db)):
    """Check email + password and return tokens on success."""
    user = (
        db.query(User)
        .filter(User.email == _normalize_email(body.email), User.deleted_at.is_(None))
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

    # A password change since this refresh token was issued ends the session --
    # this is what actually revokes the long-lived token on other devices.
    if token_predates_password_change(payload, user):
        raise invalid

    return _tokens_for(user)


@router.get("/me", response_model=UserPublic)
def me(current_user: User = Depends(get_current_user)):
    """Return the logged-in user's public profile.

    There's no manual token handling here: the get_current_user dependency does
    it, and this route only runs if a valid access token was provided.
    """
    return current_user


@router.patch("/me", response_model=UserPublic)
def update_me(
    body: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change display name, email, and/or preferences. Only the fields present in
    the request body are touched."""
    if body.display_name is not None:
        current_user.display_name = body.display_name.strip()

    if body.email is not None:
        new_email = _normalize_email(body.email)
        if new_email != current_user.email:
            taken = (
                db.query(User)
                .filter(
                    User.email == new_email,
                    User.id != current_user.id,
                    User.deleted_at.is_(None),
                )
                .first()
            )
            if taken is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with that email already exists.",
                )
            current_user.email = new_email

    if body.preferences is not None:
        # Reassign a fresh dict so SQLAlchemy notices the JSONB change.
        current_user.preferences = {
            **(current_user.preferences or {}),
            **body.preferences,
        }

    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Replace the password after checking the current one."""
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    current_user.password_hash = hash_password(body.new_password)
    # Whole seconds -- see token_predates_password_change. This also signs the
    # user out of their other devices on the next request / refresh.
    current_user.password_changed_at = datetime.now(timezone.utc).replace(microsecond=0)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Verified against this when the email is unknown, so an attacker can't tell
# "no such account" from "wrong code" by timing the argon2 verify. Computed once.
_DUMMY_RECOVERY_HASH = hash_recovery_code("0" * 32)


@router.post("/reset-password", response_model=ResetPasswordResult)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Set a new password using the account's one-time recovery code.

    The used code is rotated -- the response carries a fresh code the user must
    save. One vague 400 covers unknown email / wrong code / deleted account. A
    too-short new password 422s from the schema before the code is touched.
    """
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Email or recovery code is incorrect.",
    )

    user = (
        db.query(User)
        .filter(User.email == _normalize_email(body.email), User.deleted_at.is_(None))
        .first()
    )
    code_hash = user.recovery_code_hash if user is not None else _DUMMY_RECOVERY_HASH
    if not verify_recovery_code(body.recovery_code, code_hash) or user is None:
        raise invalid

    now = datetime.now(timezone.utc)
    user.password_hash = hash_password(body.new_password)
    # Whole seconds -- see token_predates_password_change. Ends every session
    # that was open before this reset (the point of "reset my stolen laptop").
    user.password_changed_at = now.replace(microsecond=0)

    new_code = generate_recovery_code()
    user.recovery_code_hash = hash_recovery_code(new_code)

    db.commit()
    return ResetPasswordResult(recovery_code=new_code)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete the account. get_current_user filters deleted_at IS NULL, so
    any access/refresh tokens already issued for this account stop working right
    away -- no token blocklist needed. The email is tombstoned so it can be used
    to register a fresh account later."""
    now = func.now()
    current_user.deleted_at = now
    current_user.email = f"{current_user.email}.deleted.{current_user.id}"

    db.query(Routine).filter(
        Routine.user_id == current_user.id, Routine.deleted_at.is_(None)
    ).update({Routine.deleted_at: now}, synchronize_session=False)
    db.query(Workout).filter(
        Workout.user_id == current_user.id,
        Workout.status == "active",
        Workout.deleted_at.is_(None),
    ).update({Workout.deleted_at: now}, synchronize_session=False)

    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
