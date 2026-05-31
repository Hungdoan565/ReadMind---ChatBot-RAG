"""
VectorStore wrapper — PGVectorStore (pgvector) implementation.

USE_CHROMA feature flag:
  - settings.USE_CHROMA=True  → delegates to store_chroma (legacy ChromaDB)
  - settings.USE_CHROMA=False → uses PGVectorStore (default, production)

This module maintains the SAME public function signatures as the old
store_chroma.py so chain.py / chat.py / ingest.py need no changes.

Public API (identical to store_chroma.py):
  get_vectorstore()
  add_documents(documents)
  delete_by_doc_id(doc_id, room_code)
  list_documents(room_code)
  similarity_search(query, k, doc_ids, room_code)
  hybrid_search(query, k, bm25_weight, dense_weight, doc_ids, room_code)
  get_hybrid_retriever(k, doc_ids, room_code)
  validate_doc_ids_in_room(doc_ids, room_code)
"""

import logging
from typing import List, Dict, Any, Optional

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Feature flag: USE_CHROMA=True → ChromaDB, USE_CHROMA=False → pgvector
# ---------------------------------------------------------------------------

if settings.USE_CHROMA:
    # Delegate everything to the legacy ChromaDB implementation
    from app.core.vectordb.store_chroma import (  # noqa: F401
        get_vectorstore,
        add_documents,
        delete_by_doc_id,
        list_documents,
        similarity_search,
        get_retriever,
        hybrid_search,
        get_hybrid_retriever,
        validate_doc_ids_in_room,
    )
