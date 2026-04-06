"""
Web URL connector — fetch and parse web pages as LangChain Documents.

Uses httpx for static HTML, Jina Reader API for JavaScript-rendered pages.
Strips nav/header/footer/script/style noise.

Usage:
    docs = await fetch_url("https://example.com/docs/intro")
    docs = await fetch_urls(["https://...", "https://..."])
"""

import logging
import re
from typing import List, Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from langchain_core.documents import Document

logger = logging.getLogger(__name__)

# Tags that are pure noise
NOISE_TAGS = [
    "script",
    "style",
    "nav",
    "header",
    "footer",
    "aside",
    "advertisement",
    "banner",
    "cookie",
]

# CSS classes/ids that are likely navigation noise
NOISE_PATTERNS = re.compile(
    r"(nav|navigation|sidebar|footer|header|cookie|banner|ad-|advertisement|"
    r"menu|breadcrumb|pagination|social|share|comment|related)",
    re.IGNORECASE,
)

MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5MB
REQUEST_TIMEOUT = 30  # seconds
JINA_TIMEOUT = 60  # seconds - Jina can be slower

# Minimum content length to consider valid
MIN_CONTENT_LENGTH = 100

# Jina Reader API - free, no API key required
JINA_READER_URL = "https://r.jina.ai/"


async def fetch_url(
    url: str,
    doc_id: Optional[str] = None,
    room_code: Optional[str] = None,
    timeout: int = REQUEST_TIMEOUT,
    force_js_render: bool = False,
) -> List[Document]:
    """Fetch a single URL and return as LangChain Document(s)."""
    _validate_url(url)
    
    # Skip httpx and go directly to Jina if forced
    if force_js_render:
        return await _fetch_with_jina(url, doc_id=doc_id, room_code=room_code)
    
    # Try httpx first (static HTML)
    try:
        docs = await _fetch_with_httpx(url, doc_id=doc_id, room_code=room_code, timeout=timeout)
        if docs and len(docs[0].page_content) >= MIN_CONTENT_LENGTH:
            return docs
        logger.info(f"httpx returned minimal content, trying Jina Reader for: {url}")
    except Exception as e:
        logger.info(f"httpx failed ({e}), trying Jina Reader for: {url}")
    
    # Fallback to Jina Reader for JS-rendered content
    return await _fetch_with_jina(url, doc_id=doc_id, room_code=room_code)


