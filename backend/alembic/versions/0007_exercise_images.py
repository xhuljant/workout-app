"""exercise example media: exercises.images

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-01

A JSONB list on every exercise. Seeded rows get relative image paths
(free-exercise-db, e.g. "3_4_Sit-Up/0.jpg") back-filled by seed_exercises() on
the next startup; custom rows get `data:image/...` URLs uploaded through the app.
Existing rows default to [] with no table rewrite.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.add_column(
        "exercises",
        sa.Column(
            "images",
            JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("exercises", "images")
