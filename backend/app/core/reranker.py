"""
FlashRank reranker module — optional, graceful fallback.

Provides a module-level singleton Ranker (lazy init) and a
`rerank_documents()` helper consumed by hybrid_search().
"""

import logging
from typing import List

from langchain_core.documents import Document

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy singleton
# ---------------------------------------------------------------------------

_ranker = None  # type: ignore[assignment]
_ranker_init_failed: bool = False  # If init errored once, skip retrying


def _get_ranker():
    """Return the module-level Ranker singleton; returns None if unavailable."""
    global _ranker, _ranker_init_failed

    if _ranker is not None:
        return _ranker

    if _ranker_init_failed:
        return None

    try:
        from flashrank import Ranker  # type: ignore[import]

        _ranker = Ranker(
            model_name="ms-marco-MiniLM-L-12-v2",
            cache_dir="/tmp/flashrank",
        )
        logger.info("FlashRank reranker initialised (ms-marco-MiniLM-L-12-v2)")
        return _ranker
    except ImportError:
        _ranker_init_failed = True
        logger.warning(
            "flashrank package not installed — reranking disabled. "
            "Install with: pip install flashrank==0.2.9"
        )
        return None
    except Exception as exc:
        _ranker_init_failed = True
        logger.warning(f"FlashRank init failed ({exc}) — reranking disabled")
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def rerank_documents(
    query: str,
    docs: List[Document],
    top_n: int | None = None,
) -> List[Document]:
    """
    Rerank *docs* against *query* using FlashRank.

    Args:
        query:  The user question passed to hybrid_search.
        docs:   Candidate documents (already RRF-fused).
        top_n:  How many to keep; if None keeps all re-ranked docs.

    Returns:
        A reranked (and optionally truncated) list of Documents.
        Falls back to the original *docs* list if reranking fails.
    """
    if not docs:
        return docs

    ranker = _get_ranker()
    if ranker is None:
        # Unavailable — return as-is so hybrid_search still works
        return docs[:top_n] if top_n else docs

    try:
        from flashrank import RerankRequest  # type: ignore[import]

        passages = [{"id": i, "text": doc.page_content} for i, doc in enumerate(docs)]
        rerank_req = RerankRequest(query=query, passages=passages)
        results = ranker.rerank(rerank_req)
        # results: list of dicts with "id" and "score", sorted score descending

        limit = top_n if top_n else len(results)
        reranked: List[Document] = [docs[r["id"]] for r in results[:limit]]

        logger.debug(f"Reranked {len(docs)} \u2192 {len(reranked)} docs")
        return reranked

    except Exception as exc:
        logger.warning(
            f"FlashRank rerank call failed ({exc}) — falling back to unranked results"
        )
        return docs[:top_n] if top_n else docs
