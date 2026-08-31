"""web push: subscriptions + pending rest-timer reminders

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-30

Two small tables backing "notify me when the rest timer ends" (Web Push):

  push_subscriptions -- one row per browser/device that opted in.
  push_reminders     -- at most one pending notification per user (PK is user_id),
                        sent by the background loop in app.main once fire_at passes.

Both are pure runtime state; nothing here touches existing data.
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
        "push_subscriptions",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("endpoint", sa.String(), nullable=False),
        sa.Column("p256dh", sa.String(), nullable=False),
        sa.Column("auth", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
    )
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])
    op.create_index(
        "ix_push_subscriptions_endpoint", "push_subscriptions", ["endpoint"], unique=True
    )

    op.create_table(
        "push_reminders",
        sa.Column("user_id", UUID, sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("fire_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("push_reminders")
    op.drop_index("ix_push_subscriptions_endpoint", table_name="push_subscriptions")
    op.drop_index("ix_push_subscriptions_user_id", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
