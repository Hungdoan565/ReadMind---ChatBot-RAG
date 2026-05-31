"""
Chunking strategies for ingested documents.
Two-pass strategy:
  Pass 1: Split on semantic section boundaries (markdown headers, double newlines, etc.)
  Pass 2: If any section exceeds CHUNK_SIZE, apply character-based splitting on that section only
"""

import logging
import re
from typing import List

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import settings

logger = logging.getLogger(__name__)


def detect_section_title(text: str) -> str | None:
    """Extract the first markdown header line found in text.

    Examples:
        "## Introduction\\n..." -> "Introduction"
        "# My Title\\n..."      -> "My Title"
        "plain text"            -> None
    """
    match = re.search(r"^#{1,3}\s+(.+)$", text.strip(), re.MULTILINE)
    if match:
        return match.group(1).strip()
    return None


def chunk_documents(documents: List[Document]) -> List[Document]:
    """
    Split documents into chunks using a two-pass section-aware strategy.

    Pass 1: Split on semantic section boundaries (markdown headers first,
            then paragraph/sentence/word/char fallbacks), with keep_separator=True
            so headers are preserved in the resulting chunks.
    Pass 2: Any section chunk still larger than CHUNK_SIZE is further split
            with a pure character-based splitter.

    Preserves metadata (source, page, doc_id) and adds:
      - chunk_index: global index across all chunks
      - chunk_total: total number of chunks
      - section_title: nearest preceding markdown header, or None
    """
    # Pass-1 splitter: section-aware with markdown header separators first
    section_splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP,
        length_function=len,
        separators=["\n# ", "\n## ", "\n### ", "\n\n", "\n", ". ", " ", ""],
        keep_separator=True,
    )

    # Pass-2 splitter: pure character-based fallback (same as original behaviour)
    char_splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    all_chunks: List[Document] = []

    for doc in documents:
        # Pass 1 — section-boundary split
        pass1_chunks = section_splitter.split_documents([doc])

        logger.debug(
            "Pass-1 sections for doc '%s': %d section(s)",
            doc.metadata.get("source", "unknown"),
            len(pass1_chunks),
        )

        # Pass 2 — re-split any oversized sections
        for section in pass1_chunks:
            if len(section.page_content) > settings.CHUNK_SIZE:
                sub_chunks = char_splitter.split_documents([section])
                all_chunks.extend(sub_chunks)
            else:
                all_chunks.append(section)

    # Annotate every chunk with section_title + global chunk_index/chunk_total
    for i, chunk in enumerate(all_chunks):
        chunk.metadata["chunk_index"] = i
        chunk.metadata["chunk_total"] = len(all_chunks)
        chunk.metadata["section_title"] = detect_section_title(chunk.page_content)

    logger.info(
        "Chunked %d docs → %d chunks (size=%d, overlap=%d)",
        len(documents),
        len(all_chunks),
        settings.CHUNK_SIZE,
        settings.CHUNK_OVERLAP,
    )
    return all_chunks
