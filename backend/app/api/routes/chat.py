"""
Chat endpoint — POST /api/chat

Smart routing:
- If room has documents → RAG chain (answer from docs)
- If room is empty → Direct chain (general AI knowledge)

Returns SSE streaming response with token-level chunks.
"""

import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.models.schemas import ChatRequest, SourceDocument
from app.core.rag.chain import (
    contextualize_question,
    retrieve_docs,
    format_docs,
    get_rag_answer_chain,
    get_direct_chain,
)
from app.core.vectordb.store import list_documents, validate_doc_ids_in_room
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


def get_rate_limit_key(request: Request) -> str:
    """
    Rate limit by user_id when authenticated, by IP when anonymous.

    Authenticated users get higher limits (40/minute).
    Anonymous users keep current limits (20/minute).
    """
    user = getattr(request.state, "current_user", None)
    if user is not None:
        return f"user:{user.id}"
    return get_remote_address(request)


# Authenticated limit is higher; use inline string per slowapi convention
_ANON_LIMIT = settings.RATE_LIMIT_CHAT  # "20/minute"
_AUTH_LIMIT = "40/minute"


@router.post("/chat")
@limiter.limit(_ANON_LIMIT)
async def chat(request: Request, body: ChatRequest):
    """
    Send a question and get a streamed answer via SSE.

    Smart routing:
    - If room has documents → uses RAG chain (answers from uploaded docs)
    - If room is empty → uses direct chain (general AI knowledge)

    SSE events:
    - `start`: {"event": "start", "session_id": "..."}
    - `token`: {"event": "token", "data": "..."}
    - `end`:   {"event": "end", "session_id": "...", "sources": [...]}
    - `error`: {"event": "error", "data": "..."}

    - `room_code` is required for document-scoped access.
    - `session_id` is optional; a new one is generated if omitted.
    - `active_doc_ids` is optional; if provided, only searches those documents within the room.
    - Conversation history is maintained per `session_id` (Redis-backed, falls back to in-memory).
    """
    if not body.room_code or not body.room_code.strip():
        raise HTTPException(status_code=400, detail="room_code is required")
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    session_id = body.session_id or str(uuid.uuid4())
    room_code = body.room_code.strip()
    doc_ids = body.active_doc_ids  # May be None (search all docs in room)

    # Check if room has any documents.
    # list_documents() is a blocking SQL call — offload to a worker thread so it
    # never stalls the event loop (a prior version stalled here and 502'd).
    room_docs = await run_in_threadpool(list_documents, room_code)
    has_documents = len(room_docs) > 0

    # Validate active_doc_ids belong to this room (only if docs exist and user specified)
    if has_documents and doc_ids:
        try:
            doc_ids = await run_in_threadpool(
                validate_doc_ids_in_room, doc_ids, room_code
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    def event_generator():
        try:
            # Emit start event
            yield f"data: {json.dumps({'event': 'start', 'session_id': session_id})}\n\n"

            if has_documents:
                # Room has documents → use RAG chain.
                # Single-retrieve orchestration (Bug 3 fix):
                #   contextualize → retrieve_docs ONCE → format context →
                #   answer-only chain → sources built from the SAME docs.
                logger.info(
                    f"Streaming RAG chain for room {room_code} ({len(room_docs)} docs)"
                )

                # 1) Resolve the standalone question (reads history read-only).
                standalone_q = contextualize_question(body.question, session_id)

                # 2) Retrieve EXACTLY once; reused for both context and sources.
                docs = retrieve_docs(
                    standalone_q, doc_ids=doc_ids, room_code=room_code
                )
                context = format_docs(docs)

                # 3) Stream the answer from the supplied context (no retrieval inside).
                for chunk in get_rag_answer_chain().stream(
                    {"input": body.question, "context": context},
                    config={"configurable": {"session_id": session_id}},
                ):
                    if isinstance(chunk, str) and chunk:
                        yield f"data: {json.dumps({'event': 'token', 'data': chunk})}\n\n"

                # 4) Build sources from the SAME docs used as context (same order).
                sources = [
                    {
                        "source": doc.metadata.get("source", "unknown"),
                        "page": doc.metadata.get("page"),
                        "content_preview": doc.page_content[:200],
                    }
                    for doc in docs
                ]
            else:
                # Room is empty → use direct chain (general AI)
                logger.info(f"Streaming direct chain for room {room_code} (no docs)")
                direct_chain = get_direct_chain()
                for chunk in direct_chain.stream(
                    {"input": body.question},
                    config={"configurable": {"session_id": session_id}},
                ):
                    if isinstance(chunk, str) and chunk:
                        yield f"data: {json.dumps({'event': 'token', 'data': chunk})}\n\n"

                sources = []  # No sources for general AI

            # Emit end event with sources
            yield f"data: {json.dumps({'event': 'end', 'session_id': session_id, 'sources': sources})}\n\n"

        except Exception as e:
            logger.error(f"Stream error for session {session_id}: {e}", exc_info=True)
            yield f"data: {json.dumps({'event': 'error', 'data': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
