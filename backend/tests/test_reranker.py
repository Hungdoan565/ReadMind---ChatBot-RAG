"""
Unit tests for backend/app/core/reranker.py

Tests cover:
- rerank_documents() with a working FlashRank mock
- Graceful fallback when flashrank is not installed (ImportError)
- Graceful fallback when Ranker.rerank() raises
- Empty input passthrough
- top_n truncation
- Metadata preservation after reranking
"""

from unittest.mock import MagicMock, patch

from langchain_core.documents import Document


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_docs(n: int) -> list[Document]:
    return [
        Document(
            page_content=f"chunk {i}",
            metadata={"source": f"file_{i}.pdf", "doc_id": f"doc{i}", "page": i},
        )
        for i in range(n)
    ]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestRerankDocuments:
    def _fresh_reranker_module(self):
        """Re-import reranker with reset singleton state each test."""
        import importlib
        import app.core.reranker as mod

        # Reset module-level singletons so each test starts clean
        mod._ranker = None
        mod._ranker_init_failed = False
        importlib.reload(mod)
        return mod

    def test_returns_empty_list_unchanged(self):
        """Empty docs → returns empty list immediately (no ranker call)."""
        import app.core.reranker as mod

        mod._ranker = None
        mod._ranker_init_failed = False

        result = mod.rerank_documents("query", [], top_n=4)
        assert result == []

    def test_rerank_orders_by_score(self):
        """Reranker result ordering is respected."""
        docs = _make_docs(3)

        mock_ranker = MagicMock()
        # Return scores: doc2 best, doc0 second, doc1 worst
        mock_ranker.rerank.return_value = [
            {"id": 2, "score": 0.9},
            {"id": 0, "score": 0.7},
            {"id": 1, "score": 0.2},
        ]

        import app.core.reranker as mod

        mod._ranker = None
        mod._ranker_init_failed = False

        with patch.object(mod, "_get_ranker", return_value=mock_ranker):
            result = mod.rerank_documents("query", docs, top_n=3)

        assert len(result) == 3
        assert result[0].page_content == "chunk 2"
        assert result[1].page_content == "chunk 0"
        assert result[2].page_content == "chunk 1"

    def test_top_n_truncates_results(self):
        """top_n limits how many docs are returned."""
        docs = _make_docs(5)

        mock_ranker = MagicMock()
        mock_ranker.rerank.return_value = [
            {"id": i, "score": 1.0 - i * 0.1} for i in range(5)
        ]

        import app.core.reranker as mod

        mod._ranker = None
        mod._ranker_init_failed = False

        with patch.object(mod, "_get_ranker", return_value=mock_ranker):
            result = mod.rerank_documents("query", docs, top_n=2)

        assert len(result) == 2

    def test_metadata_preserved_after_rerank(self):
        """Original Document metadata is preserved after reranking."""
        docs = _make_docs(2)

        mock_ranker = MagicMock()
        mock_ranker.rerank.return_value = [
            {"id": 1, "score": 0.95},
            {"id": 0, "score": 0.80},
        ]

        import app.core.reranker as mod

        mod._ranker = None
        mod._ranker_init_failed = False

        with patch.object(mod, "_get_ranker", return_value=mock_ranker):
            result = mod.rerank_documents("query", docs, top_n=2)

        assert result[0].metadata["source"] == "file_1.pdf"
        assert result[0].metadata["doc_id"] == "doc1"
        assert result[1].metadata["source"] == "file_0.pdf"

    def test_fallback_when_flashrank_not_installed(self):
        """If flashrank ImportError, returns original docs in original order."""
        docs = _make_docs(3)

        import app.core.reranker as mod

        mod._ranker = None
        mod._ranker_init_failed = False

        # _get_ranker returns None → fallback path
        with patch.object(mod, "_get_ranker", return_value=None):
            result = mod.rerank_documents("query", docs, top_n=2)

        # top_n=2 slice is still applied even in fallback
        assert len(result) == 2
        assert result[0].page_content == "chunk 0"
        assert result[1].page_content == "chunk 1"

    def test_fallback_when_ranker_raises(self):
        """If ranker.rerank() raises, fall back gracefully."""
        docs = _make_docs(3)

        mock_ranker = MagicMock()
        mock_ranker.rerank.side_effect = RuntimeError("ONNX model failure")

        import app.core.reranker as mod

        mod._ranker = None
        mod._ranker_init_failed = False

        with patch.object(mod, "_get_ranker", return_value=mock_ranker):
            result = mod.rerank_documents("query", docs, top_n=None)

        # Falls back to full unranked list
        assert len(result) == 3
        assert result[0].page_content == "chunk 0"

    def test_no_top_n_returns_all(self):
        """top_n=None returns all reranked docs."""
        docs = _make_docs(4)

        mock_ranker = MagicMock()
        mock_ranker.rerank.return_value = [
            {"id": i, "score": 1.0 - i * 0.1} for i in range(4)
        ]

        import app.core.reranker as mod

        mod._ranker = None
        mod._ranker_init_failed = False

        with patch.object(mod, "_get_ranker", return_value=mock_ranker):
            result = mod.rerank_documents("query", docs, top_n=None)

        assert len(result) == 4


