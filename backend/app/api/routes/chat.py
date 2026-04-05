"""
Chat endpoint — POST /api/chat

Smart routing:
- If room has documents → RAG chain (answer from docs)
- If room is empty → Direct chain (general AI knowledge)
"""

import logging
import uuid

from fastapi import APIRouter, HTTPException

from app.models.schemas import ChatRequest, ChatResponse, SourceDocument
from app.core.rag.chain import get_rag_chain, get_direct_chain, retrieve_source_docs
from app.core.vectordb.store import list_documents, validate_doc_ids_in_room

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Send a question and get an answer.

    Smart routing:
    - If room has documents → uses RAG chain (answers from uploaded docs)
    - If room is empty → uses direct chain (general AI knowledge)

    - `room_code` is required for document-scoped access.
    - `session_id` is optional; a new one is generated if omitted.
    - `active_doc_ids` is optional; if provided, only searches those documents within the room.
    - Conversation history is maintained per `session_id` (in-memory).
    """
    if not request.room_code or not request.room_code.strip():
        raise HTTPException(status_code=400, detail="room_code is required")
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    session_id = request.session_id or str(uuid.uuid4())
    room_code = request.room_code.strip()
    doc_ids = request.active_doc_ids  # May be None (search all docs in room)

    # Check if room has any documents
    room_docs = list_documents(room_code)
    has_documents = len(room_docs) > 0

    # Validate active_doc_ids belong to this room (only if docs exist and user specified)
    if has_documents and doc_ids:
        try:
            doc_ids = validate_doc_ids_in_room(doc_ids, room_code)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    try:
        if has_documents:
            # Room has documents → use RAG chain
            logger.info(f"Using RAG chain for room {room_code} ({len(room_docs)} docs)")
            rag_chain = get_rag_chain()
            answer: str = rag_chain.invoke(
                {"input": request.question, "doc_ids": doc_ids, "room_code": room_code},
                config={"configurable": {"session_id": session_id}},
            )

            # Retrieve source docs for citation
            raw_docs = retrieve_source_docs(
                request.question, doc_ids=doc_ids, room_code=room_code
            )
            sources = [
                SourceDocument(
                    source=doc.metadata.get("source", "unknown"),
                    page=doc.metadata.get("page"),
                    content_preview=doc.page_content[:200],
                )
                for doc in raw_docs
            ]
        else:
            # Room is empty → use direct chain (general AI)
            logger.info(f"Using direct chain for room {room_code} (no docs)")
            direct_chain = get_direct_chain()
            answer: str = direct_chain.invoke(
                {"input": request.question},
                config={"configurable": {"session_id": session_id}},
            )
            sources = []  # No sources for general AI

        return ChatResponse(
            answer=answer,
            session_id=session_id,
            sources=sources,
        )

    except Exception as e:
        logger.error(f"Chat error for session {session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")
