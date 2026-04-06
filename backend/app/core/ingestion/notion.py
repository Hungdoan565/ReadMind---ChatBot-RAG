"""
Notion connector — fetch pages and databases as LangChain Documents.

Usage:
    docs = fetch_notion_page("page_id_or_url", token="secret_...")
    docs = fetch_notion_database("database_id", token="secret_...")

Each Document contains the block text content and metadata:
    {source, notion_id, title, type, url}
"""

import logging
import re
from typing import List, Optional

from langchain_core.documents import Document

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_id_from_url(url_or_id: str) -> str:
    """
    Accept either a raw Notion ID or a full URL like:
    https://www.notion.so/My-Page-abc123def456...
    Returns the 32-char hex ID (without dashes).
    """
    # Strip URL noise
    clean = url_or_id.strip().rstrip("/")
    # Last path segment
    segment = clean.split("/")[-1]
    # Remove page title prefix (e.g. "My-Page-abc123")
    # Notion IDs are 32 hex chars, optionally split by dashes
    match = re.search(
        r"([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})",
        segment,
        re.IGNORECASE,
    )
    if match:
        return match.group(1).replace("-", "")
    # fallback: assume it's already a clean ID
    return segment.replace("-", "")


def _rich_text_to_str(rich_text_list: list) -> str:
    """Convert Notion rich_text array → plain string."""
    return "".join(rt.get("plain_text", "") for rt in rich_text_list)


def _block_to_text(block: dict) -> Optional[str]:
    """
    Extract text from a single Notion block.
    Returns None for unsupported block types.
    """
    btype = block.get("type", "")
    data = block.get(btype, {})

    # Text-based blocks
    text_types = {
        "paragraph",
        "heading_1",
        "heading_2",
        "heading_3",
        "bulleted_list_item",
        "numbered_list_item",
        "toggle",
        "quote",
        "callout",
        "code",
    }
    if btype in text_types:
        rt = data.get("rich_text", [])
        text = _rich_text_to_str(rt)
        if btype == "code":
            lang = data.get("language", "")
            return f"```{lang}\n{text}\n```" if text else None
        return text or None

    if btype == "to_do":
        checked = data.get("checked", False)
        text = _rich_text_to_str(data.get("rich_text", []))
        prefix = "[x]" if checked else "[ ]"
        return f"{prefix} {text}" if text else None

    if btype == "divider":
        return "---"

    # Tables are handled separately via child blocks
    return None


# ---------------------------------------------------------------------------
# Core fetch functions
# ---------------------------------------------------------------------------


def fetch_notion_page(
    page_id_or_url: str,
    token: str,
    doc_id: Optional[str] = None,
    room_code: Optional[str] = None,
) -> List[Document]:
    """
    Fetch a Notion page and all its child blocks.

    Returns a list of Documents — one per logical section (heading + content),
    or a single Document if no headings.
    room_code is included in metadata for room-scoped access.
    """
    try:
        from notion_client import Client
    except ImportError:
        raise ImportError("notion-client not installed. Run: pip install notion-client")

    client = Client(auth=token)
    page_id = _extract_id_from_url(page_id_or_url)

    # Get page metadata
    try:
        page = client.pages.retrieve(page_id=page_id)
    except Exception as e:
        raise ValueError(f"Could not retrieve Notion page '{page_id}': {e}")

    # Extract title
    title = ""
    props = page.get("properties", {})
    for prop in props.values():
        if prop.get("type") == "title":
            title = _rich_text_to_str(prop.get("title", []))
            break

    page_url = page.get("url", f"https://notion.so/{page_id}")

    # Fetch all blocks (with pagination)
    all_blocks = _fetch_all_blocks(client, page_id)

    # Convert blocks to text chunks
    texts = _blocks_to_text_chunks(all_blocks)

    if not texts:
        logger.warning(f"No text content found in Notion page: {page_id}")
        return []

    # Build Documents
    documents = []
    for i, text in enumerate(texts):
        documents.append(
            Document(
                page_content=text,
                metadata={
                    "source": page_url,
                    "notion_id": page_id,
                    "title": title,
                    "type": "notion_page",
                    "doc_id": doc_id or page_id,
                    "chunk_index": i,
                    "room_code": room_code or "",
                },
            )
        )

    logger.info(f"Fetched Notion page '{title}' → {len(documents)} document(s)")
    return documents


def fetch_notion_database(
    database_id_or_url: str,
    token: str,
    doc_id: Optional[str] = None,
    max_pages: int = 50,
    room_code: Optional[str] = None,
) -> List[Document]:
    """
    Fetch all pages in a Notion database and return as Documents.

    Each database row becomes its own set of Documents.
    room_code is included in metadata for room-scoped access.
    """
    try:
        from notion_client import Client
    except ImportError:
        raise ImportError("notion-client not installed. Run: pip install notion-client")

    client = Client(auth=token)
    db_id = _extract_id_from_url(database_id_or_url)

    # Query all pages in DB
    try:
        results = []
        has_more = True
        cursor = None
        while has_more and len(results) < max_pages:
            params = {
                "database_id": db_id,
                "page_size": min(100, max_pages - len(results)),
            }
            if cursor:
                params["start_cursor"] = cursor
            resp = client.databases.query(**params)
            results.extend(resp.get("results", []))
            has_more = resp.get("has_more", False)
            cursor = resp.get("next_cursor")
    except Exception as e:
        raise ValueError(f"Could not query Notion database '{db_id}': {e}")

    all_documents = []
    for page in results:
        try:
            page_docs = fetch_notion_page(page["id"], token=token, doc_id=doc_id, room_code=room_code)
            all_documents.extend(page_docs)
        except Exception as e:
            logger.warning(f"Skipped Notion page {page.get('id')}: {e}")

    logger.info(
        f"Fetched Notion database '{db_id}' → {len(all_documents)} document(s) from {len(results)} pages"
    )
    return all_documents


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _fetch_all_blocks(client, block_id: str) -> list:
    """Fetch all child blocks for a page/block (handles pagination)."""
    blocks = []
    has_more = True
    cursor = None
    while has_more:
        params = {"block_id": block_id, "page_size": 100}
        if cursor:
            params["start_cursor"] = cursor
        resp = client.blocks.children.list(**params)
        blocks.extend(resp.get("results", []))
        has_more = resp.get("has_more", False)
        cursor = resp.get("next_cursor")
    return blocks


def _blocks_to_text_chunks(blocks: list) -> List[str]:
    """
    Convert a flat list of blocks into text chunks.
    Heading blocks start a new chunk; all other blocks append to the current chunk.
    """
    chunks: List[str] = []
    current_lines: List[str] = []

    heading_types = {"heading_1", "heading_2", "heading_3"}

    for block in blocks:
        btype = block.get("type", "")
        text = _block_to_text(block)

        if text is None:
            continue

        if btype in heading_types and current_lines:
            # Flush current chunk, start new one with heading
            chunks.append("\n".join(current_lines).strip())
            current_lines = [text]
        else:
            current_lines.append(text)

    # Flush remaining
    if current_lines:
        chunks.append("\n".join(current_lines).strip())

    return [c for c in chunks if c]
