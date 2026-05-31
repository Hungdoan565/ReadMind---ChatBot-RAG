"""
Unit tests for app.core.vectordb.store (list_documents, delete_by_doc_id).
All ChromaDB calls are mocked — no real vector store is used.
"""

import pytest
from unittest.mock import patch, MagicMock

from app.core.vectordb.store import list_documents, delete_by_doc_id


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_collection_mock(metadatas: list, ids: list = None):
    """Return a mock Chroma collection with preset get() return value."""
    collection = MagicMock()
    collection.get.return_value = {
        "metadatas": metadatas,
        "ids": ids or [str(i) for i in range(len(metadatas))],
    }
    return collection


def _make_vectorstore_mock(collection_mock):
    """Return a mock Chroma vectorstore whose ._collection is collection_mock."""
    vs = MagicMock()
    vs._collection = collection_mock
    return vs


# ---------------------------------------------------------------------------
# list_documents tests
# ---------------------------------------------------------------------------


@patch("app.core.vectordb.store.get_vectorstore")
def test_list_documents_empty_room(mock_get_vs):
    """list_documents should return [] when collection.get() returns empty."""
    collection = MagicMock()
    collection.get.return_value = {"metadatas": [], "ids": []}
    mock_get_vs.return_value = _make_vectorstore_mock(collection)

    result = list_documents("EMPTY_ROOM")

    assert result == []
    collection.get.assert_called_once_with(
        where={"room_code": "EMPTY_ROOM"}, include=["metadatas"]
    )


@patch("app.core.vectordb.store.get_vectorstore")
def test_list_documents_groups_by_doc_id(mock_get_vs):
    """list_documents groups chunks by doc_id and counts them."""
    metadatas = [
        {"doc_id": "doc-1", "source": "file_a.pdf", "room_code": "ROOM1"},
        {"doc_id": "doc-1", "source": "file_a.pdf", "room_code": "ROOM1"},
        {"doc_id": "doc-1", "source": "file_a.pdf", "room_code": "ROOM1"},
        {"doc_id": "doc-2", "source": "file_b.pdf", "room_code": "ROOM1"},
        {"doc_id": "doc-2", "source": "file_b.pdf", "room_code": "ROOM1"},
    ]
    collection = _make_collection_mock(metadatas)
    mock_get_vs.return_value = _make_vectorstore_mock(collection)

    result = list_documents("ROOM1")

    # Should have exactly 2 unique documents
    assert len(result) == 2

    result_by_id = {d["doc_id"]: d for d in result}
    assert result_by_id["doc-1"]["chunk_count"] == 3
    assert result_by_id["doc-1"]["source"] == "file_a.pdf"
    assert result_by_id["doc-2"]["chunk_count"] == 2
    assert result_by_id["doc-2"]["source"] == "file_b.pdf"


# ---------------------------------------------------------------------------
# list_documents — PGVector SQL path (no _collection attribute)
# ---------------------------------------------------------------------------


class _FakeRow:
    """Mimic a SQLAlchemy Row supporting attribute access."""

    def __init__(self, doc_id, source, chunk_count):
        self.doc_id = doc_id
        self.source = source
        self.chunk_count = chunk_count


def _make_sql_engine_mock(rows):
    """Return a mock engine whose connect() context yields a conn returning rows."""
    conn = MagicMock()
    conn.execute.return_value.fetchall.return_value = rows
    engine = MagicMock()
    engine.connect.return_value.__enter__.return_value = conn
    engine.connect.return_value.__exit__.return_value = False
    return engine, conn


