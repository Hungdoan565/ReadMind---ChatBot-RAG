"""
FastAPI-Users authentication backend setup.

Provides:
  - UserManager          — user lifecycle hooks
  - get_user_manager()   — FastAPI dependency
  - bearer_backend       — JWT Bearer transport + strategy (CLI/programmatic)
  - cookie_backend       — JWT httpOnly cookie transport + strategy (browser)
  - fastapi_users        — FastAPIUsers instance
  - current_active_user  — dependency requiring valid JWT
  - current_user_optional — dependency returning User or None (backward-compat)
"""

import uuid
import logging
from typing import Optional

from fastapi import Depends, Request
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    CookieTransport,
    JWTStrategy,
)
from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.db import get_async_session
from app.core.auth.models import User
from app.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Database adapter
# ---------------------------------------------------------------------------


async def get_user_db(session: AsyncSession = Depends(get_async_session)):
    """Yield a SQLAlchemyUserDatabase adapter for FastAPI-Users."""
    yield SQLAlchemyUserDatabase(session, User)


# ---------------------------------------------------------------------------
# User Manager
# ---------------------------------------------------------------------------


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    """
    User lifecycle manager.

    Override on_after_register / on_after_login / on_after_forgot_password
    here when email sending is needed.
    """

    reset_password_token_secret = settings.JWT_SECRET
    verification_token_secret = settings.JWT_SECRET

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        logger.info("User %s registered", user.id)

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        logger.info("User %s requested password reset (token=%s)", user.id, token)

    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        logger.info("User %s requested email verification (token=%s)", user.id, token)


async def get_user_manager(user_db=Depends(get_user_db)):
    """FastAPI dependency that yields a UserManager."""
    yield UserManager(user_db)


# ---------------------------------------------------------------------------
# JWT authentication backend
# ---------------------------------------------------------------------------

bearer_transport = BearerTransport(tokenUrl="/api/auth/jwt/login")

cookie_transport = CookieTransport(
    cookie_name="readmind_auth",
    cookie_max_age=settings.JWT_LIFETIME_SECONDS,
    cookie_path="/",
    cookie_domain=None,
    cookie_secure=(not settings.DEBUG),
    cookie_httponly=True,
    cookie_samesite="lax",
)


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(
        secret=settings.JWT_SECRET,
        lifetime_seconds=settings.JWT_LIFETIME_SECONDS,
    )


# Bearer backend — programmatic/CLI access and existing tests (name="jwt")
bearer_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

# Cookie backend — browser sessions via httpOnly readmind_auth cookie
cookie_backend = AuthenticationBackend(
    name="cookie",
    transport=cookie_transport,
    get_strategy=get_jwt_strategy,
)


# ---------------------------------------------------------------------------
# FastAPIUsers instance
# ---------------------------------------------------------------------------

fastapi_users = FastAPIUsers[User, uuid.UUID](
    get_user_manager, [cookie_backend, bearer_backend]
)

# ---------------------------------------------------------------------------
# Dependency exports
# ---------------------------------------------------------------------------

# Requires valid JWT — raises 401 if no/invalid token
current_active_user = fastapi_users.current_user(active=True)

# Returns User or None — NEVER raises 401 (backward-compatible)
current_user_optional = fastapi_users.current_user(active=True, optional=True)
