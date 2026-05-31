"""Unit + property tests for POST /api/chat (SSE streaming endpoint).

Covers the Bug 3 fix (single retrieval + sources consistent with context) and
Correctness Properties 1–4 from the rag-quality-upgrade design:

- Property 1: one retrieval ⇒ at most one rerank (Requirements 3.1, 3.3)
- Property 2: sources are built from the SAME retrieved docs (Requirements 3.2, 4.1, 4.2)
- Property 3: sources respect the doc_ids filter (Requirement 4.3)
- Property 4: empty room performs no retrieval, empty sources (Requirements 5.2, 5.3)

All external dependencies (list_documents, hybrid_search/retrieve_docs, the
answer/direct chains, contextualize_question, doc_id validation) are mocked, so
no network / LLM / Postgres / Redis access happens.
"""

import json
from typing import List, Optional

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from langchain_core.documents import Document
from hypothesis import given, settings, strategies as st

from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True, scope="module")
def _disable_rate_limit():
    """Disable the chat rate limiter so property tests can fire many requests.

    Module-scoped to avoid Hypothesis' function-scoped-fixture health check.
    """
    from app.api.routes import chat as chat_route

    previous = chat_route.limiter.enabled
    chat_route.limiter.enabled = False
    try:
        yield
    finally:
        chat_route.limiter.enabled = previous


def parse_sse_events(response_text: str) -> list:
    """Parse SSE response text into a list of event dicts."""
    events = []
    for part in response_text.split("\n\n"):
        part = part.strip()
        if not part:
            continue
        for line in part.split("\n"):
            if line.startswith("data: "):
                try:
                    events.append(json.loads(line[6:]))
                except json.JSONDecodeError:
                    pass
    return events


def _end_event(events: list) -> dict:
    return next(e for e in events if e["event"] == "end")


def _make_answer_chain() -> MagicMock:
    """A mock answer/direct chain whose .stream yields a fresh iterator each call."""
    chain = MagicMock()
    chain.stream.side_effect = lambda *a, **k: iter(["Hello", " ", "world"])
    return chain


# Hypothesis strategies ------------------------------------------------------

# ASCII-printable text keeps JSON round-trips deterministic (no lone surrogates).
_printable = st.text(
    alphabet=st.characters(min_codepoint=32, max_codepoint=126), max_size=300
)
# Questions must be non-blank (the endpoint rejects empty/whitespace with 400),
# so generate from printable chars excluding space (codepoint 32) with min_size=1.
_question = st.text(
    alphabet=st.characters(min_codepoint=33, max_codepoint=126),
    min_size=1,
    max_size=300,
)
_source_text = st.text(
    alphabet=st.characters(min_codepoint=97, max_codepoint=122), min_size=1, max_size=15
)
_page = st.one_of(st.none(), st.integers(min_value=0, max_value=999))


def _document(content: str, source: str, page: Optional[int]) -> Document:
    return Document(page_content=content, metadata={"source": source, "page": page})


_doc_strategy = st.builds(_document, _printable, _source_text, _page)
_docs_list = st.lists(_doc_strategy, min_size=0, max_size=8)

# Pool of doc_ids for the doc_ids-filter property.
_DOC_ID_POOL = ["doc1", "doc2", "doc3", "doc4", "doc5"]


def _document_with_id(
    content: str, source: str, page: Optional[int], doc_id: str
) -> Document:
    return Document(
        page_content=content,
        metadata={"source": source, "page": page, "doc_id": doc_id},
    )


_doc_with_id_strategy = st.builds(
    _document_with_id, _printable, _source_text, _page, st.sampled_from(_DOC_ID_POOL)
)
_corpus_strategy = st.lists(_doc_with_id_strategy, min_size=0, max_size=10)


def _assert_source_matches_doc(source: dict, doc: Document) -> None:
    assert source["source"] == doc.metadata.get("source", "unknown")
    assert source["page"] == doc.metadata.get("page")
    assert source["content_preview"] == doc.page_content[:200]


# ---------------------------------------------------------------------------
# Input validation (Requirement 5.4)
# ---------------------------------------------------------------------------


def test_chat_requires_room_code():
    """POST /api/chat with empty room_code → 400."""
    response = client.post("/api/chat", json={"question": "Hi", "room_code": ""})
    assert response.status_code == 400


