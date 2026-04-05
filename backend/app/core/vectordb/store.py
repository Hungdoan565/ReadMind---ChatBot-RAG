"""
VectorStore wrapper for ChromaDB.
Handles embedding + persistence.

Module 6: Hybrid search (Dense + BM25 + RRF).
"""

import logging
from pathlib import Path
from typing import List, Dict, Any, Optional

from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.documents import Document

from app.config import settings

logger = logging.getLogger(__name__)

_vectorstore: Chroma | None = None


def get_vectorstore() -> Chroma:
    """Return singleton ChromaDB instance (lazy init)."""
    global _vectorstore
    if _vectorstore is None:
        Path(settings.CHROMA_PERSIST_DIR).mkdir(parents=True, exist_ok=True)
        embeddings = HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
        _vectorstore = Chroma(
            collection_name="rag_documents",
            embedding_function=embeddings,
            persist_directory=settings.CHROMA_PERSIST_DIR,
        )
        logger.info(f"ChromaDB initialized at {settings.CHROMA_PERSIST_DIR}")
    return _vectorstore


def add_documents(documents: List[Document]) -> int:
    """Add documents to vector store. Returns count added."""
    store = get_vectorstore()
    store.add_documents(documents)
    logger.info(f"Added {len(documents)} chunks to ChromaDB")
    return len(documents)


def delete_by_doc_id(doc_id: str, room_code: str) -> int:
    """
    Delete all chunks belonging to a specific document within a room.
    Returns the number of chunks deleted.
    """
    store = get_vectorstore()
    collection = store._collection

    # Query documents with this doc_id AND room_code
    results = collection.get(
        where={"$and": [{"doc_id": doc_id}, {"room_code": room_code}]}
    )

    if not results or not results["ids"]:
        logger.warning(f"No chunks found for doc_id={doc_id} in room={room_code}")
        return 0

    # Delete by IDs
    ids_to_delete = results["ids"]
    collection.delete(ids=ids_to_delete)

    count = len(ids_to_delete)
    logger.info(f"Deleted {count} chunks for doc_id={doc_id} in room={room_code}")
    return count


def list_documents(room_code: str) -> List[Dict[str, Any]]:
    """
    List all unique documents stored in ChromaDB for a specific room.

    Args:
        room_code: The room to list documents for.

    Returns:
        List of dicts with doc_id, source, chunk_count, etc.
    """
    store = get_vectorstore()
    collection = store._collection

    # Get documents for this room only
    all_docs = collection.get(where={"room_code": room_code}, include=["metadatas"])

    if not all_docs or not all_docs.get("metadatas"):
        return []

    # Group by doc_id
    doc_info: Dict[str, Dict[str, Any]] = {}
    for meta in all_docs["metadatas"]:
        doc_id = meta.get("doc_id", "unknown")
        if doc_id not in doc_info:
            doc_info[doc_id] = {
                "doc_id": doc_id,
                "source": meta.get("source", "unknown"),
                "chunk_count": 0,
            }
        doc_info[doc_id]["chunk_count"] += 1

    return list(doc_info.values())


def similarity_search(
    query: str,
    k: int | None = None,
    doc_ids: Optional[List[str]] = None,
    room_code: str | None = None,
) -> List[Document]:
    """
    Search for similar documents (dense only).

    Args:
        query: Search query.
        k: Number of results.
        doc_ids: If provided, only search within these document IDs.
        room_code: If provided, only search within this room.
    """
    store = get_vectorstore()
    top_k = k or settings.RETRIEVAL_TOP_K

    # Build where clause
    where_filter = None
    conditions = []
    if doc_ids:
        conditions.append({"doc_id": {"$in": doc_ids}})
    if room_code:
        conditions.append({"room_code": room_code})
    if conditions:
        where_filter = {"$and": conditions} if len(conditions) > 1 else conditions[0]

    return store.similarity_search(query, k=top_k, filter=where_filter)


def get_retriever(k: int | None = None):
    """Return a standard LangChain dense retriever."""
    store = get_vectorstore()
    top_k = k or settings.RETRIEVAL_TOP_K
    return store.as_retriever(search_kwargs={"k": top_k})


# ---------------------------------------------------------------------------
# Hybrid search: BM25 + Dense + Reciprocal Rank Fusion (RRF)
# ---------------------------------------------------------------------------


def _tokenize(text: str) -> List[str]:
    """Simple whitespace + lowercase tokenizer for BM25."""
    return text.lower().split()


def _rrf_score(rank: int, k: int = 60) -> float:
    """Reciprocal Rank Fusion score: 1 / (k + rank)."""
    return 1.0 / (k + rank)


