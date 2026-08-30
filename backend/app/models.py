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
from datetime import date, datetime

from sqlalchemy import (
    String,
    Integer,
    Date,
    DateTime,
    Boolean,
    CheckConstraint,
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

    # Set whenever the password changes (the reset flow or change-password).
    # Any access / refresh token whose "issued at" time is older than this is
    # rejected -- see deps.py and the /refresh route. NULL = never changed since
    # the account was created (no token is older than "never").
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class PasswordReset(Base):
    """One outstanding "I forgot my password" request.

    The raw token is emailed to the user and NEVER stored. We keep only its
    SHA-256 hex digest: the token is 256 bits of CSPRNG output (nothing to
    dictionary-attack, unlike a password), and a plain digest lets us find the
    row with a single indexed equality match instead of scanning + verifying.
    These rows are ephemeral bookkeeping, not synced user content, so there is
    no `deleted_at` -- consumed / expired rows are hard-purged on startup.
    """

    __tablename__ = "password_resets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), index=True, nullable=False
    )
    # SHA-256 hex digest of the emailed token (64 chars). Unique + indexed so
    # reset-password is one indexed lookup.
    token_hash: Mapped[str] = mapped_column(
        String, unique=True, index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    # NULL = still usable. A timestamp = already consumed, or invalidated by a
    # newer request / a successful reset.
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Best-effort record of who asked, for later abuse investigation. Optional.
    requested_ip: Mapped[str | None] = mapped_column(String, nullable=True)


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

    # How sets of this exercise are logged: "weight_reps" (default), "reps",
    # "time", or "distance_time". Seeded rows are classified from `category`.
    tracking_type: Mapped[str] = mapped_column(
        String, nullable=False, server_default="weight_reps", default="weight_reps"
    )

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

    __table_args__ = (
        CheckConstraint(
            "tracking_type IN ('weight_reps', 'reps', 'time', 'distance_time')",
            name="ck_exercises_tracking_type",
        ),
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

    # Rest-timer length for this session, in seconds (seeded at start from the
    # routine or the user's default).
    rest_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # {"exercises": [{"exercise_id", "name", "notes", "sets": [{"weight","reps","done"}]}]}
    content: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=lambda: {"exercises": []}
    )

    # Bumped on every accepted write to PUT /api/workouts/active. The client sends
    # the version it last saw; a mismatch means another device wrote in between,
    # so the server returns 409 instead of silently overwriting those edits.
    content_version: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="1", default=1
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
        CheckConstraint(
            "status IN ('active', 'finished')", name="ck_workouts_status"
        ),
        CheckConstraint(
            "content_version >= 1", name="ck_workouts_content_version_positive"
        ),
        CheckConstraint(
            "rest_seconds IS NULL OR rest_seconds >= 0",
            name="ck_workouts_rest_seconds_nonneg",
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

    # Rest-timer length for workouts started from this routine, in seconds.
    # NULL = fall back to the user's default (preferences.default_rest_seconds).
    rest_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

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

    __table_args__ = (
        CheckConstraint(
            "rest_seconds IS NULL OR rest_seconds >= 0",
            name="ck_routines_rest_seconds_nonneg",
        ),
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


class MeasurementEntry(Base):
    """One dated set of body measurements, plus an optional progress photo.

    `values` is a {type_key: number} blob in CANONICAL units -- kilograms for
    mass, centimetres for length, percent as-is. The client converts to/from the
    user's preferred units for display and entry.
    """

    __tablename__ = "measurement_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), index=True, nullable=False
    )

    # The calendar day the measurement is for -- a plain date, no timezone games.
    measured_on: Mapped[date] = mapped_column(Date, nullable=False)

    # {type_key: number} in canonical units (kg / cm / %).
    values: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Up to 4 progress photos, each a base64 data URL (downscaled client-side).
    photos: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

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