async def _fetch_with_httpx(
    url: str,
    doc_id: Optional[str] = None,
    room_code: Optional[str] = None,
    timeout: int = REQUEST_TIMEOUT,
) -> List[Document]:
    """Fetch URL using httpx (static HTML only)."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
    except httpx.TimeoutException:
        raise ValueError(f"Request timed out after {timeout}s: {url}")
    except httpx.HTTPStatusError as e:
        raise ValueError(f"HTTP {e.response.status_code} fetching {url}: {e}")
    except Exception as e:
        raise ValueError(f"Failed to fetch {url}: {e}")

    content_type = response.headers.get("content-type", "")
    if "text/html" not in content_type and "application/xhtml" not in content_type:
        raise ValueError(
            f"URL does not return HTML (content-type: {content_type}): {url}"
        )

    return _parse_html(response.text, url=url, doc_id=doc_id, room_code=room_code)


async def _fetch_with_jina(
    url: str,
    doc_id: Optional[str] = None,
    room_code: Optional[str] = None,
) -> List[Document]:
    """
    Fetch URL using Jina Reader API.

    Jina Reader renders JavaScript and returns clean markdown.
    Free tier, no API key required.
    https://jina.ai/reader/
    """
    jina_url = f"{JINA_READER_URL}{url}"

    headers = {
        "Accept": "text/plain",
        "User-Agent": "RAGBot/1.0",
    }

    logger.info(f"Using Jina Reader to fetch: {url}")

    try:
        async with httpx.AsyncClient(
            timeout=JINA_TIMEOUT, follow_redirects=True
        ) as client:
            response = await client.get(jina_url, headers=headers)
            response.raise_for_status()
    except httpx.TimeoutException:
        raise ValueError(f"Jina Reader timed out after {JINA_TIMEOUT}s: {url}")
    except httpx.HTTPStatusError as e:
        raise ValueError(f"Jina Reader returned HTTP {e.response.status_code}: {url}")
    except Exception as e:
        raise ValueError(f"Jina Reader failed for {url}: {e}")

    text = response.text.strip()

    if not text or len(text) < MIN_CONTENT_LENGTH:
        raise ValueError(f"No usable text content found at: {url}")

    # Extract title from the first line if it looks like a heading
    lines = text.split("\n", 1)
    title = url
    content = text

    if lines[0].startswith("# "):
        title = lines[0][2:].strip()
        content = lines[1].strip() if len(lines) > 1 else text
    elif lines[0].startswith("Title: "):
        title = lines[0][7:].strip()
        content = lines[1].strip() if len(lines) > 1 else text

    doc = Document(
        page_content=content,
        metadata={
            "source": url,
            "title": title,
            "type": "web_page",
            "doc_id": doc_id or _url_to_id(url),
            "room_code": room_code or "",
        },
    )

    logger.info(
        f"Fetched URL '{title}' ({len(content)} chars) via Jina Reader → 1 document"
    )
    return [doc]


async def fetch_urls(
    urls: List[str],
    doc_id: Optional[str] = None,
    room_code: Optional[str] = None,
) -> List[Document]:
    """
    Fetch multiple URLs sequentially.
    Skips URLs that fail — logs a warning for each.
    room_code is passed to each fetched document.
    """
    all_docs: List[Document] = []
    for url in urls:
        try:
            docs = await fetch_url(url, doc_id=doc_id, room_code=room_code)
            all_docs.extend(docs)
        except Exception as e:
            logger.warning(f"Skipped URL {url}: {e}")
    return all_docs


# ---------------------------------------------------------------------------
# HTML parsing (sync - no I/O)
# ---------------------------------------------------------------------------


def _parse_html(html: str, url: str, doc_id: Optional[str] = None, room_code: Optional[str] = None) -> List[Document]:
    """Parse HTML and return clean Document(s)."""
    soup = BeautifulSoup(html, "html.parser")
    
    # Extract title
    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else url
    
    # Remove noise elements
    for tag in soup.find_all(NOISE_TAGS):
        tag.decompose()
    
    # Remove elements with noisy class/id attributes
    for tag in soup.find_all(True):
        classes = " ".join(tag.get("class", []))
        tag_id = tag.get("id", "")
        if NOISE_PATTERNS.search(classes) or NOISE_PATTERNS.search(tag_id):
            tag.decompose()
    
    # Try to find the main content area
    main_content = (
        soup.find("main")
        or soup.find("article")
        or soup.find(id=re.compile(r"content|main|article", re.IGNORECASE))
        or soup.find(class_=re.compile(r"content|main|article", re.IGNORECASE))
        or soup.find("body")
        or soup
    )
    
    # Extract text with structural line breaks
    text = _element_to_text(main_content)
    text = _clean_text(text)
    
    if not text:
        logger.warning(f"No usable text content found at: {url}")
        return []
    
    doc = Document(
        page_content=text,
        metadata={
            "source": url,
            "title": title,
            "type": "web_page",
            "doc_id": doc_id or _url_to_id(url),
            "room_code": room_code or "",
        },
    )

    logger.info(f"Fetched URL '{title}' ({len(text)} chars) → 1 document")
    return [doc]


def _element_to_text(element) -> str:
    """
    Extract text from a BeautifulSoup element.
    Adds newlines at block-level elements for readability.
    """
    BLOCK_TAGS = {
        "p",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "li",
        "td",
        "th",
        "div",
        "br",
        "tr",
    }

    lines = []
    for node in element.descendants:
        if hasattr(node, "name"):
            if node.name in BLOCK_TAGS:
                lines.append("\n")
        elif hasattr(node, "string") and node.string:
            text = node.string.strip()
            if text:
                lines.append(text)

    return " ".join(lines)


def _clean_text(text: str) -> str:
    """Normalize whitespace, remove excessive blank lines."""
    # Collapse multiple spaces
    text = re.sub(r" {2,}", " ", text)
    # Normalize newlines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _url_to_id(url: str) -> str:
    """Generate a stable short ID from a URL."""
    parsed = urlparse(url)
    return f"{parsed.netloc}{parsed.path}".replace("/", "_").strip("_")[:64]


def _validate_url(url: str) -> None:
    """Raise ValueError if URL is not HTTP/HTTPS."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Only HTTP/HTTPS URLs are supported (got: {url})")
    if not parsed.netloc:
        raise ValueError(f"Invalid URL: {url}")