def hybrid_search(
    query: str,
    k: int | None = None,
    bm25_weight: float = 0.5,
    dense_weight: float = 0.5,
    doc_ids: Optional[List[str]] = None,
    room_code: str | None = None,
) -> List[Document]:
    """
    Hybrid retrieval: BM25 + Dense vector search fused with RRF.

    Args:
        query: The user question.
        k: Number of results to return (defaults to RETRIEVAL_TOP_K).
        bm25_weight: Weight for BM25 ranking.
        dense_weight: Weight for dense ranking.
        doc_ids: If provided, only search within these document IDs.
        room_code: If provided, only search within this room.

    Returns:
        Top-k deduplicated documents ranked by RRF score.
    """
    top_k = k or settings.RETRIEVAL_TOP_K
    fetch_k = top_k * 3

    store = get_vectorstore()

    # Build where filter
    where_filter = None
    conditions = []
    if doc_ids:
        conditions.append({"doc_id": {"$in": doc_ids}})
    if room_code:
        conditions.append({"room_code": room_code})
    if conditions:
        where_filter = {"$and": conditions} if len(conditions) > 1 else conditions[0]

    # --- 1. Dense retrieval ---
    dense_docs = store.similarity_search(query, k=fetch_k, filter=where_filter)

    # --- 2. BM25 retrieval (over the same ChromaDB collection) ---
    try:
        # Get corpus for BM25 with filter
        if where_filter:
            all_docs = store._collection.get(where=where_filter)
        else:
            all_docs = store.get()

        corpus_texts = all_docs.get("documents", [])
        corpus_metas = all_docs.get("metadatas", [])

        if not corpus_texts:
            logger.warning(
                "ChromaDB collection is empty or no docs match filter — falling back to dense-only search"
            )
            return dense_docs[:top_k]

        from rank_bm25 import BM25Okapi

        tokenized_corpus = [_tokenize(t) for t in corpus_texts]
        bm25 = BM25Okapi(tokenized_corpus)
        tokenized_query = _tokenize(query)
        bm25_scores = bm25.get_scores(tokenized_query)

        # Build BM25 ranked list
        bm25_ranked: List[Document] = []
        sorted_indices = sorted(
            range(len(bm25_scores)), key=lambda i: bm25_scores[i], reverse=True
        )
        for idx in sorted_indices[:fetch_k]:
            doc = Document(
                page_content=corpus_texts[idx],
                metadata=corpus_metas[idx] if corpus_metas else {},
            )
            bm25_ranked.append(doc)

    except Exception as e:
        logger.warning(f"BM25 failed ({e}), falling back to dense-only search")
        return dense_docs[:top_k]

    # --- 3. Reciprocal Rank Fusion ---
    # Use page_content as the deduplication key
    scores: Dict[str, float] = {}
    doc_map: Dict[str, Document] = {}

    for rank, doc in enumerate(dense_docs, start=1):
        key = doc.page_content
        scores[key] = scores.get(key, 0.0) + dense_weight * _rrf_score(rank)
        doc_map[key] = doc

    for rank, doc in enumerate(bm25_ranked, start=1):
        key = doc.page_content
        scores[key] = scores.get(key, 0.0) + bm25_weight * _rrf_score(rank)
        doc_map[key] = doc

    # Sort by fused RRF score descending
    sorted_keys = sorted(scores.keys(), key=lambda k: scores[k], reverse=True)
    result = [doc_map[k] for k in sorted_keys[:top_k]]

    logger.debug(
        f"Hybrid search: {len(dense_docs)} dense + {len(bm25_ranked)} BM25 -> {len(result)} fused"
    )
    return result


def get_hybrid_retriever(k: int | None = None, doc_ids: Optional[List[str]] = None):
    """
    Return a LangChain-compatible hybrid retriever.

    Args:
        k: Number of results to return.
        doc_ids: If provided, only search within these document IDs.
    """
    from langchain_core.retrievers import BaseRetriever
    from langchain_core.callbacks import CallbackManagerForRetrieverRun
    from pydantic import Field

    top_k = k or settings.RETRIEVAL_TOP_K
    filter_doc_ids = doc_ids  # Capture in closure

    class HybridRetriever(BaseRetriever):
        """BM25 + Dense + RRF hybrid retriever with optional doc_id filtering."""

        # Pydantic field for doc_ids (allows runtime update)
        active_doc_ids: Optional[List[str]] = Field(default=None)

        def _get_relevant_documents(
            self,
            query: str,
            *,
            run_manager: CallbackManagerForRetrieverRun,
        ) -> List[Document]:
            # Use instance doc_ids if set, else closure value
            ids_to_use = self.active_doc_ids or filter_doc_ids
            return hybrid_search(query, k=top_k, doc_ids=ids_to_use)

    return HybridRetriever(active_doc_ids=filter_doc_ids)


def validate_doc_ids_in_room(doc_ids: List[str], room_code: str) -> List[str]:
    """
    Validate that doc_ids belong to the specified room.
    Returns the list of valid doc_ids (those that exist in the room).
    Raises ValueError if any doc_id does not belong to this room.
    """
    if not doc_ids:
        return []

    store = get_vectorstore()
    collection = store._collection

    # Get all doc_ids in this room
    room_docs = collection.get(where={"room_code": room_code}, include=["metadatas"])

    valid_doc_ids = set()
    if room_docs and room_docs.get("metadatas"):
        for meta in room_docs["metadatas"]:
            valid_doc_ids.add(meta.get("doc_id"))

    # Check which requested doc_ids are in this room
    invalid = [d for d in doc_ids if d not in valid_doc_ids]
    if invalid:
        raise ValueError(f"Document(s) {invalid} not found in room {room_code}")

    return doc_ids