# ---------------------------------------------------------------------------
# Bước 3 — hybrid_search: rerank trên tập đã fuse (Bug 5) + bất biến số lượng
# ---------------------------------------------------------------------------

from typing import List, Optional

from hypothesis import given, settings as hyp_settings, strategies as st

import app.core.vectordb.store as store_mod
from app.config import settings as app_settings


def _room_docs(n: int, room: str = "ROOM1", doc_id: str = "doc") -> List[Document]:
    """Build n distinct Documents in a single room (unique page_content)."""
    return [
        Document(
            page_content=f"{room} chunk {i}",
            metadata={"room_code": room, "doc_id": f"{doc_id}{i}", "page": i},
        )
        for i in range(n)
    ]


class _FakeStore:
    """Minimal vectorstore double exposing similarity_search with filtering.

    Honors the same metadata filter shape that store.similarity_search builds
    ({"room_code": {"$eq": R}} / {"doc_id": {"$in": [...]}} possibly wrapped in
    a top-level "$and"). Returns at most k documents.
    """

    def __init__(self, corpus: List[Document]) -> None:
        self._corpus = corpus

    @staticmethod
    def _matches(doc: Document, flt: Optional[dict]) -> bool:
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

    def similarity_search(self, query: str, k: int = 10, filter: Optional[dict] = None):  # noqa: A002
        matched = [d for d in self._corpus if self._matches(d, filter)]
        return matched[:k]


# --- Task 5.2: reproduction (Bug 5) -----------------------------------------


def test_reranker_sees_fused_set_not_truncated_top_k():
    """rerank_documents must receive the full fused candidate set (≤ fetch_k),
    NOT a list already cut to top_k.

    On the buggy implementation the RRF list is sliced to top_k before rerank,
    so the captured size would be top_k (10) → this test is RED pre-fix.
    """
    top_k = app_settings.RETRIEVAL_TOP_K  # 10
    fetch_k = top_k * 3  # 30
    corpus = _room_docs(fetch_k, room="ROOM1")

    captured: dict = {}

    def _capture(query, docs, top_n=None):
        captured["size"] = len(docs)
        return docs[:top_n] if top_n else docs

    with patch.object(store_mod, "get_vectorstore", return_value=_FakeStore(corpus)), \
        patch("app.core.reranker.rerank_documents", side_effect=_capture):
        store_mod.hybrid_search("query", k=top_k, room_code="ROOM1")

    # Reranker must see the fused set (all 30 distinct candidates), not 10.
    assert captured["size"] == fetch_k
    assert captured["size"] > top_k


# --- Task 5.7–5.10: property tests cho hybrid_search fuse→rerank→cắt --------


def _run_hybrid(corpus, k, rerank_side_effect=None, ranker=None):
    """Chạy store_mod.hybrid_search với store giả + reranker được kiểm soát.

    - rerank_side_effect: nếu cung cấp, patch app.core.reranker.rerank_documents
      bằng hàm này (để bắt đối số / mô phỏng lỗi).
    - ranker: nếu rerank_side_effect là None, patch _get_ranker trả về `ranker`
      (None → đường fallback "reranker không khả dụng").
    """
    from contextlib import ExitStack

    with ExitStack() as stack:
        stack.enter_context(
            patch.object(store_mod, "get_vectorstore", return_value=_FakeStore(corpus))
        )
        if rerank_side_effect is not None:
            stack.enter_context(
                patch("app.core.reranker.rerank_documents", side_effect=rerank_side_effect)
            )
        else:
            stack.enter_context(patch("app.core.reranker._get_ranker", return_value=ranker))
        return store_mod.hybrid_search("query", k=k, room_code="ROOM1")


