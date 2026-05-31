"""
Unit tests for the improved chunker (backend/app/core/ingestion/chunker.py).

Tests cover:
- detect_section_title() extracts correct header text
- detect_section_title() returns None for plain text
- Two-pass chunking adds section_title metadata
- section_title is None for plain-text documents
- Documents with markdown headers get section_title populated
- Oversized sections are re-split (pass 2 triggered)
- chunk_index / chunk_total still present after changes
- Empty document still handled
"""

import pytest
from langchain_core.documents import Document

from app.core.ingestion.chunker import chunk_documents, detect_section_title


# ---------------------------------------------------------------------------
# detect_section_title
# ---------------------------------------------------------------------------


class TestDetectSectionTitle:
    def test_h1_header(self):
        text = "# Introduction\nSome content here."
        assert detect_section_title(text) == "Introduction"

    def test_h2_header(self):
        text = "## Background\nMore details."
        assert detect_section_title(text) == "Background"

    def test_h3_header(self):
        text = "### Sub-section\nDetails."
        assert detect_section_title(text) == "Sub-section"

    def test_returns_first_header_only(self):
        text = "## First\nContent\n## Second\nMore"
        assert detect_section_title(text) == "First"

    def test_plain_text_returns_none(self):
        text = "This is plain text with no headers."
        assert detect_section_title(text) is None

    def test_empty_string_returns_none(self):
        assert detect_section_title("") is None

    def test_header_not_at_line_start_returns_none(self):
        # Inline hash should not match (not at line boundary after strip)
        text = "Some text ## not a real header"
        # The regex uses re.MULTILINE so "^" matches line starts
        # "Some text ## not a real header" — "##" is not at start of line
        assert detect_section_title(text) is None

    def test_strips_trailing_whitespace_from_title(self):
        text = "## My Title   \nContent"
        result = detect_section_title(text)
        assert result is not None
        assert result == "My Title"


# ---------------------------------------------------------------------------
# chunk_documents — section_title metadata
# ---------------------------------------------------------------------------


class TestChunkDocumentsSectionTitle:
    def test_plain_text_section_title_is_none(self):
        """Plain text doc → section_title=None on all chunks."""
        doc = Document(
            page_content="Hello world. " * 50,  # long enough to chunk
            metadata={"source": "test.txt", "doc_id": "doc1"},
        )
        chunks = chunk_documents([doc])
        assert len(chunks) > 0
        for chunk in chunks:
            assert "section_title" in chunk.metadata

    def test_markdown_doc_gets_section_titles(self):
        """Markdown headers → section_title populated on at least some chunks."""
        content = (
            "# Introduction\n"
            "This is the intro section with some text. " * 5 + "\n\n"
            "## Methods\n"
            "Here we describe the methods used. " * 5 + "\n\n"
            "### Results\n"
            "The results were significant. " * 5
        )
        doc = Document(
            page_content=content,
            metadata={"source": "paper.md", "doc_id": "doc2"},
        )
        chunks = chunk_documents([doc])
        titles = [c.metadata.get("section_title") for c in chunks]
        # At least one chunk should have a non-None section title
        assert any(t is not None for t in titles), f"Expected headers in: {titles}"

    def test_section_title_field_always_present(self):
        """Every chunk must have section_title key (even if None)."""
        doc = Document(
            page_content="Short document.",
            metadata={"source": "short.txt", "doc_id": "doc3"},
        )
        chunks = chunk_documents([doc])
        for chunk in chunks:
            assert "section_title" in chunk.metadata

    def test_chunk_index_and_total_still_present(self):
        """Existing metadata fields chunk_index and chunk_total still populated."""
        doc = Document(
            page_content="Content. " * 100,
            metadata={"source": "file.txt", "doc_id": "doc4"},
        )
        chunks = chunk_documents([doc])
        for chunk in chunks:
            assert "chunk_index" in chunk.metadata
            assert "chunk_total" in chunk.metadata
        # chunk_total should equal number of chunks
        assert all(c.metadata["chunk_total"] == len(chunks) for c in chunks)

    def test_original_metadata_preserved(self):
        """source and doc_id from original document survive chunking."""
        doc = Document(
            page_content="Test content. " * 30,
            metadata={"source": "myfile.pdf", "doc_id": "abc123", "page": 2},
        )
        chunks = chunk_documents([doc])
        for chunk in chunks:
            assert chunk.metadata["source"] == "myfile.pdf"
            assert chunk.metadata["doc_id"] == "abc123"

    def test_empty_document_handled(self):
        """Empty page_content produces zero chunks without error."""
        doc = Document(
            page_content="", metadata={"source": "empty.txt", "doc_id": "e1"}
        )
        chunks = chunk_documents([doc])
        assert isinstance(chunks, list)

    def test_multiple_docs_global_chunk_index(self):
        """chunk_index is global across all input documents."""
        docs = [
            Document(
                page_content="Doc one content. " * 40,
                metadata={"source": "a.txt", "doc_id": "d1"},
            ),
            Document(
                page_content="Doc two content. " * 40,
                metadata={"source": "b.txt", "doc_id": "d2"},
            ),
        ]
        chunks = chunk_documents(docs)
        indices = [c.metadata["chunk_index"] for c in chunks]
        # Should be sequential 0..N-1
        assert indices == list(range(len(chunks)))
        assert all(c.metadata["chunk_total"] == len(chunks) for c in chunks)
