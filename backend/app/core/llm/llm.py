"""
LLM wrapper — ChatGroq (Groq inference, free tier).
Model: llama-3.3-70b-versatile (fast + capable)
"""

import logging
from functools import lru_cache

from langchain_groq import ChatGroq

from app.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_llm() -> ChatGroq:
    """Return a cached ChatGroq instance."""
    logger.info(f"Initializing LLM: {settings.LLM_MODEL} (Groq)")
    return ChatGroq(
        model=settings.LLM_MODEL,
        temperature=settings.LLM_TEMPERATURE,
        max_tokens=settings.LLM_MAX_TOKENS,
        groq_api_key=settings.GROQ_API_KEY,
    )