def test_chat_requires_question():
    """POST /api/chat with empty question → 400."""
    response = client.post("/api/chat", json={"question": "  ", "room_code": "TEST"})
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# TASK 7.1 — Bug 3 reproduction (now a regression guard)
# ---------------------------------------------------------------------------


@patch("app.api.routes.chat.get_rag_answer_chain")
@patch("app.api.routes.chat.contextualize_question")
@patch("app.core.rag.chain.hybrid_search")
@patch("app.api.routes.chat.list_documents")
def test_chat_retrieves_once_and_sources_match_docs(
    mock_list, mock_hybrid, mock_ctx, mock_answer
):
    """Bug 3: the chat flow must retrieve exactly once and build `sources` from
    those same docs (the old flow retrieved twice — in the chain and again via
    retrieve_source_docs — which made this assertion fail)."""
    mock_list.return_value = [{"doc_id": "d1", "source": "file.pdf", "chunk_count": 3}]
    mock_ctx.side_effect = lambda question, session_id: question

    retrieved = [
        _document("Some source content for testing", "file.pdf", 1),
        _document("Second chunk content", "file.pdf", 2),
    ]
    mock_hybrid.return_value = retrieved
    mock_answer.return_value = _make_answer_chain()

    response = client.post(
        "/api/chat", json={"question": "What is this?", "room_code": "TESTROOM"}
    )
    assert response.status_code == 200

    # Retrieval happened EXACTLY once (real retrieve_docs → hybrid_search).
    assert mock_hybrid.call_count == 1

    events = parse_sse_events(response.text)
    end_event = _end_event(events)
    sources = end_event["sources"]

    # sources are built from the SAME docs, same order, same size.
    assert len(sources) == len(retrieved)
    for source, doc in zip(sources, retrieved):
        _assert_source_matches_doc(source, doc)


# ---------------------------------------------------------------------------
# TASK 7.4 — Property 1
# ---------------------------------------------------------------------------


# Feature: rag-quality-upgrade, Property 1: Truy hồi đúng một lần kéo theo rerank đúng một lần
@given(question=_question, docs=_docs_list)
@settings(max_examples=100, deadline=None)
@patch("app.core.reranker.rerank_documents")
@patch("app.api.routes.chat.get_rag_answer_chain")
@patch("app.api.routes.chat.contextualize_question")
@patch("app.core.rag.chain.hybrid_search")
@patch("app.api.routes.chat.list_documents")
def test_property_one_retrieve_implies_one_rerank(
    mock_list, mock_hybrid, mock_ctx, mock_answer, mock_rerank, question, docs
):
    """With a room that has documents, hybrid_search is called exactly once and
    rerank is called at most once. Validates Requirements 3.1, 3.3."""
    mock_list.reset_mock()
    mock_hybrid.reset_mock()
    mock_rerank.reset_mock()

    mock_list.return_value = [{"doc_id": "d1", "source": "f.pdf", "chunk_count": 1}]
    mock_ctx.side_effect = lambda q, session_id: q
    mock_rerank.side_effect = lambda q, candidates, top_n=None: candidates[:top_n]

    def fake_hybrid(query, doc_ids=None, room_code=None):
        # Simulate hybrid_search's single internal rerank step.
        mock_rerank(query, docs, top_n=4)
        return docs

    mock_hybrid.side_effect = fake_hybrid
    mock_answer.return_value = _make_answer_chain()

    response = client.post(
        "/api/chat", json={"question": question, "room_code": "ROOM"}
    )
    assert response.status_code == 200

    assert mock_hybrid.call_count == 1
    assert mock_rerank.call_count <= 1


# ---------------------------------------------------------------------------
# TASK 7.5 — Property 2
# ---------------------------------------------------------------------------


