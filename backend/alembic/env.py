"""
Alembic env.py — async migration support.

Reads DATABASE_URL from settings, replaces asyncpg with psycopg for
synchronous Alembic operations, and imports Base.metadata from all ORM
models so autogenerate can detect schema changes.
"""

import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from sqlalchemy.engine import Connection
from alembic import context

# ---------------------------------------------------------------------------
# Ensure the backend/ directory is on sys.path so we can import app modules
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ---------------------------------------------------------------------------
# Import Base and all models so Alembic autogenerate can see them
# ---------------------------------------------------------------------------
from app.core.auth.db import Base  # noqa: E402  (must be after sys.path insert)

# Import model modules here to register them against Base.metadata.
# Phase 2 models will be imported once created; for now just the base is enough.
# from app.core.auth.models import User, RoomOwnership  # uncomment in Phase 2

# ---------------------------------------------------------------------------
# Alembic Config object
# ---------------------------------------------------------------------------
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)


# ---------------------------------------------------------------------------
# Override sqlalchemy.url from environment if DATABASE_URL_SYNC is set
# ---------------------------------------------------------------------------
def _get_sync_url() -> str:
    """
    Return the sync (psycopg) DATABASE URL for Alembic.

    Priority:
      1. DATABASE_URL_SYNC env var (already psycopg)
      2. DATABASE_URL env var with asyncpg → psycopg substitution
      3. alembic.ini fallback
    """
    sync_url = os.environ.get("DATABASE_URL_SYNC")
    if sync_url:
        return sync_url

    async_url = os.environ.get("DATABASE_URL")
    if async_url:
        return async_url.replace("postgresql+asyncpg://", "postgresql+psycopg://")

    # Fallback to alembic.ini value
    return config.get_main_option("sqlalchemy.url")  # type: ignore[return-value]


target_metadata = Base.metadata


# ---------------------------------------------------------------------------
# Run migrations offline (no DB connection — just emit SQL)
# ---------------------------------------------------------------------------
def run_migrations_offline() -> None:
    """Run migrations without a live DB connection (emit SQL to stdout)."""
    url = _get_sync_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Run migrations online (with a live DB connection)
# ---------------------------------------------------------------------------
def run_migrations_online() -> None:
    """Run migrations with a live DB connection."""
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = _get_sync_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
