from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import os

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.api.routes import health, ingest, chat, eval as eval_router
from app.api.routes import ingest_sources

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup & shutdown events."""
    logger.info(f"Starting {settings.APP_NAME} in {settings.APP_ENV} mode")

    # -----------------------------------------------------------------------
    # 1. Run Alembic migrations (applies 001_pgvector_extension and any new)
    # -----------------------------------------------------------------------
    try:
        from alembic.config import Config as AlembicConfig
        from alembic import command as alembic_command

        alembic_cfg = AlembicConfig(
            os.path.join(os.path.dirname(__file__), "..", "..", "alembic.ini")
        )
        # Override to handle Docker vs local path differences
        alembic_cfg.set_main_option(
            "script_location",
            os.path.join(os.path.dirname(__file__), "..", "..", "alembic"),
        )
        alembic_command.upgrade(alembic_cfg, "head")
        logger.info("Alembic migrations applied (head)")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Alembic migration failed (non-fatal): %s", exc)

    # -----------------------------------------------------------------------
    # 2. Initialize Redis connection pool (fail gracefully)
    # -----------------------------------------------------------------------
    try:
        from app.core.cache.redis_client import get_redis_client, redis_health_check

        redis_ok = await redis_health_check()
        if redis_ok:
            logger.info("Redis connection pool initialized")
        else:
            logger.warning("Redis unavailable at startup — running without Redis")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis initialization failed (non-fatal): %s", exc)

    # -----------------------------------------------------------------------
    # 3. Preload embedding model + vector store (avoids first-request stall).
    #    HuggingFace all-MiniLM cold start is ~slow (model download/load). If
    #    the first user request triggers it synchronously on the event loop,
    #    every concurrent request stalls and the proxy returns 502. Warm it at
    #    startup in a worker thread so requests are fast and never blocked.
    # -----------------------------------------------------------------------
    if not settings.USE_CHROMA:
        try:
            from fastapi.concurrency import run_in_threadpool
            from app.core.vectordb.store import get_vectorstore

            await run_in_threadpool(get_vectorstore)
            logger.info("Vector store + embedding model preloaded")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Vector store preload failed (non-fatal): %s", exc)

    yield

    # -----------------------------------------------------------------------
    # Shutdown: close Redis pools and database engine
    # -----------------------------------------------------------------------
    logger.info("Shutting down...")

    try:
        from app.core.cache.redis_client import close_redis_pools

        await close_redis_pools()
        logger.info("Redis pools closed")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Error closing Redis pools: %s", exc)

    try:
        from app.core.auth.db import engine

        await engine.dispose()
        logger.info("Database engine disposed")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Error disposing database engine: %s", exc)


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    docs_url="/docs" if settings.DEBUG else None,
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Rate limiter — use Redis if available, fall back to in-memory
# ---------------------------------------------------------------------------
try:
    storage_uri = settings.REDIS_RATE_LIMIT_URL
    limiter = Limiter(
        key_func=get_remote_address,
        storage_uri=storage_uri,
    )
    logger.info("Rate limiter initialized with Redis storage: %s", storage_uri)
except Exception:
    limiter = Limiter(key_func=get_remote_address)  # fallback to in-memory
    logger.info("Rate limiter initialized with in-memory storage (Redis unavailable)")

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request, exc):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Try again later."},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(ingest.router, prefix="/api", tags=["ingest"])
app.include_router(ingest_sources.router, prefix="/api", tags=["ingest"])
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(eval_router.router, prefix="/api", tags=["eval"])

# ---------------------------------------------------------------------------
# Task 2.4 — Auth routes
# ---------------------------------------------------------------------------
from app.api.routes import auth  # noqa: E402

app.include_router(auth.router, prefix="/api", tags=["auth"])

# ---------------------------------------------------------------------------
# Task 2.10 — Room management routes
# ---------------------------------------------------------------------------
from app.api.routes import rooms  # noqa: E402

app.include_router(rooms.router, prefix="/api", tags=["rooms"])
