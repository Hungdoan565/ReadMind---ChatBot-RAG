"""
Unit tests for app.core.ingestion.chunker
"""

import pytest
from unittest.mock import patch
from langchain_core.documents import Document

from app.core.ingestion.chunker import chunk_documents


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_doc(text: str, metadata: dict = None) -> Document:
    return Document(page_content=text, metadata=metadata or {})


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_chunk_documents_basic():
    """A 2000-char document should split into multiple ~512-char chunks."""
    long_text = (
        "A" * 200
        + " "
        + "B" * 200
        + " "
        + "C" * 200
        + " "
        + "D" * 200
        + " "
        + "E" * 200
        + " "
        + "F" * 200
        + " "
        + "G" * 200
        + " "
        + "H" * 200
        + " "
        + "I" * 200
    )
    doc = make_doc(long_text)

    chunks = chunk_documents([doc])

    assert len(chunks) > 1, "Long document should produce multiple chunks"
    for chunk in chunks:
        assert len(chunk.page_content) <= 600, (
            f"Each chunk should be roughly <= 600 chars, got {len(chunk.page_content)}"
        )


def test_chunk_preserves_metadata():
    """Every chunk must carry the original metadata plus chunk_index/chunk_total."""
    text = "Lorem ipsum dolor sit amet. " * 100  # ~2800 chars
    meta = {"source": "test.pdf", "doc_id": "abc", "room_code": "ROOM1"}
    doc = make_doc(text, meta)

    chunks = chunk_documents([doc])

    assert len(chunks) > 1, "Should produce multiple chunks for this length"
    for chunk in chunks:
        assert chunk.metadata["source"] == "test.pdf"
        assert chunk.metadata["doc_id"] == "abc"
        assert chunk.metadata["room_code"] == "ROOM1"
        assert "chunk_index" in chunk.metadata
        assert "chunk_total" in chunk.metadata
        assert chunk.metadata["chunk_total"] == len(chunks)


def test_chunk_empty_document():
    """Empty page_content should return an empty list (graceful handling)."""
    doc = make_doc("", {"source": "empty.pdf"})

    chunks = chunk_documents([doc])

    assert chunks == [], f"Expected [] for empty doc, got {chunks}"


def test_chunk_short_document():
    """A document shorter than chunk_size should be returned as a single chunk."""
    short_text = "Hello world. This is a short document."
    doc = make_doc(short_text, {"source": "short.txt", "doc_id": "xyz"})

    chunks = chunk_documents([doc])

    assert len(chunks) == 1, (
        f"Short doc should produce exactly 1 chunk, got {len(chunks)}"
    )
    assert chunks[0].page_content == short_text
    assert chunks[0].metadata["source"] == "short.txt"
    assert chunks[0].metadata["doc_id"] == "xyz"
    assert chunks[0].metadata["chunk_index"] == 0
    assert chunks[0].metadata["chunk_total"] == 1
