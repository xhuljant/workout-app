"""progress-photo PIN: users.photo_pin_hash

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-01

One nullable column holding the argon2 hash of the optional progress-photo PIN.
NULL = no photo lock. Nothing here touches existing data.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("photo_pin_hash", sa.String(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("users", "photo_pin_hash")
