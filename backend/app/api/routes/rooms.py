"""
Room management endpoints.

GET  /api/rooms                    — list rooms owned by authenticated user
POST /api/rooms/{room_code}/claim  — link existing room to user account
"""

import uuid
import logging
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.auth.db import get_async_session
from app.core.auth.models import User, RoomOwnership
from app.core.auth.users import current_active_user

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class RoomInfo(BaseModel):
    room_code: str
    created_at: datetime
    document_count: int

    class Config:
        from_attributes = True


class RoomsResponse(BaseModel):
    rooms: List[RoomInfo]


class ClaimResponse(BaseModel):
    room_code: str
    status: str
    message: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/rooms", response_model=RoomsResponse)
async def list_rooms(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> RoomsResponse:
    """
    List all rooms owned by the authenticated user.

    Returns rooms with document counts from the vector store.
    """
    result = await session.execute(
        select(RoomOwnership).where(RoomOwnership.user_id == user.id)
    )
    ownerships = result.scalars().all()

    rooms: List[RoomInfo] = []
    for ownership in ownerships:
        # Get document count from vector store
        try:
            from app.core.vectordb.store import list_documents

            docs = list_documents(ownership.room_code)
            doc_count = len(docs)
        except Exception as exc:
            logger.warning(
                "Could not get document count for room %s: %s",
                ownership.room_code,
                exc,
            )
            doc_count = 0

        rooms.append(
            RoomInfo(
                room_code=ownership.room_code,
                created_at=ownership.created_at,
                document_count=doc_count,
            )
        )

    return RoomsResponse(rooms=rooms)


@router.post("/rooms/{room_code}/claim", response_model=ClaimResponse)
async def claim_room(
    room_code: str,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ClaimResponse:
    """
    Link an existing room to the authenticated user account.

    Idempotent: claiming the same room twice is a no-op (returns success).
    """
    if not room_code or not room_code.strip():
        raise HTTPException(status_code=400, detail="room_code cannot be empty")

    room_code = room_code.strip()

    try:
        # Use INSERT ... ON CONFLICT DO NOTHING for idempotency
        stmt = (
            pg_insert(RoomOwnership)
            .values(
                id=uuid.uuid4(),
                room_code=room_code,
                user_id=user.id,
            )
            .on_conflict_do_nothing(constraint="uq_room_ownership_room_user")
        )
        await session.execute(stmt)
        await session.commit()

        return ClaimResponse(
            room_code=room_code,
            status="success",
            message=f"Room '{room_code}' linked to your account",
        )

    except Exception as exc:
        await session.rollback()
        logger.exception("Failed to claim room %s for user %s", room_code, user.id)
        raise HTTPException(status_code=500, detail=f"Failed to claim room: {str(exc)}")
