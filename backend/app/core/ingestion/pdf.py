"""
PDF parser using pypdf (no external service needed).
Extracts text page by page, preserves page metadata.
"""

import logging
import uuid
from pathlib import Path
from typing import List

from langchain_core.documents import Document
import pypdf

logger = logging.getLogger(__name__)


def parse_pdf(file_path: str | Path, doc_id: str | None = None) -> List[Document]:
    """
    Parse a PDF file into LangChain Documents (one per page).

    Args:
        file_path: Path to PDF file
        doc_id: Optional document ID (generated if not provided)

    Returns:
        List of Documents with metadata: source, page, doc_id
    """
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"PDF not found: {file_path}")

    if not doc_id:
        doc_id = str(uuid.uuid4())

    documents = []

    try:
        reader = pypdf.PdfReader(str(file_path))
        num_pages = len(reader.pages)
        logger.info(f"Parsing PDF: {file_path.name} ({num_pages} pages)")

        for page_num, page in enumerate(reader.pages):
            text = page.extract_text()

            # Skip empty pages
            if not text or not text.strip():
                logger.debug(f"Skipping empty page {page_num + 1}")
                continue

            # Clean up common PDF artifacts
            text = _clean_text(text)

            doc = Document(
                page_content=text,
                metadata={
                    "source": file_path.name,
                    "source_path": str(file_path),
                    "page": page_num + 1,
                    "total_pages": num_pages,
                    "doc_id": doc_id,
                    "file_type": "pdf",
                },
            )
            documents.append(doc)

    except Exception as e:
        logger.error(f"Failed to parse PDF {file_path.name}: {e}")
        raise

    logger.info(f"Parsed {len(documents)} non-empty pages from {file_path.name}")
    return documents


def parse_pdf_bytes(
    content: bytes, filename: str, doc_id: str | None = None, room_code: str | None = None,
) -> List[Document]:
    """Parse PDF from bytes (uploaded file)."""
    import io
    
    if not doc_id:
        doc_id = str(uuid.uuid4())
    
    documents = []
    
    try:
        reader = pypdf.PdfReader(io.BytesIO(content))
        num_pages = len(reader.pages)
        logger.info(f"Parsing PDF bytes: {filename} ({num_pages} pages)")
    
        for page_num, page in enumerate(reader.pages):
            text = page.extract_text()
            if not text or not text.strip():
                continue
    
            text = _clean_text(text)
    
            doc = Document(
                page_content=text,
                metadata={
                    "source": filename,
                    "page": page_num + 1,
                    "total_pages": num_pages,
                    "doc_id": doc_id,
                    "file_type": "pdf",
                    "room_code": room_code or "",
                },
            )
            documents.append(doc)

    except Exception as e:
        logger.error(f"Failed to parse PDF bytes {filename}: {e}")
        raise

    return documents


def _clean_text(text: str) -> str:
    """Remove common PDF noise."""
    import re

    # Collapse multiple newlines
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Remove non-printable characters (keep Vietnamese chars)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    return text.strip()
