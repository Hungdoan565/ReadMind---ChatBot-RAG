"""OCR helpers for scanned or image-only PDFs."""

from __future__ import annotations

import io
import logging
import re
from typing import List

import pypdf
from langchain_core.documents import Document

from app.config import settings

logger = logging.getLogger(__name__)

_MIN_TEXT_THRESHOLD = 50


def is_scanned_pdf(content: bytes) -> bool:
    """
    Return True when the PDF looks image-only or has almost no extractable text.
    """
    try:
        reader = pypdf.PdfReader(io.BytesIO(content))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to inspect PDF for OCR detection: %s", exc)
        return False

    if not reader.pages:
        return False

    extracted_lengths = []
    for page in reader.pages:
        try:
            text = (page.extract_text() or "").strip()
        except Exception:  # noqa: BLE001
            text = ""
        extracted_lengths.append(len(text))

    return all(length < _MIN_TEXT_THRESHOLD for length in extracted_lengths)


def ocr_pdf_bytes(
    content: bytes,
    filename: str,
    doc_id: str,
    room_code: str,
) -> List[Document]:
    """
    Extract text from a PDF by converting pages to images and running OCR.
    """
    try:
        import pytesseract
        from pdf2image import convert_from_bytes
    except ImportError as exc:  # noqa: BLE001
        raise RuntimeError(
            "OCR dependencies are missing. Install pytesseract and pdf2image."
        ) from exc

    if settings.TESSERACT_CMD:
        pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD

    try:
        images = convert_from_bytes(content, dpi=300)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Failed to render PDF pages for OCR. Ensure poppler-utils is installed."
        ) from exc

    documents: List[Document] = []
    total_pages = len(images)
    for page_num, image in enumerate(images, start=1):
        try:
            text = pytesseract.image_to_string(image, lang="vie+eng")
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                "OCR failed while processing PDF. Ensure tesseract-ocr and the Vietnamese language pack are installed."
            ) from exc

        text = _clean_ocr_text(text)
        if not text:
            continue

        documents.append(
            Document(
                page_content=text,
                metadata={
                    "source": filename,
                    "page": page_num,
                    "total_pages": total_pages,
                    "doc_id": doc_id,
                    "file_type": "pdf",
                    "room_code": room_code,
                    "ocr": True,
                },
            )
        )

    return documents


def _clean_ocr_text(text: str) -> str:
    """Normalize common OCR noise without over-aggressively changing content."""
    text = text.replace("\x0c", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"(?m)^\s*[|]+\s*$", "", text)
    return text.strip()
