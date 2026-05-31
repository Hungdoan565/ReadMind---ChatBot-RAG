"""Unit tests for POST /api/ingest and related endpoints."""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from langchain_core.documents import Document

from app.main import app

client = TestClient(app)


def test_ingest_rejects_unsupported_file_type():
    """Upload a .jpg → 400 with 'not supported'."""
    response = client.post(
        "/api/ingest",
        files={"file": ("photo.jpg", b"fake image content", "image/jpeg")},
        data={"room_code": "TEST123"},
    )
    assert response.status_code == 400
    assert "not supported" in response.json()["detail"].lower()


def test_ingest_rejects_empty_room_code():
    """Upload with empty room_code → 400."""
    response = client.post(
        "/api/ingest",
        files={"file": ("test.pdf", b"fake pdf", "application/pdf")},
        data={"room_code": ""},
    )
    assert response.status_code == 400
    assert "room_code" in response.json()["detail"].lower()


@patch("app.api.routes.ingest.add_documents", return_value=5)
@patch("app.api.routes.ingest.chunk_documents")
@patch("app.api.routes.ingest.parse_pdf_bytes")
def test_ingest_pdf_success(mock_parse, mock_chunk, mock_add):
    """Successful PDF upload returns doc_id and chunk_count."""
    mock_parse.return_value = [Document(page_content="Test content", metadata={})]
    mock_chunk.return_value = [Document(page_content="chunk", metadata={})] * 5

    response = client.post(
        "/api/ingest",
        files={"file": ("test.pdf", b"fake pdf content", "application/pdf")},
        data={"room_code": "TEST123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["chunk_count"] == 5
    assert "doc_id" in data
    assert data["source"] == "test.pdf"


@patch("app.api.routes.ingest.delete_by_doc_id", return_value=5)
def test_delete_document_success(mock_delete):
    """DELETE /api/ingest/{doc_id} returns success with chunk count."""
    response = client.delete("/api/ingest/test-doc-id?room_code=TEST123")
    assert response.status_code == 200
    data = response.json()
    assert data["deleted_chunks"] == 5
    assert data["status"] == "success"


@patch("app.api.routes.ingest.delete_by_doc_id", return_value=0)
def test_delete_document_not_found(mock_delete):
    """DELETE non-existent doc → 404."""
    response = client.delete("/api/ingest/nonexistent?room_code=TEST123")
    assert response.status_code == 404
