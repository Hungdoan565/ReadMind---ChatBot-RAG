from pydantic import BaseModel, HttpUrl
from typing import Optional, List
from datetime import datetime


# --- Ingest ---


class IngestResponse(BaseModel):
    doc_id: str
    source: str
    chunk_count: int
    status: str
    message: str


# --- Notion Ingest ---


class NotionIngestRequest(BaseModel):
    page_id: str  # Notion page ID or full URL
    room_code: str  # Required: documents are scoped to a room
    token: Optional[str] = None  # Override; falls back to settings.NOTION_TOKEN


class NotionDatabaseIngestRequest(BaseModel):
    database_id: str  # Notion database ID or full URL
    room_code: str  # Required: documents are scoped to a room
    token: Optional[str] = None
    max_pages: int = 50


# --- URL Ingest ---


class UrlIngestRequest(BaseModel):
    url: str  # Web page URL to scrape
    room_code: str  # Required: documents are scoped to a room


class UrlBatchIngestRequest(BaseModel):
    urls: List[str]  # Multiple URLs
    room_code: str  # Required: documents are scoped to a room

# --- Chat ---


class ChatRequest(BaseModel):
    question: str
    room_code: str  # Required: documents are scoped to a room
    session_id: Optional[str] = None
    active_doc_ids: Optional[List[str]] = None  # If provided, only search these docs

class SourceDocument(BaseModel):
    source: str
    page: Optional[int] = None
    content_preview: str  # first 200 chars of chunk


class ChatResponse(BaseModel):
    answer: str
    session_id: str
    sources: List[SourceDocument]


# --- Health ---


class HealthResponse(BaseModel):
    status: str
    app: str
    version: str
    timestamp: datetime
