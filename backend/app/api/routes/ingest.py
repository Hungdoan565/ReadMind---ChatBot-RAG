"""
Ingest endpoint: upload documents → parse → chunk → embed → store.
Supports: PDF, DOCX, TXT
"""

import uuid
import logging
from fastapi import APIRouter, UploadFile, File, Form, Query, HTTPException
from langchain_core.documents import Document

from app.models.schemas import IngestResponse
from app.core.ingestion.pdf import parse_pdf_bytes
from app.core.ingestion.docx_parser import parse_docx_bytes
from app.core.ingestion.chunker import chunk_documents
from app.core.vectordb.store import add_documents, delete_by_doc_id, list_documents

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


@router.post("/ingest", response_model=IngestResponse)
async def ingest_document(file: UploadFile = File(...), room_code: str = Form(...)):
    """
    Upload and process a document into the vector store.
    Pipeline: upload → parse → chunk → embed → ChromaDB
    """
    if not room_code or not room_code.strip():
        raise HTTPException(status_code=400, detail="room_code is required")
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    suffix = (
        "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    )
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{suffix}' not supported. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content) // 1024 // 1024}MB). Max: 50MB",
        )

    doc_id = str(uuid.uuid4())
    logger.info(
        f"Ingesting: {file.filename} ({len(content) // 1024}KB) doc_id={doc_id}"
    )

    try:
        # 1. Parse
        if suffix == ".pdf":
            raw_docs = parse_pdf_bytes(content, file.filename, doc_id, room_code)
        elif suffix == ".docx":
            raw_docs = parse_docx_bytes(content, file.filename, doc_id, room_code)
        else:  # .txt
            text = content.decode("utf-8", errors="ignore")
            raw_docs = [
                Document(
                    page_content=text,
                    metadata={
                        "source": file.filename,
                        "doc_id": doc_id,
                        "file_type": "txt",
                        "room_code": room_code,
                    },
                )
            ]

        if not raw_docs:
            raise HTTPException(
                status_code=422,
                detail="Could not extract text from file. Ensure it is not a scanned image-only PDF.",
            )

        # 2. Chunk
        chunks = chunk_documents(raw_docs)

        # 3. Embed + Store
        stored_count = add_documents(chunks)

        return IngestResponse(
            doc_id=doc_id,
            source=file.filename,
            chunk_count=stored_count,
            status="success",
            message=f"Successfully processed {file.filename} into {stored_count} chunks",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Ingestion failed for {file.filename}")
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


@router.delete("/ingest/{doc_id}")
async def delete_document(doc_id: str, room_code: str = Query(...)):
    """
    Delete all chunks belonging to a document by doc_id within a specific room.
    """
    if not room_code or not room_code.strip():
        raise HTTPException(status_code=400, detail="room_code is required")
    try:
        count = delete_by_doc_id(doc_id, room_code)
        if count == 0:
            raise HTTPException(
                status_code=404,
                detail=f"Document {doc_id} not found in room {room_code}",
            )
        return {
            "doc_id": doc_id,
            "deleted_chunks": count,
            "status": "success",
            "message": f"Deleted {count} chunks for document {doc_id}",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Delete failed for doc_id={doc_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents")
async def get_documents(room_code: str = Query(...)):
    """
    List all documents stored in the vector database for a specific room.
    """
    if not room_code or not room_code.strip():
        raise HTTPException(status_code=400, detail="room_code is required")
    try:
        docs = list_documents(room_code)
        return {
            "documents": docs,
            "total": len(docs),
        }
    except Exception as e:
        logger.exception("Failed to list documents")
        raise HTTPException(status_code=500, detail=str(e))
