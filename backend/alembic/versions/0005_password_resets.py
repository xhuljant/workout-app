"""password reset: password_resets table + users.password_changed_at

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-29

Adds the self-service "forgot my password" flow's storage:
  - password_resets: one row per outstanding reset request, holding only the
    SHA-256 digest of the emailed token, its expiry, and a used_at marker.
  - users.password_changed_at: stamped on every password change so tokens issued
    before the change can be rejected (see app/deps.py, app/routers/auth.py).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)
NOW = sa.text("now()")


def upgrade() -> None:
    op.create_table(
        "password_resets",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_ip", sa.String(), nullable=True),
    )
    op.create_index("ix_password_resets_user_id", "password_resets", ["user_id"])
    op.create_index(
        "ix_password_resets_token_hash", "password_resets", ["token_hash"], unique=True
    )

    op.add_column(
        "users",
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "password_changed_at")
    op.drop_index("ix_password_resets_token_hash", table_name="password_resets")
    op.drop_index("ix_password_resets_user_id", table_name="password_resets")
    op.drop_table("password_resets")
