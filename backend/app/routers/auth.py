"""Authentication routes: register, login, refresh, and "who am I" (me).

Every route here is mounted under the /api/auth prefix (set just below and wired
up in main.py).
"""
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user, token_predates_password_change
from ..email import EmailSender, get_email_sender, send_password_reset_email
from ..models import PasswordReset, Routine, User, Workout
from ..schemas import (
    ForgotPasswordRequest,
    PasswordChange,
    RefreshRequest,
    ResetPasswordRequest,
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
    generate_reset_token,
    hash_reset_token,
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


# How many still-valid reset requests one account may rack up inside the TTL
# window. A crude in-app throttle -- a real rate limiter belongs at the edge.
_MAX_ACTIVE_RESETS_PER_WINDOW = 3


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    sender: EmailSender = Depends(get_email_sender),
):
    """Start a password reset.

    ALWAYS returns 202 with an empty body, whether or not the email maps to an
    account -- this endpoint must not reveal which addresses are registered
    (same reasoning as login's single error message). The email, if any, is sent
    from a background task *after* the response so latency doesn't leak it either.
    """
    email = _normalize_email(body.email)
    now = datetime.now(timezone.utc)

    user = (
        db.query(User)
        .filter(User.email == email, User.deleted_at.is_(None))
        .first()
    )

    if user is not None:
        # Throttle: cap how many reset emails one account can trigger inside the
        # TTL window. Counts every request in the window, used or not -- the
        # invalidation sweep below would otherwise keep the "unused" count at 1.
        window_start = now - timedelta(
            minutes=settings.password_reset_token_expire_minutes
        )
        recent = (
            db.query(PasswordReset)
            .filter(
                PasswordReset.user_id == user.id,
                PasswordReset.created_at >= window_start,
            )
            .count()
        )
        if recent < _MAX_ACTIVE_RESETS_PER_WINDOW:
            # Invalidate this user's earlier unused links so only the newest works.
            db.query(PasswordReset).filter(
                PasswordReset.user_id == user.id,
                PasswordReset.used_at.is_(None),
            ).update({PasswordReset.used_at: now}, synchronize_session=False)

            raw_token = generate_reset_token()
            db.add(PasswordReset(
                user_id=user.id,
                token_hash=hash_reset_token(raw_token),
                expires_at=now + timedelta(
                    minutes=settings.password_reset_token_expire_minutes
                ),
                requested_ip=(request.client.host if request.client else None),
            ))
            db.commit()

            background_tasks.add_task(
                send_password_reset_email, sender, to=user.email, raw_token=raw_token
            )

    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Consume a reset token and set a new password.

    One vague 400 for every token failure mode (unknown / expired / already
    used) so nothing leaks. The new-password length is checked by the schema, so
    a too-short password 422s *before* the token is spent.
    """
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="This reset link is invalid or has expired. Request a new one.",
    )
    now = datetime.now(timezone.utc)

    pr = (
        db.query(PasswordReset)
        .filter(PasswordReset.token_hash == hash_reset_token(body.token))
        .first()
    )
    if pr is None or pr.used_at is not None or pr.expires_at <= now:
        raise invalid

    user = (
        db.query(User)
        .filter(User.id == pr.user_id, User.deleted_at.is_(None))
        .first()
    )
    if user is None:
        raise invalid

    user.password_hash = hash_password(body.new_password)
    # Whole seconds -- see token_predates_password_change. Ends every session
    # that was open before this reset (the point of "reset my stolen laptop").
    user.password_changed_at = now.replace(microsecond=0)

    pr.used_at = now
    # Burn this user's other outstanding links too.
    db.query(PasswordReset).filter(
        PasswordReset.user_id == user.id,
        PasswordReset.used_at.is_(None),
    ).update({PasswordReset.used_at: now}, synchronize_session=False)

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
