"""Database models (tables).

Milestone 1 only needs the `users` table. Every table in this app follows the
same sync-friendly conventions we agreed on, so a future offline client can be
added without redesigning the database:

  - id          : a UUID (not an auto-increment number) so a client can create a
                  row and its id without asking the server first.
  - created_at  : when the row was created.
  - updated_at  : bumps automatically on every change -> lets a client ask
                  "give me everything changed since X".
  - deleted_at  : a "soft delete". The row stays in the table but is treated as
                  deleted, so the deletion can sync to other devices.
"""
import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Boolean, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class User(Base):
    __tablename__ = "users"

    # Primary key. default=uuid.uuid4 generates one for rows the server creates.
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Login identifier. unique=True stops two accounts sharing an email;
    # index=True makes "find user by email" (which login does) fast.
    email: Mapped[str] = mapped_column(
        String, unique=True, index=True, nullable=False
    )

    # Shown in the UI, e.g. "Signed in as ...".
    display_name: Mapped[str] = mapped_column(String, nullable=False)

    # The argon2 hash of the password. We NEVER store the raw password.
    password_hash: Mapped[str] = mapped_column(String, nullable=False)

    # Free-form settings (units, default rest timer, ...). JSONB lets us add new
    # preferences later without a database migration.
    preferences: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Timestamps. server_default/onupdate let Postgres fill these in for us.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # NULL = the account is active. A timestamp here = soft-deleted.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Exercise(Base):
    """The exercise library. One shared, global table -- every user sees every
    row, so an exercise added by one person shows up for everyone.

    Rows come from two places:
      - the seeded public library (free-exercise-db), where source_id holds that
        project's slug and is_custom is False;
      - exercises a user adds through the app, where created_by points at them
        and is_custom is True.
    """

    __tablename__ = "exercises"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # The free-exercise-db slug (e.g. "Barbell_Squat"). Lets the startup seed run
    # again without creating duplicates. NULL for user-added exercises.
    source_id: Mapped[str | None] = mapped_column(
        String, unique=True, index=True, nullable=True
    )

    name: Mapped[str] = mapped_column(String, index=True, nullable=False)

    # All optional -- the public data leaves some of these blank, and the add
    # form only requires a name.
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    equipment: Mapped[str | None] = mapped_column(String, nullable=True)
    force: Mapped[str | None] = mapped_column(String, nullable=True)
    level: Mapped[str | None] = mapped_column(String, nullable=True)
    mechanic: Mapped[str | None] = mapped_column(String, nullable=True)

    # Lists of strings. JSONB so we don't need a separate table for these yet.
    primary_muscles: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    secondary_muscles: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    instructions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # True = added by a user through the app; False = came from the seeded library.
    is_custom: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Who added it (NULL for seeded rows). Kept even if that user is later
    # soft-deleted, so the exercise stays in everyone's library.
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
