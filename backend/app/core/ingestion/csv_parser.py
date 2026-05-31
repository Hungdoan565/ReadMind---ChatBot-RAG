"""CSV ingestion helpers."""

from __future__ import annotations

import csv
from io import StringIO
import logging
from typing import Any, List

from langchain_core.documents import Document

from app.config import settings

logger = logging.getLogger(__name__)

_ENCODINGS = ("utf-8", "utf-8-sig", "latin-1")


def parse_csv_bytes(
    content: bytes,
    filename: str,
    doc_id: str,
    room_code: str,
) -> List[Document]:
    """Parse CSV bytes into LangChain documents grouped by row range."""
    decoded = _decode_csv(content)
    if not decoded.strip():
        return []

    dialect = _sniff_dialect(decoded)
    reader = csv.DictReader(StringIO(decoded), dialect=dialect)
    if not reader.fieldnames:
        return []

    buffered_rows: List[str] = []
    documents: List[Document] = []
    chunk_start_row: int | None = None
    current_size = 0

    for row_index, row in enumerate(reader, start=2):
        row_text = " | ".join(
            f"{field}: {str(value).strip()}"
            for field, value in row.items()
            if field and value is not None and str(value).strip() != ""
        )
        if not row_text:
            continue

        if chunk_start_row is None:
            chunk_start_row = row_index

        projected_size = current_size + len(row_text) + 1
        if buffered_rows and projected_size > settings.CHUNK_SIZE:
            documents.append(
                _build_csv_document(
                    buffered_rows,
                    filename=filename,
                    doc_id=doc_id,
                    room_code=room_code,
                    row_start=chunk_start_row,
                    row_end=row_index - 1,
                )
            )
            buffered_rows = []
            current_size = 0
            chunk_start_row = row_index

        buffered_rows.append(row_text)
        current_size += len(row_text) + 1

    if buffered_rows and chunk_start_row is not None:
        row_end = (chunk_start_row - 1) + len(buffered_rows)
        documents.append(
            _build_csv_document(
                buffered_rows,
                filename=filename,
                doc_id=doc_id,
                room_code=room_code,
                row_start=chunk_start_row,
                row_end=row_end,
            )
        )

    logger.info("Parsed CSV %s into %d document block(s)", filename, len(documents))
    return documents


def _decode_csv(content: bytes) -> str:
    for encoding in _ENCODINGS:
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("latin-1", errors="ignore")


def _sniff_dialect(decoded: str) -> Any:
    sample = decoded[:8192]
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        return csv.get_dialect("excel")


def _build_csv_document(
    rows: List[str],
    *,
    filename: str,
    doc_id: str,
    room_code: str,
    row_start: int,
    row_end: int,
) -> Document:
    return Document(
        page_content="\n".join(rows),
        metadata={
            "source": filename,
            "doc_id": doc_id,
            "room_code": room_code,
            "row_range": f"{row_start}-{row_end}",
            "file_type": "csv",
        },
    )
