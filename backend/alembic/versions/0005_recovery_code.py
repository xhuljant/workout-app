"""account recovery code + users.password_changed_at

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-30

Password recovery is a one-time code, not email:
  - users.recovery_code_hash: argon2 hash of the account's current recovery
    code, shown to the user once at registration and rotated on every reset.
  - users.password_changed_at: stamped on every password change so tokens
    issued before the change are rejected (see app/deps.py, app/routers/auth.py).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
    )
    # server_default="" then dropped: the standard add-a-NOT-NULL-column pattern.
    # Harmless here (the DB is rebuilt); if ever run against existing rows, an
    # empty-string hash simply never verifies.
    op.add_column(
        "users",
        sa.Column("recovery_code_hash", sa.String(), nullable=False, server_default=""),
    )
    op.alter_column("users", "recovery_code_hash", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "recovery_code_hash")
    op.drop_column("users", "password_changed_at")
