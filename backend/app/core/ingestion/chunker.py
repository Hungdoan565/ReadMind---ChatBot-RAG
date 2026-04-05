"""
Chunking strategies for ingested documents.
Default: RecursiveCharacterTextSplitter (512 tokens, 10% overlap)
"""

import logging
from typing import List

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import settings

logger = logging.getLogger(__name__)


def chunk_documents(documents: List[Document]) -> List[Document]:
    """
    Split documents into chunks.
    Preserves metadata (source, page, doc_id) on each chunk.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    chunks = splitter.split_documents(documents)

    # Add chunk index to metadata for debugging
    for i, chunk in enumerate(chunks):
        chunk.metadata["chunk_index"] = i
        chunk.metadata["chunk_total"] = len(chunks)

    logger.info(
        f"Chunked {len(documents)} docs → {len(chunks)} chunks "
        f"(size={settings.CHUNK_SIZE}, overlap={settings.CHUNK_OVERLAP})"
    )
    return chunks