@patch("app.core.vectordb.store._get_meta_engine")
@patch("app.core.vectordb.store.get_vectorstore")
def test_list_documents_pgvector_sql_path(mock_get_vs, mock_meta_engine):
    """When the store has no _collection (real pgvector), list_documents uses a
    metadata-only SQL query — NOT similarity_search (which would load the model).

    Validates the 502/empty-list bugfix: listing must not trigger vector search.
    """
    # A store WITHOUT a usable `_collection` forces the SQL branch.
    store = MagicMock()
    store._collection = None
    mock_get_vs.return_value = store

    rows = [
        _FakeRow("doc-1", "report.docx", 243),
        _FakeRow("doc-2", "notes.pdf", 12),
    ]
    engine, conn = _make_sql_engine_mock(rows)
    mock_meta_engine.return_value = engine

    result = list_documents("BFUW-M7JH")

    assert result == [
        {"doc_id": "doc-1", "source": "report.docx", "chunk_count": 243},
        {"doc_id": "doc-2", "source": "notes.pdf", "chunk_count": 12},
    ]
    # Must NOT have used vector similarity_search to list documents.
    store.similarity_search.assert_not_called()
    # The SQL query must filter by the requested room_code.
    _, params = conn.execute.call_args.args
    assert params["room_code"] == "BFUW-M7JH"


@patch("app.core.vectordb.store._get_meta_engine")
@patch("app.core.vectordb.store.get_vectorstore")
def test_list_documents_pgvector_sql_empty(mock_get_vs, mock_meta_engine):
    """SQL path returns [] for a room with no rows."""
    store = MagicMock()
    store._collection = None
    mock_get_vs.return_value = store

    engine, _ = _make_sql_engine_mock([])
    mock_meta_engine.return_value = engine

    assert list_documents("EMPTY") == []


# ---------------------------------------------------------------------------
# delete_by_doc_id tests
# ---------------------------------------------------------------------------


@patch("app.core.vectordb.store.get_vectorstore")
def test_delete_by_doc_id_success(mock_get_vs):
    """delete_by_doc_id should call collection.delete() with the returned IDs."""
    chunk_ids = ["id-1", "id-2", "id-3"]
    collection = MagicMock()
    collection.get.return_value = {
        "ids": chunk_ids,
        "metadatas": [{}] * 3,
    }
    mock_get_vs.return_value = _make_vectorstore_mock(collection)

    count = delete_by_doc_id("doc-abc", "ROOM1")

    assert count == 3
    collection.delete.assert_called_once_with(ids=chunk_ids)


@patch("app.core.vectordb.store.get_vectorstore")
def test_delete_by_doc_id_not_found(mock_get_vs):
    """delete_by_doc_id returns 0 when no chunks match."""
    collection = MagicMock()
    collection.get.return_value = {"ids": [], "metadatas": []}
    mock_get_vs.return_value = _make_vectorstore_mock(collection)

    count = delete_by_doc_id("nonexistent-doc", "ROOM1")

    assert count == 0
    collection.delete.assert_not_called()


# ---------------------------------------------------------------------------
# Bước 3 — Cô lập room_code trên mọi đường truy hồi (Bug 4) + smoke chữ ký
# ---------------------------------------------------------------------------

import inspect

from hypothesis import given, settings as hyp_settings, strategies as st
from langchain_core.documents import Document

import app.core.vectordb.store as store_mod
import app.core.vectordb.store_chroma as store_chroma_mod
from app.core.vectordb.store import get_hybrid_retriever, hybrid_search
from app.config import settings as app_settings


def _doc(content: str, room: str, doc_id: str) -> Document:
    """Build a Document carrying room_code/doc_id metadata."""
    return Document(
        page_content=content,
        metadata={"room_code": room, "doc_id": doc_id},
    )


# --- Task 5.1: reproduction (Bug 4) + smoke chữ ký hai backend ---------------


def test_get_hybrid_retriever_forwards_room_code_to_hybrid_search():
    """get_hybrid_retriever(room_code=R) must pass room_code=R into hybrid_search.

    On the buggy implementation room_code is dropped → this test is RED.
    """
    with patch.object(store_mod, "hybrid_search", return_value=[]) as mock_hybrid:
        retriever = get_hybrid_retriever(k=5, doc_ids=["d1"], room_code="ROOM_X")
        retriever.invoke("hello world")

    assert mock_hybrid.called
    assert mock_hybrid.call_args.kwargs.get("room_code") == "ROOM_X"


