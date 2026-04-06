"""
LLM wrapper — ChatGroq (Groq inference, free tier).
Model: llama-3.3-70b-versatile (fast + capable)
"""

import logging
import httpx
from functools import lru_cache

from langchain_groq import ChatGroq

from app.config import settings

logger = logging.getLogger(__name__)


def _create_http_client() -> httpx.Client:
    """Create httpx client with extended timeout for cloud environments."""
    return httpx.Client(
        timeout=httpx.Timeout(
            timeout=120.0,  # Total timeout
            connect=60.0,  # Connection timeout (increased for DNS resolution)
            read=120.0,  # Read timeout
            write=30.0,  # Write timeout
        ),
        follow_redirects=True,
        # Explicit transport settings for Railway compatibility
        transport=httpx.HTTPTransport(
            retries=3,  # Retry on connection failures
        ),
    )


@lru_cache(maxsize=1)
def get_llm() -> ChatGroq:
    """Return a cached ChatGroq instance."""
    logger.info(f"Initializing LLM: {settings.LLM_MODEL} (Groq)")

    return ChatGroq(
        model=settings.LLM_MODEL,
        temperature=settings.LLM_TEMPERATURE,
        max_tokens=settings.LLM_MAX_TOKENS,
        groq_api_key=settings.GROQ_API_KEY,
        http_client=_create_http_client(),
    )