# Feature: rag-quality-upgrade, Property 2: sources đồng nhất với context (cùng tập, kích thước, thứ tự)
@given(question=_question, docs=_docs_list)
@settings(max_examples=100, deadline=None)
@patch("app.core.rag.chain.hybrid_search")
@patch("app.api.routes.chat.get_rag_answer_chain")
@patch("app.api.routes.chat.contextualize_question")
@patch("app.api.routes.chat.retrieve_docs")
@patch("app.api.routes.chat.list_documents")
def test_property_sources_match_context(
    mock_list, mock_retrieve, mock_ctx, mock_answer, mock_hybrid, question, docs
):
    """`sources` are built from the very docs returned by the single retrieval:
    same set, same size, same order — and hybrid_search is NOT called again.
    Validates Requirements 3.2, 4.1, 4.2."""
    mock_hybrid.reset_mock()

    mock_list.return_value = [{"doc_id": "d1", "source": "f.pdf", "chunk_count": 1}]
    mock_ctx.side_effect = lambda q, session_id: q
    mock_retrieve.return_value = docs
    mock_answer.return_value = _make_answer_chain()

    response = client.post(
        "/api/chat", json={"question": question, "room_code": "ROOM"}
    )
    assert response.status_code == 200

    # Building sources must not trigger a second retrieval.
    assert mock_hybrid.call_count == 0

    sources = _end_event(parse_sse_events(response.text))["sources"]
    assert len(sources) == len(docs)
    for source, doc in zip(sources, docs):
        _assert_source_matches_doc(source, doc)


# ---------------------------------------------------------------------------
# TASK 7.6 — Property 3
# ---------------------------------------------------------------------------


# Feature: rag-quality-upgrade, Property 3: sources tôn trọng bộ lọc doc_ids
@given(
    question=_question,
    active_ids=st.lists(
        st.sampled_from(_DOC_ID_POOL), min_size=1, max_size=5, unique=True
    ),
    corpus=_corpus_strategy,
)
@settings(max_examples=100, deadline=None)
@patch("app.api.routes.chat.get_rag_answer_chain")
@patch("app.api.routes.chat.contextualize_question")
@patch("app.api.routes.chat.retrieve_docs")
@patch("app.api.routes.chat.validate_doc_ids_in_room")
@patch("app.api.routes.chat.list_documents")
def test_property_sources_respect_doc_ids(
    mock_list,
    mock_validate,
    mock_retrieve,
    mock_ctx,
    mock_answer,
    question,
    active_ids,
    corpus,
):
    """When a request specifies doc_ids, every source maps back to a document
    whose metadata['doc_id'] belongs to doc_ids. Validates Requirement 4.3."""
    mock_list.return_value = [{"doc_id": "d1", "source": "f.pdf", "chunk_count": 1}]
    mock_validate.side_effect = lambda doc_ids, room_code: doc_ids
    mock_ctx.side_effect = lambda q, session_id: q

    def fake_retrieve(q, doc_ids=None, room_code=None):
        allowed = set(doc_ids or [])
        return [d for d in corpus if d.metadata["doc_id"] in allowed]

    mock_retrieve.side_effect = fake_retrieve
    mock_answer.return_value = _make_answer_chain()

    response = client.post(
        "/api/chat",
        json={
            "question": question,
            "room_code": "ROOM",
            "active_doc_ids": active_ids,
        },
    )
    assert response.status_code == 200

    expected = [d for d in corpus if d.metadata["doc_id"] in set(active_ids)]
    # Every backing doc respects the doc_ids filter ...
    assert all(d.metadata["doc_id"] in set(active_ids) for d in expected)

    sources = _end_event(parse_sse_events(response.text))["sources"]
    # ... and sources correspond 1:1 (same size, same order) to those docs.
    assert len(sources) == len(expected)
    for source, doc in zip(sources, expected):
        _assert_source_matches_doc(source, doc)


# ---------------------------------------------------------------------------
# TASK 7.7 — Property 4
# ---------------------------------------------------------------------------


# Feature: rag-quality-upgrade, Property 4: Room trống không truy hồi, sources rỗng
@given(question=_question)
@settings(max_examples=100, deadline=None)
@patch("app.core.rag.chain.hybrid_search")
@patch("app.api.routes.chat.get_direct_chain")
@patch("app.api.routes.chat.list_documents")
def test_property_empty_room_no_retrieval(
    mock_list, mock_direct, mock_hybrid, question
):
    """An empty room never retrieves and returns empty sources.
    Validates Requirements 5.2, 5.3."""
    mock_hybrid.reset_mock()

    mock_list.return_value = []  # empty room
    mock_direct.return_value = _make_answer_chain()

    response = client.post(
        "/api/chat", json={"question": question, "room_code": "EMPTY"}
    )
    assert response.status_code == 200

    assert mock_hybrid.call_count == 0
    sources = _end_event(parse_sse_events(response.text))["sources"]
    assert sources == []


