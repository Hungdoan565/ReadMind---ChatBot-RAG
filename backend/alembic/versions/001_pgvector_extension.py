"""Install pgvector extension.

Revision ID: 001
Revises:
Create Date: 2026-04-09

Ensures the pgvector extension is available in the database before any
vector-related tables are created (Phase 2 migrations depend on this).
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Install pgvector; IF NOT EXISTS makes this idempotent.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    # Only drop the extension if no vector columns exist.
    # In practice, downgrading here is intentionally a no-op to avoid
    # accidentally removing the extension while other objects depend on it.
    pass
