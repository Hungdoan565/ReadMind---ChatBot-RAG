"""
Redis connection manager with graceful fallback.

Provides:
  - get_redis_client()      → redis.asyncio.Redis on DB 0 (general cache)
  - get_rate_limit_redis()  → redis.asyncio.Redis on DB 1 (rate limits)
  - redis_health_check()    → bool (True = connected, False = down)

All functions handle ConnectionError gracefully: they log a warning and
return None rather than raising, so the application degrades gracefully
when Redis is unavailable.
"""

import logging
from typing import Optional

import redis.asyncio as aioredis
from redis.asyncio.connection import ConnectionPool
from redis.exceptions import (
    ConnectionError as RedisConnectionError,
    TimeoutError as RedisTimeoutError,
)

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level singletons — pools are created once and reused across calls
# ---------------------------------------------------------------------------
_redis_pool: Optional[ConnectionPool] = None
_rate_limit_pool: Optional[ConnectionPool] = None

_POOL_KWARGS = dict(
    max_connections=20,
    health_check_interval=30,
    decode_responses=True,
    socket_connect_timeout=2,
    socket_timeout=2,
)


def _get_or_create_pool(url: str, pool_attr: str) -> ConnectionPool:
    """Return (creating if needed) a module-level connection pool."""
    global _redis_pool, _rate_limit_pool

    if pool_attr == "_redis_pool":
        if _redis_pool is None:
            _redis_pool = aioredis.BlockingConnectionPool.from_url(url, **_POOL_KWARGS)
        return _redis_pool
    else:
        if _rate_limit_pool is None:
            _rate_limit_pool = aioredis.BlockingConnectionPool.from_url(
                url, **_POOL_KWARGS
            )
        return _rate_limit_pool


async def get_redis_client() -> Optional[aioredis.Redis]:
    """
    Return an async Redis client for DB 0 (general cache / sessions).

    Returns None (does not raise) when Redis is unavailable, so callers
    can implement graceful fallback.
    """
    try:
        pool = _get_or_create_pool(settings.REDIS_URL, "_redis_pool")
        client = aioredis.Redis(connection_pool=pool)
        # Quick ping to verify connectivity
        await client.ping()
        return client
    except (RedisConnectionError, RedisTimeoutError, OSError) as exc:
        logger.warning("Redis (DB 0) unavailable: %s", exc)
        return None
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis (DB 0) unexpected error: %s", exc)
        return None


async def get_rate_limit_redis() -> Optional[aioredis.Redis]:
    """
    Return an async Redis client for DB 1 (rate limiting).

    Returns None (does not raise) when Redis is unavailable.
    """
    try:
        pool = _get_or_create_pool(settings.REDIS_RATE_LIMIT_URL, "_rate_limit_pool")
        client = aioredis.Redis(connection_pool=pool)
        await client.ping()
        return client
    except (RedisConnectionError, RedisTimeoutError, OSError) as exc:
        logger.warning("Redis (DB 1) unavailable: %s", exc)
        return None
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis (DB 1) unexpected error: %s", exc)
        return None


async def redis_health_check() -> bool:
    """
    Return True if Redis (DB 0) is reachable, False otherwise.

    Never raises — safe to call from a health endpoint.
    """
    try:
        pool = _get_or_create_pool(settings.REDIS_URL, "_redis_pool")
        client = aioredis.Redis(connection_pool=pool)
        result = await client.ping()
        return result is True
    except Exception as exc:  # noqa: BLE001
        logger.debug("Redis health check failed: %s", exc)
        return False


async def close_redis_pools() -> None:
    """Disconnect all connection pools on application shutdown."""
    global _redis_pool, _rate_limit_pool

    if _redis_pool is not None:
        try:
            await _redis_pool.aclose()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Error closing Redis pool (DB 0): %s", exc)
        finally:
            _redis_pool = None

    if _rate_limit_pool is not None:
        try:
            await _rate_limit_pool.aclose()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Error closing Redis pool (DB 1): %s", exc)
        finally:
            _rate_limit_pool = None
