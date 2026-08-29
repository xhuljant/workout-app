"""add CHECK constraints that guard against impossible values

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-28

Cheap insurance: a client bug or a manual SQL edit can't write a status /
tracking_type / rest_seconds the aggregation code won't understand.
Existing rows already satisfy all of these.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_workouts_status", "workouts",
        "status IN ('active', 'finished')",
    )
    op.create_check_constraint(
        "ck_workouts_content_version_positive", "workouts",
        "content_version >= 1",
    )
    op.create_check_constraint(
        "ck_workouts_rest_seconds_nonneg", "workouts",
        "rest_seconds IS NULL OR rest_seconds >= 0",
    )
    op.create_check_constraint(
        "ck_exercises_tracking_type", "exercises",
        "tracking_type IN ('weight_reps', 'reps', 'time', 'distance_time')",
    )
    op.create_check_constraint(
        "ck_routines_rest_seconds_nonneg", "routines",
        "rest_seconds IS NULL OR rest_seconds >= 0",
    )


def downgrade() -> None:
    op.drop_constraint("ck_routines_rest_seconds_nonneg", "routines", type_="check")
    op.drop_constraint("ck_exercises_tracking_type", "exercises", type_="check")
    op.drop_constraint("ck_workouts_rest_seconds_nonneg", "workouts", type_="check")
    op.drop_constraint("ck_workouts_content_version_positive", "workouts", type_="check")
    op.drop_constraint("ck_workouts_status", "workouts", type_="check")
