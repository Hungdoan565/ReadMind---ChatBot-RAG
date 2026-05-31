"""
SQLAlchemy models for authentication and room ownership.

Task 2.1: User model (extends FastAPI-Users UUID mixin)
Task 2.2: RoomOwnership model
"""

import uuid
from datetime import datetime

from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTableUUID
from sqlalchemy import String, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.auth.db import Base


# ---------------------------------------------------------------------------
# Task 2.1 — User model
# ---------------------------------------------------------------------------


class User(SQLAlchemyBaseUserTableUUID, Base):
    """
    User model extending FastAPI-Users UUID mixin.

    The mixin provides: id (UUID PK), email, hashed_password,
    is_active, is_superuser, is_verified.
    We add: created_at, updated_at.
    """

    __tablename__ = "user"

    created_at: Mapped[datetime] = mapped_column(
        default=None,
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        default=None,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# ---------------------------------------------------------------------------
# Task 2.2 — Room ownership model
# ---------------------------------------------------------------------------


class RoomOwnership(Base):
    """
    Links a room_code to a user account.

    Allows optional ownership of anonymous rooms by authenticated users.
    A room can be claimed by multiple users (shared rooms) — the unique
    constraint is on the pair (room_code, user_id).
    """

    __tablename__ = "room_ownership"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    room_code: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        default=None,
        server_default=func.now(),
        nullable=False,
    )

    # Unique pair — claiming same room twice is a no-op (idempotent)
    __table_args__ = (
        UniqueConstraint("room_code", "user_id", name="uq_room_ownership_room_user"),
        Index("idx_room_ownership_user", "user_id"),
        Index("idx_room_ownership_room", "room_code"),
    )
