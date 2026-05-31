"""
Pydantic schemas for FastAPI-Users endpoints.

UserRead    — returned from GET /api/auth/me, POST /api/auth/register
UserCreate  — body for POST /api/auth/register
UserUpdate  — body for PATCH /api/auth/me
"""

import uuid
from datetime import datetime
from typing import Optional

from fastapi_users import schemas


class UserRead(schemas.BaseUser[uuid.UUID]):
    """Schema returned from read endpoints."""

    id: uuid.UUID
    email: str
    is_active: bool
    is_superuser: bool
    is_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserCreate(schemas.BaseUserCreate):
    """Schema for user registration."""

    email: str
    password: str


class UserUpdate(schemas.BaseUserUpdate):
    """Schema for user profile updates (all fields optional)."""

    password: Optional[str] = None
    email: Optional[str] = None
