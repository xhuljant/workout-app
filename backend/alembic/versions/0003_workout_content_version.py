"""add workouts.content_version for optimistic concurrency

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-28

Every write to PUT /api/workouts/active bumps this. A client that sends a stale
value gets a 409 instead of silently clobbering another device's edits.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workouts",
        sa.Column(
            "content_version",
            sa.Integer(),
            server_default="1",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("workouts", "content_version")
