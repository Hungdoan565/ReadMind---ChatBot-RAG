"""
Auth router — mounts FastAPI-Users endpoints under /api/auth.

Dual auth backend (see design Decision 2):
  - Cookie backend (browser)     — login/logout set/clear the readmind_auth cookie
  - Bearer backend (programmatic) — login/logout return/revoke a JWT (tests, CLI)

Endpoints mounted:
  POST /api/auth/login            — browser login, sets httpOnly cookie
  POST /api/auth/logout           — browser logout, clears cookie
  POST /api/auth/jwt/login        — programmatic login, returns bearer JWT
  POST /api/auth/jwt/logout       — programmatic logout, revokes bearer JWT
  POST /api/auth/register         — create new user
  POST /api/auth/forgot-password  — request password reset
  POST /api/auth/reset-password   — confirm password reset
  GET  /api/auth/me               — get current user profile (requires auth)
  PATCH /api/auth/me              — update current user profile (requires auth)
"""

from fastapi import APIRouter

from app.core.auth.users import fastapi_users, cookie_backend, bearer_backend
from app.core.auth.schemas import UserCreate, UserRead, UserUpdate

router = APIRouter()

# Cookie login / logout (browser) — POST /api/auth/login, /api/auth/logout
router.include_router(
    fastapi_users.get_auth_router(cookie_backend),
    prefix="/auth",
    tags=["auth"],
)

# Bearer login / logout (programmatic) — POST /api/auth/jwt/login, /api/auth/jwt/logout
router.include_router(
    fastapi_users.get_auth_router(bearer_backend),
    prefix="/auth/jwt",
    tags=["auth"],
)

# User registration
router.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/auth",
    tags=["auth"],
)

# Password reset
router.include_router(
    fastapi_users.get_reset_password_router(),
    prefix="/auth",
    tags=["auth"],
)

# Verification (optional but included for completeness)
router.include_router(
    fastapi_users.get_verify_router(UserRead),
    prefix="/auth",
    tags=["auth"],
)

# User profile management (GET /auth/me, PATCH /auth/me)
router.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/auth",
    tags=["auth"],
)
