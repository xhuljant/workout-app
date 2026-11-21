"""workout-level heart rate & calories: workouts.avg_hr, workouts.calories

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-21

Optional whole-session numbers the user copies from their watch. Nullable, so
existing rows need no back-fill.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("workouts", sa.Column("avg_hr", sa.Integer(), nullable=True))
    op.add_column("workouts", sa.Column("calories", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("workouts", "calories")
    op.drop_column("workouts", "avg_hr")
