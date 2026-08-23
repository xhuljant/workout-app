"""Password hashing (argon2) and JWT token creation/verification.

This module knows nothing about the database or FastAPI -- it's just the crypto
plumbing. Keeping it isolated makes it easy to test on its own.
"""
from datetime import datetime, timedelta, timezone

import jwt  # the PyJWT library
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError

from .config import settings

# One reusable hasher. argon2id (the default here) is a modern, memory-hard
# password hashing algorithm -- a recommended default for new applications.
_password_hasher = PasswordHasher()


def hash_password(plain_password: str) -> str:
    """Turn a raw password into an argon2 hash suitable for storing."""
    return _password_hasher.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Return True if the raw password matches the stored hash, else False."""
    try:
        # Note the argument order: verify(hash, password).
        return _password_hasher.verify(password_hash, plain_password)
    except (VerifyMismatchError, VerificationError):
        # A wrong password raises rather than returning False, so we catch it.
        return False


def _create_token(subject: str, token_type: str, expires_delta: timedelta) -> str:
    """Build and sign a JWT.

    subject     : who the token is about -- we use the user's id.
    token_type  : "access" or "refresh", so we can tell the two apart later.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,                  # standard "subject" claim
        "type": token_type,              # our own claim to separate token kinds
        "iat": now,                      # issued-at time
        "exp": now + expires_delta,      # expiry -- PyJWT refuses the token after this
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: str) -> str:
    """Short-lived token sent with every protected API request."""
    return _create_token(
        user_id, "access", timedelta(minutes=settings.access_token_expire_minutes)
    )


def create_refresh_token(user_id: str) -> str:
    """Long-lived token used only to obtain a fresh access token."""
    return _create_token(
        user_id, "refresh", timedelta(days=settings.refresh_token_expire_days)
    )


def decode_token(token: str) -> dict:
    """Verify a token's signature and expiry and return its payload dict.

    Raises a jwt.PyJWTError subclass if the token is invalid, tampered with,
    or expired. Callers are expected to catch that and return a 401.
    """
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