def test_get_hybrid_retriever_signature_matches_across_backends():
    """pgvector and Chroma get_hybrid_retriever expose an identical signature."""
    sig_pg = inspect.signature(store_mod.get_hybrid_retriever)
    sig_chroma = inspect.signature(store_chroma_mod.get_hybrid_retriever)

    assert list(sig_pg.parameters) == list(sig_chroma.parameters) == [
        "k",
        "doc_ids",
        "room_code",
    ]


# --- Task 5.5 / Task 5.6: property tests ------------------------------------


class _FilteringStore:
    """Fake vectorstore honoring the metadata filter built by similarity_search.

    Supports {"$and": [...]} wrapping and {field: {"$eq": v}} / {field: {"$in": [...]}}
    leaf conditions, returning at most k matching documents.
    """

    def __init__(self, corpus):
        self._corpus = corpus

    @staticmethod
    def _matches(doc, flt):
        if not flt:
            return True
        conditions = flt["$and"] if "$and" in flt else [flt]
        for cond in conditions:
            field, expr = next(iter(cond.items()))
            value = doc.metadata.get(field)
            if "$eq" in expr:
                if value != expr["$eq"]:
                    return False
            elif "$in" in expr:
                if value not in expr["$in"]:
                    return False
        return True

    def similarity_search(self, query, k=10, filter=None):  # noqa: A002
        matched = [d for d in self._corpus if self._matches(d, filter)]
        return matched[:k]


_ROOM_CODES = ["ROOM_A", "ROOM_B", "ROOM_C", "ROOM_D"]


@hyp_settings(max_examples=100, deadline=None)
@given(
    rooms=st.lists(st.sampled_from(_ROOM_CODES), min_size=1, max_size=30),
    target_idx=st.integers(min_value=0, max_value=len(_ROOM_CODES) - 1),
)
def test_property_room_code_isolation(rooms, target_idx):
    # Feature: rag-quality-upgrade, Property 5: Cô lập room_code — mọi tài liệu
    # trả về từ đường truy hồi có metadata["room_code"] bằng R.
    target_room = _ROOM_CODES[target_idx]
    corpus = [
        _doc(f"chunk-{i}-{room}", room=room, doc_id=f"doc-{i}")
        for i, room in enumerate(rooms)
    ]

    # Mock reranker to keep the property test fast/deterministic (no flashrank
    # model download or real cross-encoder run) — isolation is a store concern,
    # independent of the reranker.
    def _identity_rerank(query, docs, top_n=None):
        return docs[:top_n] if top_n else docs

    with patch.object(store_mod, "get_vectorstore", return_value=_FilteringStore(corpus)), \
        patch("app.core.reranker.rerank_documents", side_effect=_identity_rerank):
        results = hybrid_search("query", k=app_settings.RETRIEVAL_TOP_K, room_code=target_room)

    assert all(d.metadata["room_code"] == target_room for d in results)


@hyp_settings(max_examples=100)
@given(room_code=st.text(alphabet=st.characters(min_codepoint=33, max_codepoint=122), min_size=1, max_size=20))
def test_property_retriever_forwards_room_code(room_code):
    # Feature: rag-quality-upgrade, Property 6: Retriever truyền room_code xuống
    # hybrid_search — get_hybrid_retriever(room_code=R) gọi hybrid_search(room_code=R).
    with patch.object(store_mod, "hybrid_search", return_value=[]) as mock_hybrid:
        retriever = get_hybrid_retriever(room_code=room_code)
        retriever.invoke("any question")

    assert mock_hybrid.called
    assert mock_hybrid.call_args.kwargs.get("room_code") == room_code
