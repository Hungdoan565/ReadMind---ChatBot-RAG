"""
Redis-backed chat session history with in-memory fallback.

RedisChatMessageHistory implements LangChain's BaseChatMessageHistory
interface and stores messages as a JSON list in Redis with a 24-hour TTL.

If Redis is unavailable (network error, not running), it transparently
falls back to an in-memory ChatMessageHistory so the app keeps working.
"""

import json
import logging
from typing import List, Optional, Sequence

from langchain_core.messages import BaseMessage, messages_from_dict, messages_to_dict
from langchain_community.chat_message_histories import ChatMessageHistory

logger = logging.getLogger(__name__)

_SESSION_KEY_PREFIX = "chat_session:"
_DEFAULT_TTL = 86400  # 24 hours


class RedisChatMessageHistory:
    """
    Redis-backed chat session history.

    Implements the same interface as BaseChatMessageHistory / ChatMessageHistory
    so it can be used as a drop-in replacement.

    Key pattern: chat_session:{session_id}
    Storage: JSON-serialised message list
    TTL: 24 hours (reset on each write)
    Fallback: in-memory ChatMessageHistory when Redis is unavailable
    """

    def __init__(
        self,
        session_id: str,
        redis_client,  # Optional[redis.asyncio.Redis]
        ttl: int = _DEFAULT_TTL,
    ) -> None:
        self.session_id = session_id
        self._redis = redis_client  # May be None if Redis is down
        self._ttl = ttl
        self._key = f"{_SESSION_KEY_PREFIX}{session_id}"
        self._fallback = ChatMessageHistory()

    # ------------------------------------------------------------------
    # BaseChatMessageHistory interface
    # ------------------------------------------------------------------

    @property
    def messages(self) -> List[BaseMessage]:
        """Load messages synchronously (required by LangChain)."""
        if self._redis is None:
            return self._fallback.messages

        import asyncio

        try:
            # If we're already in an event loop, we need a workaround
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # Run in a thread to avoid nested event loop issues
                    import concurrent.futures

                    with concurrent.futures.ThreadPoolExecutor() as pool:
                        future = pool.submit(
                            asyncio.run,
                            self._aget_messages(),
                        )
                        return future.result(timeout=5)
            except RuntimeError:
                pass
            return asyncio.run(self._aget_messages())
        except Exception as exc:
            logger.warning("Redis get messages failed (%s), using fallback", exc)
            return self._fallback.messages

    async def _aget_messages(self) -> List[BaseMessage]:
        """Async load messages from Redis."""
        try:
            raw = await self._redis.get(self._key)
            if raw is None:
                return []
            data = json.loads(raw)
            return messages_from_dict(data)
        except Exception as exc:
            logger.warning("Redis _aget_messages failed: %s", exc)
            return self._fallback.messages

    def add_message(self, message: BaseMessage) -> None:
        """Add a message (synchronous wrapper)."""
        import asyncio

        try:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    import concurrent.futures

                    with concurrent.futures.ThreadPoolExecutor() as pool:
                        future = pool.submit(
                            asyncio.run,
                            self._aadd_message(message),
                        )
                        future.result(timeout=5)
                    return
            except RuntimeError:
                pass
            asyncio.run(self._aadd_message(message))
        except Exception as exc:
            logger.warning("Redis add_message failed (%s), writing to fallback", exc)
            self._fallback.add_message(message)

    async def _aadd_message(self, message: BaseMessage) -> None:
        """Async save message to Redis."""
        if self._redis is None:
            self._fallback.add_message(message)
            return
        try:
            current = await self._aget_messages()
            current.append(message)
            serialized = json.dumps(messages_to_dict(current))
            await self._redis.setex(self._key, self._ttl, serialized)
        except Exception as exc:
            logger.warning("Redis _aadd_message failed: %s", exc)
            self._fallback.add_message(message)

    def add_messages(self, messages: Sequence[BaseMessage]) -> None:
        """Add multiple messages."""
        for msg in messages:
            self.add_message(msg)

    def clear(self) -> None:
        """Clear all messages."""
        import asyncio

        try:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    import concurrent.futures

                    with concurrent.futures.ThreadPoolExecutor() as pool:
                        future = pool.submit(asyncio.run, self._aclear())
                        future.result(timeout=5)
                    return
            except RuntimeError:
                pass
            asyncio.run(self._aclear())
        except Exception as exc:
            logger.warning("Redis clear failed (%s), clearing fallback", exc)
            self._fallback.clear()

    async def _aclear(self) -> None:
        if self._redis is not None:
            try:
                await self._redis.delete(self._key)
            except Exception as exc:
                logger.warning("Redis _aclear failed: %s", exc)
        self._fallback.clear()
