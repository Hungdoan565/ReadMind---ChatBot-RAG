"""Create room_ownership table.

Revision ID: 003
Revises: 002
Create Date: 2026-04-09
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "room_ownership",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("room_code", sa.String(length=32), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("room_code", "user_id", name="uq_room_ownership_room_user"),
    )
    op.create_index("idx_room_ownership_user", "room_ownership", ["user_id"])
    op.create_index("idx_room_ownership_room", "room_ownership", ["room_code"])


def downgrade() -> None:
    op.drop_index("idx_room_ownership_room", table_name="room_ownership")
    op.drop_index("idx_room_ownership_user", table_name="room_ownership")
    op.drop_table("room_ownership")