# ---------------------------------------------------------------------------
# TASK 7.8 — Routing + validation unit tests
# ---------------------------------------------------------------------------


@patch("app.api.routes.chat.get_rag_answer_chain")
@patch("app.api.routes.chat.contextualize_question")
@patch("app.api.routes.chat.retrieve_docs")
@patch("app.api.routes.chat.list_documents")
def test_chat_routing_room_with_docs_uses_rag_with_sources(
    mock_list, mock_retrieve, mock_ctx, mock_answer
):
    """Room with documents → RAG chain with non-empty sources (Requirement 5.1)."""
    mock_list.return_value = [{"doc_id": "d1", "source": "file.pdf", "chunk_count": 3}]
    mock_ctx.side_effect = lambda question, session_id: question
    mock_retrieve.return_value = [
        _document("Content from the uploaded document", "file.pdf", 1)
    ]
    mock_answer.return_value = _make_answer_chain()

    response = client.post(
        "/api/chat", json={"question": "What is this?", "room_code": "TESTROOM"}
    )
    assert response.status_code == 200

    events = parse_sse_events(response.text)
    event_types = [e["event"] for e in events]
    assert "start" in event_types
    assert "token" in event_types
    assert "end" in event_types

    start_event = next(e for e in events if e["event"] == "start")
    assert "session_id" in start_event

    tokens = [e["data"] for e in events if e["event"] == "token"]
    assert "Hello" in tokens

    end_event = _end_event(events)
    assert len(end_event["sources"]) == 1
    assert end_event["sources"][0]["source"] == "file.pdf"
    mock_answer.return_value.stream.assert_called_once()


@patch("app.api.routes.chat.get_direct_chain")
@patch("app.api.routes.chat.list_documents")
def test_chat_routing_empty_room_uses_direct_no_sources(mock_list, mock_direct):
    """Empty room → direct chain with empty sources (Requirements 5.2, 5.3)."""
    mock_list.return_value = []
    mock_direct.return_value = _make_answer_chain()

    response = client.post(
        "/api/chat", json={"question": "Hello", "room_code": "EMPTYROOM"}
    )
    assert response.status_code == 200

    events = parse_sse_events(response.text)
    event_types = [e["event"] for e in events]
    assert "start" in event_types
    assert "token" in event_types
    assert "end" in event_types

    end_event = _end_event(events)
    assert end_event["sources"] == []


@patch("app.api.routes.chat.get_direct_chain")
@patch("app.api.routes.chat.retrieve_docs")
@patch("app.api.routes.chat.list_documents")
def test_chat_routing_explicit_no_docs_uses_direct(
    mock_list, mock_retrieve, mock_direct
):
    """Room HAS documents but client selects zero (active_doc_ids=[]) → direct
    chain, no retrieval, empty sources.

    This guards the "bỏ chọn hết = trả lời như AI thường" behavior: deselecting
    every document must NOT fall back to reading all documents in the room.
    """
    mock_list.return_value = [{"doc_id": "d1", "source": "file.pdf", "chunk_count": 3}]
    mock_direct.return_value = _make_answer_chain()

    response = client.post(
        "/api/chat",
        json={
            "question": "Xin chào",
            "room_code": "TESTROOM",
            "active_doc_ids": [],
        },
    )
    assert response.status_code == 200

    events = parse_sse_events(response.text)
    end_event = _end_event(events)

    # Direct chain was used; RAG retrieval never happened; no sources.
    mock_direct.return_value.stream.assert_called_once()
    mock_retrieve.assert_not_called()
    assert end_event["sources"] == []
    """Missing room_code field → 400 (Requirement 5.4)."""
    response = client.post("/api/chat", json={"question": "Hi"})
    # Pydantic rejects the missing required field (422) before our 400 check.
    assert response.status_code in (400, 422)


def test_chat_empty_room_code_returns_400():
    """Empty/whitespace room_code → 400 (Requirement 5.4)."""
    response = client.post("/api/chat", json={"question": "Hi", "room_code": "   "})
    assert response.status_code == 400


def test_chat_empty_question_returns_400():
    """Empty question → 400 (Requirement 5.4)."""
    response = client.post("/api/chat", json={"question": "", "room_code": "TEST"})
    assert response.status_code == 400
