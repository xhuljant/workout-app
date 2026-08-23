"""Pydantic schemas: the shapes of data coming IN (requests) and going OUT (responses).

FastAPI uses these to:
  - validate and parse incoming JSON automatically (bad input -> a clear 422 error),
  - and to serialize responses.

Keeping schemas separate from the database models is a deliberate safety habit:
the API physically cannot return a field (like password_hash) unless we list it here.
"""
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserCreate(BaseModel):
    """Body for POST /api/auth/register."""
    email: EmailStr                                  # validated as an email address
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    """Body for POST /api/auth/login."""
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    """A safe, public view of a user. Note there is no password field of any kind."""
    id: uuid.UUID
    email: EmailStr
    display_name: str
    created_at: datetime

    # from_attributes=True lets Pydantic build this straight from a SQLAlchemy
    # User object (reading user.id, user.email, ... by attribute).
    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    """Returned by register / login / refresh."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    """Body for POST /api/auth/refresh."""
    refresh_token: str
