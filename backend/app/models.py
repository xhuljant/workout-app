"""Database models (tables).

Tables so far: `users`, `exercises`, `workouts`, `routines`, `folders`. Every
table in this app follows the same sync-friendly conventions we agreed on, so a
future offline client can be added without redesigning the database:

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

from sqlalchemy import (
    String,
    Integer,
    DateTime,
    Boolean,
    ForeignKey,
    Index,
    func,
    text,
)
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


class Workout(Base):
    """One workout session for a user.

    A workout is "active" while it's being performed and "finished" once the user
    taps Finish. The whole session -- its exercises, sets, reps, weights, notes --
    lives in a single JSONB `content` blob rather than child tables: the client
    re-saves the entire thing on every edit during a session, which is far less
    churn than upserting individual set rows, and the data volume is tiny.

    A partial unique index (see __table_args__) guarantees a user has at most one
    active workout at a time, so "resume my workout" is unambiguous.
    """

    __tablename__ = "workouts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), index=True, nullable=False
    )

    # The routine this workout was started from, if any. Lets Finish offer to
    # fold the session's exercise changes back into that routine.
    routine_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("routines.id"), nullable=True
    )

    # "active" while in progress, "finished" once completed.
    status: Mapped[str] = mapped_column(
        String, index=True, nullable=False, default="active"
    )

    # {"exercises": [{"exercise_id", "name", "notes", "sets": [{"weight","reps","done"}]}]}
    content: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=lambda: {"exercises": []}
    )

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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

    __table_args__ = (
        Index(
            "ix_one_active_workout_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'active' AND deleted_at IS NULL"),
        ),
    )


class Routine(Base):
    """A reusable workout template a user builds: a named, ordered list of
    exercises, each with planned sets.

    Like Workout, the body lives in one JSONB `content` blob -- the editor sends
    the whole routine on Save. `position` controls the order it appears in on the
    home screen (lower = higher up).
    """

    __tablename__ = "routines"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), index=True, nullable=False
    )

    # Which folder it's filed under on the home screen. NULL is coalesced to the
    # user's default ("My Routines") folder by the API.
    folder_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("folders.id"), nullable=True
    )

    name: Mapped[str] = mapped_column(String, nullable=False)

    # Ordering within the folder. Lower shows first.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # {"exercises": [{"exercise_id", "name", "sets": [{"weight", "reps"}]}]}
    # -- a template, so no per-set "done" and no notes.
    content: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=lambda: {"exercises": []}
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


class Folder(Base):
    """A named group of routines on the home screen. Every user has one
    undeletable `is_default` folder ("My Routines"); routines with no explicit
    folder fall into it.
    """

    __tablename__ = "folders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), index=True, nullable=False
    )

    name: Mapped[str] = mapped_column(String, nullable=False)

    # Ordering among folders. The default folder is pinned first.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Whether the folder is shown collapsed on the home screen (per account).
    collapsed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # True for the one "My Routines" folder that can't be renamed away / deleted.
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

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

    __table_args__ = (
        Index(
            "ix_one_default_folder_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("is_default AND deleted_at IS NULL"),
        ),
    )