else:
    # -----------------------------------------------------------------------
    # PGVectorStore implementation
    # -----------------------------------------------------------------------
    from langchain_core.documents import Document
    from langchain_huggingface import HuggingFaceEmbeddings

    try:
        from langchain_postgres import PGVector

        _PGVECTOR_CLS = PGVector
        logger.debug("Using langchain_postgres.PGVector")
    except ImportError:
        try:
            from langchain_postgres.vectorstores import PGVector

            _PGVECTOR_CLS = PGVector
            logger.debug("Using langchain_postgres.vectorstores.PGVector")
        except ImportError as e:
            raise ImportError(
                "langchain-postgres is required for pgvector support. "
                "Install with: pip install langchain-postgres>=0.0.12"
            ) from e

    _vectorstore: Optional[Any] = None
    _embeddings: Optional[Any] = None
    _meta_engine: Optional[Any] = None

    # Tên bảng do langchain_postgres.PGVector tạo (collection + embedding).
    _COLLECTION_NAME = "rag_documents"

    def _get_meta_engine() -> Any:
        """Return (or create) a lightweight SQLAlchemy engine for metadata-only
        queries (listing documents). This path does NOT load the embedding
        model — listing tài liệu chỉ cần đọc cmetadata jsonb, không cần vector
        search. Tránh cold-start nạp model ~2 phút chỉ để đếm chunk.
        """
        global _meta_engine
        if _meta_engine is None:
            from sqlalchemy import create_engine

            _meta_engine = create_engine(
                settings.DATABASE_URL_SYNC,
                pool_pre_ping=True,
                pool_recycle=300,
            )
            logger.info("Metadata engine initialized for document listing")
        return _meta_engine

    def _get_embeddings() -> HuggingFaceEmbeddings:
        """Return (or create) the singleton embedding model."""
        global _embeddings
        if _embeddings is None:
            _embeddings = HuggingFaceEmbeddings(
                model_name=settings.EMBEDDING_MODEL,
                model_kwargs={"device": "cpu"},
                encode_kwargs={"normalize_embeddings": True},
            )
            logger.info("HuggingFace embeddings loaded: %s", settings.EMBEDDING_MODEL)
        return _embeddings

    def get_vectorstore() -> Any:
        """Return singleton PGVectorStore instance (lazy init)."""
        global _vectorstore
        if _vectorstore is None:
            embeddings = _get_embeddings()
            _vectorstore = _PGVECTOR_CLS(
                connection=settings.DATABASE_URL_SYNC,
                embeddings=embeddings,
                collection_name="rag_documents",
                use_jsonb=True,
            )
            logger.info("PGVectorStore initialized with collection 'rag_documents'")
        return _vectorstore

    def add_documents(documents: List[Document]) -> int:
        """Add documents to PGVectorStore. Returns count added."""
        store = get_vectorstore()
        store.add_documents(documents)
        logger.info("Added %d chunks to PGVectorStore", len(documents))
        return len(documents)

    def delete_by_doc_id(doc_id: str, room_code: str) -> int:
        """
        Delete all chunks belonging to a specific document within a room.

        Returns the number of deleted chunks when determinable.
        """
        store = get_vectorstore()

        # Compatibility path for mocks/legacy objects exposing `_collection`
        # (used by existing tests and Chroma-like interfaces).
        collection = getattr(store, "_collection", None)
        if collection is not None and hasattr(collection, "get"):
            try:
                results = collection.get(
                    where={"$and": [{"doc_id": doc_id}, {"room_code": room_code}]}
                )
                ids_to_delete = results.get("ids", []) if results else []
                if not ids_to_delete:
                    return 0
                collection.delete(ids=ids_to_delete)
                logger.info(
                    "Deleted %d chunks for doc_id=%s in room=%s",
                    len(ids_to_delete),
                    doc_id,
                    room_code,
                )
                return len(ids_to_delete)
            except Exception as exc:
                logger.warning("delete_by_doc_id collection path failed: %s", exc)
                return 0

        # PGVector path: determine count first, then delete by metadata filter.
        try:
            matches = store.similarity_search(
                query="",
                k=10000,
                filter={
                    "$and": [
                        {"doc_id": {"$eq": doc_id}},
                        {"room_code": {"$eq": room_code}},
                    ]
                },
            )
            match_count = len(matches)
            if match_count == 0:
                return 0

            store.delete(
                filter={
                    "$and": [
                        {"doc_id": {"$eq": doc_id}},
                        {"room_code": {"$eq": room_code}},
                    ]
                }
            )
            logger.info(
                "Deleted %d chunks for doc_id=%s in room=%s",
                match_count,
                doc_id,
                room_code,
            )
            return match_count
        except Exception as exc:
            logger.warning("delete_by_doc_id pgvector path failed: %s", exc)
            return 0

    def list_documents(room_code: str) -> List[Dict[str, Any]]:
        """
        List all unique documents in a room.

        Returns:
            List[dict]: [{doc_id, source, chunk_count}, ...]
        """
        store = get_vectorstore()

        # Compatibility path for mocks/legacy objects exposing `_collection`.
        collection = getattr(store, "_collection", None)
        if collection is not None and hasattr(collection, "get"):
            try:
                all_docs = collection.get(
                    where={"room_code": room_code}, include=["metadatas"]
                )
                metadatas = all_docs.get("metadatas", []) if all_docs else []
                if not metadatas:
                    return []

                doc_info: Dict[str, Dict[str, Any]] = {}
                for meta in metadatas:
                    doc_id = meta.get("doc_id", "unknown")
                    if doc_id not in doc_info:
                        doc_info[doc_id] = {
                            "doc_id": doc_id,
                            "source": meta.get("source", "unknown"),
                            "chunk_count": 0,
                        }
                    doc_info[doc_id]["chunk_count"] += 1

                return list(doc_info.values())
            except Exception as exc:
                logger.warning("list_documents collection path failed: %s", exc)
                return []

        # PGVector path — metadata-only SQL (KHÔNG nạp model, KHÔNG vector search).
        # langchain_postgres lưu mỗi chunk 1 row trong langchain_pg_embedding với
        # cmetadata jsonb {doc_id, source, room_code, ...}. Đếm/nhóm bằng SQL
        # nhanh hơn nhiều lần so với similarity_search(query="", k=10000) cũ —
        # đường cũ buộc nạp embedding model (~2 phút cold start) chỉ để đếm.
        from sqlalchemy import text

        try:
            engine = _get_meta_engine()
            with engine.connect() as conn:
                rows = conn.execute(
                    text(
                        """
                        SELECT e.cmetadata->>'doc_id'   AS doc_id,
                               e.cmetadata->>'source'    AS source,
                               COUNT(*)                  AS chunk_count
                        FROM langchain_pg_embedding e
                        JOIN langchain_pg_collection c ON e.collection_id = c.uuid
                        WHERE c.name = :collection
                          AND e.cmetadata->>'room_code' = :room_code
                        GROUP BY e.cmetadata->>'doc_id', e.cmetadata->>'source'
                        """
                    ),
                    {"collection": _COLLECTION_NAME, "room_code": room_code},
                ).fetchall()
        except Exception as exc:
            logger.warning("list_documents pgvector SQL path failed: %s", exc)
            return []

        return [
            {
                "doc_id": row.doc_id or "unknown",
                "source": row.source or "unknown",
                "chunk_count": int(row.chunk_count),
            }
            for row in rows
        ]

    def similarity_search(
        query: str,
        k: int | None = None,
        doc_ids: Optional[List[str]] = None,
        room_code: str | None = None,
    ) -> List[Document]:
        """
        Dense vector search with metadata filtering.

        Args:
            query: Search query.
            k: Number of results.
            doc_ids: If provided, only search within these document IDs.
            room_code: If provided, only search within this room.
        """
        store = get_vectorstore()
        top_k = k or settings.RETRIEVAL_TOP_K

        # Build filter
        conditions = []
        if doc_ids:
            conditions.append({"doc_id": {"$in": doc_ids}})
        if room_code:
            conditions.append({"room_code": {"$eq": room_code}})

        if not conditions:
            filter_dict = None
        elif len(conditions) == 1:
            filter_dict = conditions[0]
        else:
            filter_dict = {"$and": conditions}

        kwargs: Dict[str, Any] = {"k": top_k}
        if filter_dict:
            kwargs["filter"] = filter_dict

        return store.similarity_search(query, **kwargs)

    def hybrid_search(
        query: str,
        k: int | None = None,
        bm25_weight: float = 0.5,
        dense_weight: float = 0.5,
        doc_ids: Optional[List[str]] = None,
        room_code: str | None = None,
    ) -> List[Document]:
        """
        Hybrid retrieval: BM25 + Dense + RRF.

        PGVectorStore doesn't natively support BM25 hybrid via HybridSearchConfig
        in all versions, so we implement RRF manually using:
          1. Dense semantic search (PGVectorStore.similarity_search)
          2. BM25 on the retrieved candidates (rank_bm25)
          3. RRF fusion

        Args:
            query: The user question.
            k: Number of results to return.
            bm25_weight: Weight for BM25 ranking.
            dense_weight: Weight for dense ranking.
            doc_ids: If provided, only search within these document IDs.
            room_code: If provided, only search within this room.

        Returns:
            Top-k deduplicated documents ranked by RRF score.
        """
        top_k = k or settings.RETRIEVAL_TOP_K
        fetch_k = top_k * 3

        # --- 1. Dense retrieval ---
        dense_docs = similarity_search(
            query, k=fetch_k, doc_ids=doc_ids, room_code=room_code
        )

        if not dense_docs:
            return []

        # --- 2. BM25 on retrieved candidates ---
        try:
            from rank_bm25 import BM25Okapi

            corpus_texts = [doc.page_content for doc in dense_docs]
            tokenized_corpus = [t.lower().split() for t in corpus_texts]
            bm25 = BM25Okapi(tokenized_corpus)
            bm25_scores = bm25.get_scores(query.lower().split())

            bm25_ranked = [
                dense_docs[i]
                for i in sorted(
                    range(len(bm25_scores)), key=lambda i: bm25_scores[i], reverse=True
                )[:fetch_k]
            ]
        except Exception as exc:
            logger.warning("BM25 failed (%s), falling back to dense-only search", exc)
            bm25_ranked = dense_docs[:]

        # --- 3. Reciprocal Rank Fusion ---
        def _rrf(rank: int, rrf_k: int = 60) -> float:
            return 1.0 / (rrf_k + rank)

        scores: Dict[str, float] = {}
        doc_map: Dict[str, Document] = {}

        for rank, doc in enumerate(dense_docs, start=1):
            key = doc.page_content
            scores[key] = scores.get(key, 0.0) + dense_weight * _rrf(rank)
            doc_map[key] = doc

        for rank, doc in enumerate(bm25_ranked, start=1):
            key = doc.page_content
            scores[key] = scores.get(key, 0.0) + bm25_weight * _rrf(rank)
            doc_map[key] = doc

        # Fuse ALL candidates (do NOT truncate to top_k here — rerank must see
        # the full fused pool, up to fetch_k). Slicing to final_n happens AFTER
        # reranking so the cross-encoder gets the large candidate set (Req 7).
        sorted_keys = sorted(scores.keys(), key=lambda k: scores[k], reverse=True)
        fused: List[Document] = [doc_map[k] for k in sorted_keys]

        # final_n = số tài liệu cuối cùng; min để không vượt cả top_k lẫn RERANK_TOP_N.
        final_n = min(settings.RERANK_TOP_N, top_k)

        # --- 4. FlashRank reranking trên tập đã fuse, fallback an toàn (Req 8) ---
        from app.core.reranker import rerank_documents

        try:
            result = rerank_documents(query, fused, top_n=final_n)
        except Exception as exc:  # noqa: BLE001 — không nuốt: log rồi fallback
            logger.warning("Rerank lỗi (%s) — fallback RRF top_n", exc)
            result = fused[:final_n]

        # Bất biến: len(result) ≤ final_n ở MỌI nhánh (kể cả khi reranker trả thừa).
        result = result[:final_n]

        logger.debug(
            "Hybrid search: %d dense + %d BM25 -> %d fused -> %d final",
            len(dense_docs),
            len(bm25_ranked),
            len(fused),
            len(result),
        )
        return result

    def get_retriever(k: int | None = None):
        """Return a standard LangChain dense retriever."""
        store = get_vectorstore()
        top_k = k or settings.RETRIEVAL_TOP_K
        return store.as_retriever(search_kwargs={"k": top_k})

    def get_hybrid_retriever(
        k: int | None = None,
        doc_ids: Optional[List[str]] = None,
        room_code: str | None = None,
    ):
        """
        Return a LangChain-compatible hybrid retriever.

        Args:
            k: Number of results to return.
            doc_ids: If provided, only search within these document IDs.
            room_code: If provided, only search within this room.
        """
        from langchain_core.retrievers import BaseRetriever
        from langchain_core.callbacks import CallbackManagerForRetrieverRun
        from pydantic import Field

        top_k = k or settings.RETRIEVAL_TOP_K
        filter_doc_ids = doc_ids
        filter_room_code = room_code

        class HybridRetriever(BaseRetriever):
            """BM25 + Dense + RRF hybrid retriever with optional doc_id filtering."""

            active_doc_ids: Optional[List[str]] = Field(default=None)
            active_room_code: Optional[str] = Field(default=None)

            def _get_relevant_documents(
                self,
                query: str,
                *,
                run_manager: CallbackManagerForRetrieverRun,
            ) -> List[Document]:
                ids_to_use = self.active_doc_ids or filter_doc_ids
                room_to_use = self.active_room_code or filter_room_code
                return hybrid_search(
                    query, k=top_k, doc_ids=ids_to_use, room_code=room_to_use
                )

        return HybridRetriever(
            active_doc_ids=filter_doc_ids, active_room_code=filter_room_code
        )

    def validate_doc_ids_in_room(doc_ids: List[str], room_code: str) -> List[str]:
        """
        Validate that doc_ids belong to the specified room.
        Returns the list of valid doc_ids (those that exist in the room).
        Raises ValueError if any doc_id does not belong to this room.
        """
        if not doc_ids:
            return []

        # Get all documents in the room
        room_docs = list_documents(room_code)
        valid_doc_ids = {d["doc_id"] for d in room_docs}

        invalid = [d for d in doc_ids if d not in valid_doc_ids]
        if invalid:
            raise ValueError(f"Document(s) {invalid} not found in room {room_code}")

        return doc_ids
