"""baseline -- the schema as it stood before migrations were introduced

Revision ID: 0001
Revises:
Create Date: 2026-08-28

This reproduces the schema that the old `Base.metadata.create_all` + the two
ad-hoc `lifespan` fixups produced: users, exercises, workouts, routines, folders,
measurement_entries (with `photos` JSONB, no legacy `photo` column).

On an EXISTING database whose schema already matches this, run once:
    alembic stamp 0001
so Alembic records the baseline as applied without re-running it. Fresh
databases get everything from `alembic upgrade head`.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB(astext_type=sa.Text())
NOW = sa.text("now()")


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("preferences", JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "folders",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("collapsed", sa.Boolean(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_folders_user_id", "folders", ["user_id"])
    op.create_index(
        "ix_one_default_folder_per_user",
        "folders",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_default AND deleted_at IS NULL"),
    )

    op.create_table(
        "routines",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("folder_id", UUID, sa.ForeignKey("folders.id"), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("rest_seconds", sa.Integer(), nullable=True),
        sa.Column("content", JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_routines_user_id", "routines", ["user_id"])

    op.create_table(
        "workouts",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("routine_id", UUID, sa.ForeignKey("routines.id"), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("rest_seconds", sa.Integer(), nullable=True),
        sa.Column("content", JSONB, nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_workouts_user_id", "workouts", ["user_id"])
    op.create_index("ix_workouts_status", "workouts", ["status"])
    op.create_index(
        "ix_one_active_workout_per_user",
        "workouts",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active' AND deleted_at IS NULL"),
    )

    op.create_table(
        "exercises",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("source_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "tracking_type",
            sa.String(),
            server_default="weight_reps",
            nullable=False,
        ),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("equipment", sa.String(), nullable=True),
        sa.Column("force", sa.String(), nullable=True),
        sa.Column("level", sa.String(), nullable=True),
        sa.Column("mechanic", sa.String(), nullable=True),
        sa.Column("primary_muscles", JSONB, nullable=False),
        sa.Column("secondary_muscles", JSONB, nullable=False),
        sa.Column("instructions", JSONB, nullable=False),
        sa.Column("is_custom", sa.Boolean(), nullable=False),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_exercises_source_id", "exercises", ["source_id"], unique=True)
    op.create_index("ix_exercises_name", "exercises", ["name"])

    op.create_table(
        "measurement_entries",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("measured_on", sa.Date(), nullable=False),
        sa.Column("values", JSONB, nullable=False),
        sa.Column("photos", JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_measurement_entries_user_id", "measurement_entries", ["user_id"])


def downgrade() -> None:
    op.drop_table("measurement_entries")
    op.drop_table("exercises")
    op.drop_table("workouts")
    op.drop_table("routines")
    op.drop_table("folders")
    op.drop_table("users")
