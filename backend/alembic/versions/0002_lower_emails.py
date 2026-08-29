"""lower-case any stored emails that aren't already

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-28

Was a one-time fixup in main.py's lifespan; now a versioned data migration.
Idempotent -- safe on a database where every email is already lower-case.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE users SET email = lower(email) WHERE email <> lower(email)")


def downgrade() -> None:
    # Lower-casing can't be undone -- there's nothing to restore to.
    pass
