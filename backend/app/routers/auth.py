"""Authentication routes: register, login, refresh, and "who am I" (me).

Every route here is mounted under the /api/auth prefix (set just below and wired
up in main.py).
"""
import uuid

import jwt
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Routine, User, Workout
from ..schemas import (
    PasswordChange,
    PhotoPinRemove,
    PhotoPinSet,
    PhotoPinVerify,
    RefreshRequest,
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


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(body: UserCreate, db: Session = Depends(get_db)):
    """Create a new account and return tokens, so the user is logged in immediately."""
    email = _normalize_email(body.email)

    # Fail early with a clear message if the email is already taken.
    existing = db.query(User).filter(User.email == email).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists.",
        )

    user = User(
        email=email,
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
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Progress-photo PIN -----------------------------------------------------
#
# A low-friction privacy gate for the Progress tab's photo timeline. The hash
# lives in its own column (never echoed by /me or an export). This only gates
# the UI -- the photo blobs are still reachable through the measurements API and
# the data export by any valid token. That trade-off is deliberate; see the
# "progress photo lock" note in the README.

def _photo_pin_unlocked_by(current_user: User, pin: str | None, password: str | None) -> bool:
    """True when the caller proved they may change/clear the photo PIN: either
    the current PIN or the account password. Used only when a PIN is already set."""
    if pin and verify_password(pin, current_user.photo_pin_hash or ""):
        return True
    if password and verify_password(password, current_user.password_hash):
        return True
    return False


@router.post("/photo-pin", response_model=UserPublic)
def set_photo_pin(
    body: PhotoPinSet,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set or change the progress-photo PIN. Changing an existing PIN needs the
    current PIN or the account password."""
    if current_user.photo_pin_hash is not None and not _photo_pin_unlocked_by(
        current_user, body.current_pin, body.password
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter your current PIN or account password to change it.",
        )
    current_user.photo_pin_hash = hash_password(body.new_pin)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/photo-pin/verify", status_code=status.HTTP_204_NO_CONTENT)
def verify_photo_pin(
    body: PhotoPinVerify,
    current_user: User = Depends(get_current_user),
):
    """Check a PIN. 204 when it matches, 400 otherwise. No-op-ish when no PIN is
    set (treated as incorrect) so the client never gets a false unlock."""
    if current_user.photo_pin_hash is None or not verify_password(
        body.pin, current_user.photo_pin_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect PIN."
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/photo-pin", status_code=status.HTTP_204_NO_CONTENT)
def remove_photo_pin(
    body: PhotoPinRemove,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clear the photo lock. Needs the current PIN or the account password --
    whoever has the password already has full access, so this grants nothing new."""
    if current_user.photo_pin_hash is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    if not _photo_pin_unlocked_by(current_user, body.pin, body.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter your PIN or account password.",
        )
    current_user.photo_pin_hash = None
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
