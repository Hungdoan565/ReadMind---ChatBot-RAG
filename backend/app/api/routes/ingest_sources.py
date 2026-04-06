"""
Additional ingest endpoints for external sources:
  POST /api/ingest/notion        — single Notion page
  POST /api/ingest/notion/db     — all pages in a Notion database
  POST /api/ingest/url           — single web URL
  POST /api/ingest/urls          — batch of web URLs
"""

import logging
import uuid

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.models.schemas import (
    IngestResponse,
    NotionIngestRequest,
    NotionDatabaseIngestRequest,
    UrlIngestRequest,
    UrlBatchIngestRequest,
)
from app.core.ingestion.notion import fetch_notion_page, fetch_notion_database
from app.core.ingestion.web import fetch_url, fetch_urls
from app.core.ingestion.chunker import chunk_documents
from app.core.vectordb.store import add_documents

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Notion
# ---------------------------------------------------------------------------


@router.post("/ingest/notion", response_model=IngestResponse)
async def ingest_notion_page(request: NotionIngestRequest):
    """
    Ingest a single Notion page by ID or URL.
    Requires NOTION_TOKEN in .env or passed in the request body.
    room_code is required for document scoping.
    """
    token = request.token or settings.NOTION_TOKEN
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Notion token required. Set NOTION_TOKEN in .env or pass 'token' in request body.",
        )

    doc_id = str(uuid.uuid4())
    try:
        raw_docs = fetch_notion_page(request.page_id, token=token, doc_id=doc_id, room_code=request.room_code)
        if not raw_docs:
            raise HTTPException(
                status_code=422,
                detail="No text content found in the Notion page.",
            )

        chunks = chunk_documents(raw_docs)
        stored = add_documents(chunks)

        source = raw_docs[0].metadata.get("source", request.page_id)
        return IngestResponse(
            doc_id=doc_id,
            source=source,
            chunk_count=stored,
            status="success",
            message=f"Ingested Notion page into {stored} chunks",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Notion ingest failed for page {request.page_id}")
        raise HTTPException(status_code=500, detail=f"Notion ingest failed: {str(e)}")


@router.post("/ingest/notion/db", response_model=IngestResponse)
async def ingest_notion_database(request: NotionDatabaseIngestRequest):
    """
    Ingest all pages from a Notion database.
    Processes up to `max_pages` pages (default 50).
    room_code is required for document scoping.
    """
    token = request.token or settings.NOTION_TOKEN
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Notion token required. Set NOTION_TOKEN in .env or pass 'token' in request body.",
        )

    doc_id = str(uuid.uuid4())
    try:
        raw_docs = fetch_notion_database(
            request.database_id,
            token=token,
            doc_id=doc_id,
            max_pages=request.max_pages,
            room_code=request.room_code,
        )
        if not raw_docs:
            raise HTTPException(
                status_code=422,
                detail="No text content found in the Notion database.",
            )

        chunks = chunk_documents(raw_docs)
        stored = add_documents(chunks)

        return IngestResponse(
            doc_id=doc_id,
            source=f"notion://database/{request.database_id}",
            chunk_count=stored,
            status="success",
            message=f"Ingested {len(raw_docs)} pages from Notion database into {stored} chunks",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Notion DB ingest failed for {request.database_id}")
        raise HTTPException(
            status_code=500, detail=f"Notion database ingest failed: {str(e)}"
        )


# ---------------------------------------------------------------------------
# Web URL
# ---------------------------------------------------------------------------


@router.post("/ingest/url", response_model=IngestResponse)
async def ingest_url(request: UrlIngestRequest):
    """
    Fetch and ingest a single web page URL.
    Strips navigation/header/footer noise. Extracts main content.
    room_code is required for document scoping.
    """
    doc_id = str(uuid.uuid4())
    try:
        raw_docs = await fetch_url(request.url, doc_id=doc_id, room_code=request.room_code)
        if not raw_docs:
            raise HTTPException(
                status_code=422,
                detail="No usable text content found at the URL.",
            )

        chunks = chunk_documents(raw_docs)
        stored = add_documents(chunks)

        return IngestResponse(
            doc_id=doc_id,
            source=request.url,
            chunk_count=stored,
            status="success",
            message=f"Ingested URL into {stored} chunks",
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"URL ingest failed for {request.url}")
        raise HTTPException(status_code=500, detail=f"URL ingest failed: {str(e)}")


@router.post("/ingest/urls", response_model=IngestResponse)
async def ingest_urls(request: UrlBatchIngestRequest):
    """
    Fetch and ingest multiple web page URLs in one call.
    URLs that fail are skipped (warnings logged).
    Returns aggregate chunk count.
    room_code is required for document scoping.
    """
    if not request.urls:
        raise HTTPException(status_code=400, detail="No URLs provided")
    if len(request.urls) > 20:
        raise HTTPException(status_code=400, detail="Max 20 URLs per batch")

    doc_id = str(uuid.uuid4())
    try:
        raw_docs = await fetch_urls(request.urls, doc_id=doc_id, room_code=request.room_code)
        if not raw_docs:
            raise HTTPException(
                status_code=422,
                detail="No usable content found in any of the provided URLs.",
            )

        chunks = chunk_documents(raw_docs)
        stored = add_documents(chunks)

        return IngestResponse(
            doc_id=doc_id,
            source=f"batch:{len(request.urls)} URLs",
            chunk_count=stored,
            status="success",
            message=f"Ingested {len(raw_docs)} pages from {len(request.urls)} URLs into {stored} chunks",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Batch URL ingest failed")
        raise HTTPException(
            status_code=500, detail=f"Batch URL ingest failed: {str(e)}"
        )
