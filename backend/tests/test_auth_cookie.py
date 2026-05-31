"""
Backend tests for cookie-based authentication transport (Task 7.1).

Validates the "Cookie-based authentication transport" requirement:
  - Cookie login at POST /api/auth/login sets the httpOnly ``readmind_auth`` cookie
  - GET /api/auth/me succeeds when that cookie is presented
  - Bearer login at POST /api/auth/jwt/login still returns an ``access_token``
    (programmatic / CLI access preserved)

No live PostgreSQL is required. The async DB dependency
(``app.core.auth.db.get_async_session``) is overridden with an in-memory SQLite
engine using a single shared connection (StaticPool) so the schema persists
across the sessions fastapi-users opens per request.

``aiosqlite`` is an optional async driver used only by this test. When it is not
installed the whole module skips cleanly via ``importorskip`` — this is a genuine
optional test dependency, NOT a way to mask a real failure (the test runs in
CI/dev where the driver is present).
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.auth.db import Base, get_async_session
from app.core.auth.models import RoomOwnership, User

# Skip the module if the optional async SQLite driver is unavailable. Engine
# creation below would fail at import time without it, so this must run first.
pytest.importorskip("aiosqlite")


@pytest.fixture
def client():
    """
    Yield a TestClient whose DB dependency is an in-memory SQLite database.

    The client is entered as a context manager so all requests share a single
    event loop / portal — required because the StaticPool keeps one in-memory
    connection alive, and that connection is bound to the loop it was created on.
    """
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_maker = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    state = {"schema_ready": False}

    async def override_get_async_session():
        # Create only the auth tables (avoids any Postgres-only models that may
        # later join the same metadata). Done lazily on first use so it runs on
        # the same event loop the request sessions use.
        if not state["schema_ready"]:
            async with engine.begin() as conn:
                await conn.run_sync(
                    Base.metadata.create_all,
                    tables=[User.__table__, RoomOwnership.__table__],
                )
            state["schema_ready"] = True
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_async_session] = override_get_async_session
    try:
        with TestClient(app) as test_client:
            try:
                yield test_client
            finally:
                # Dispose on the portal loop so the aiosqlite connection/thread
                # is closed cleanly before the loop goes away.
                test_client.portal.call(engine.dispose)
    finally:
        app.dependency_overrides.clear()


def _register(client: TestClient, email: str, password: str):
    response = client.post(
        "/api/auth/register", json={"email": email, "password": password}
    )
    assert response.status_code == 201, response.text
    return response


def test_cookie_login_sets_httponly_cookie_and_me_succeeds(client):
    """Cookie login issues the httpOnly readmind_auth cookie; /me works with it."""
    email = f"cookie-{uuid.uuid4().hex}@example.com"
    password = "S3cure-pass!"
    _register(client, email, password)

    # fastapi-users login expects form-encoded username/password (OAuth2 form).
    login = client.post(
        "/api/auth/login", data={"username": email, "password": password}
    )
    # Cookie transport returns 204 No Content (token lives in the cookie).
    assert login.status_code in (200, 204), login.text

    # The Set-Cookie header carries an httpOnly readmind_auth cookie.
    set_cookie = login.headers.get("set-cookie", "")
    assert "readmind_auth=" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "readmind_auth" in login.cookies

    # TestClient persists cookies on its jar, so /me authenticates via the cookie.
    me = client.get("/api/auth/me")
    assert me.status_code == 200, me.text
    assert me.json()["email"] == email


def test_bearer_login_preserves_access_token(client):
    """Bearer login at /api/auth/jwt/login still returns a bearer access_token."""
    email = f"bearer-{uuid.uuid4().hex}@example.com"
    password = "S3cure-pass!"
    _register(client, email, password)

    login = client.post(
        "/api/auth/jwt/login", data={"username": email, "password": password}
    )
    assert login.status_code == 200, login.text
    body = login.json()
    assert body.get("token_type") == "bearer"
    assert body.get("access_token")
