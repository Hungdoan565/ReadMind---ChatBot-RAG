"""
FastAPI dependency utilities.

get_current_user_optional
    Extracts and validates the Bearer JWT if present.
    Returns User object on success, None if no token or invalid/expired token.
    NEVER raises 401 — designed for endpoints that work both authenticated
    and anonymously (backward compatibility).
"""

import logging
from typing import Optional

from fastapi import Request
from fastapi.security import OAuth2PasswordBearer

from app.core.auth.users import current_user_optional
from app.core.auth.models import User

logger = logging.getLogger(__name__)

# Re-export the optional dependency so callers can import from deps
get_current_user_optional = current_user_optional

__all__ = ["get_current_user_optional"]