@hyp_settings(max_examples=100, deadline=None)
@given(n=st.integers(min_value=1, max_value=60), k=st.integers(min_value=1, max_value=15))
def test_property_reranker_sees_fused_set(n, k):
    # Feature: rag-quality-upgrade, Property 7: Reranker thấy tập ứng viên đã
    # fuse (chưa cắt còn top_k) — tập vào reranker = tập đã fuse (≤ fetch_k);
    # khi N > top_k thì kích thước vào reranker > top_k.
    corpus = _room_docs(n, room="ROOM1")
    captured: dict = {}

    def _capture(query, docs, top_n=None):
        captured["size"] = len(docs)
        return docs[:top_n] if top_n else docs

    _run_hybrid(corpus, k=k, rerank_side_effect=_capture)

    fetch_k = k * 3
    expected_fused = min(n, fetch_k)  # similarity_search trả tối đa fetch_k
    assert captured["size"] == expected_fused
    if n > k:
        # Reranker phải thấy nhiều hơn top_k (việc cắt diễn ra SAU rerank).
        assert captured["size"] > k


@hyp_settings(max_examples=100, deadline=None)
@given(n=st.integers(min_value=0, max_value=60), k=st.integers(min_value=1, max_value=15))
def test_property_result_not_exceed_final_n(n, k):
    # Feature: rag-quality-upgrade, Property 8: Kết quả không vượt quá
    # final_n = min(RERANK_TOP_N, k).
    corpus = _room_docs(n, room="ROOM1")

    def _identity(query, docs, top_n=None):
        return docs[:top_n] if top_n else docs

    result = _run_hybrid(corpus, k=k, rerank_side_effect=_identity)

    final_n = min(app_settings.RERANK_TOP_N, k)
    assert len(result) <= final_n


@hyp_settings(max_examples=100, deadline=None)
@given(n=st.integers(min_value=2, max_value=40), k=st.integers(min_value=1, max_value=15))
def test_property_rerank_returns_ranked_prefix_subset(n, k):
    # Feature: rag-quality-upgrade, Property 9: Rerank trả tiền tố theo thứ hạng
    # — kết quả là final_n tài liệu top theo thứ tự reranker (tiền tố của danh
    # sách đã rerank) và là tập con của tập đã fuse.
    corpus = _room_docs(n, room="ROOM1")
    captured: dict = {}

    def _reverse_rerank(query, docs, top_n=None):
        # Reranker xác định: đảo thứ tự fused rồi cắt top_n.
        captured["fused"] = list(docs)
        ranked = list(reversed(docs))
        return ranked[:top_n] if top_n else ranked

    result = _run_hybrid(corpus, k=k, rerank_side_effect=_reverse_rerank)

    fused = captured["fused"]
    final_n = min(app_settings.RERANK_TOP_N, k)
    expected_prefix = list(reversed(fused))[:final_n]
    # Kết quả đúng là tiền tố của danh sách đã rerank...
    assert [d.page_content for d in result] == [d.page_content for d in expected_prefix]
    # ...và là tập con của tập đã fuse.
    fused_contents = {d.page_content for d in fused}
    assert all(d.page_content in fused_contents for d in result)


@hyp_settings(max_examples=100, deadline=None)
@given(n=st.integers(min_value=1, max_value=40), k=st.integers(min_value=1, max_value=15))
def test_property_fallback_when_reranker_unavailable(n, k):
    # Feature: rag-quality-upgrade, Property 10: Fallback an toàn khi reranker
    # bất khả dụng — reranker None → trả fused[:final_n], không ném lỗi.
    corpus = _room_docs(n, room="ROOM1")

    # ranker=None → rerank_documents đi đường "không khả dụng" và trả fused[:final_n].
    result = _run_hybrid(corpus, k=k, ranker=None)

    final_n = min(app_settings.RERANK_TOP_N, k)
    fetch_k = k * 3
    expected_len = min(n, fetch_k, final_n)
    assert len(result) == expected_len
    # Không ném lỗi và mọi kết quả thuộc room đúng.
    assert all(d.metadata["room_code"] == "ROOM1" for d in result)


@hyp_settings(max_examples=100, deadline=None)
@given(n=st.integers(min_value=1, max_value=40), k=st.integers(min_value=1, max_value=15))
def test_property_fallback_when_rerank_raises(n, k):
    # Feature: rag-quality-upgrade, Property 10: Fallback an toàn khi rerank ném
    # lỗi — hybrid_search bắt lỗi, trả fused[:final_n], không ném ra ngoài.
    corpus = _room_docs(n, room="ROOM1")

    def _boom(query, docs, top_n=None):
        raise RuntimeError("rerank backend exploded")

    # Không được raise ra ngoài hybrid_search.
    result = _run_hybrid(corpus, k=k, rerank_side_effect=_boom)

    final_n = min(app_settings.RERANK_TOP_N, k)
    fetch_k = k * 3
    expected_len = min(n, fetch_k, final_n)
    assert len(result) == expected_len
