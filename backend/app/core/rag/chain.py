"""
RAG Chain using LangChain LCEL.

Architecture:
  question + history → contextualize_question → retriever → format_docs
                                                           ↓
  question + context + history → answer_prompt → LLM → answer

Conversation memory is managed externally via session_id:
  - get_session_history()  stores InMemoryChatMessageHistory per session
  - RunnableWithMessageHistory wraps the chain for auto history injection
"""

import logging
from typing import List

from langchain_core.documents import Document
from langchain_core.messages import BaseMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import RunnablePassthrough, RunnableLambda, Runnable
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_community.chat_message_histories import ChatMessageHistory

from app.core.llm.llm import get_llm
from app.core.vectordb.store import get_hybrid_retriever, hybrid_search, list_documents

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory session store  {session_id: ChatMessageHistory}
# ---------------------------------------------------------------------------
# Session store  — Redis primary, in-memory fallback

# ---------------------------------------------------------------------------

_session_store: dict[str, ChatMessageHistory] = {}





def get_session_history(session_id: str) -> ChatMessageHistory:

    """

    Return session history for the given session_id.



    Tries Redis-backed RedisChatMessageHistory first.

    Falls back to in-memory ChatMessageHistory if Redis is unavailable.

    """

    # Try Redis first

    try:

        import asyncio

        from app.core.cache.redis_client import get_redis_client

        from app.core.cache.session_store import RedisChatMessageHistory



        # Attempt to get Redis client (synchronous call via asyncio)

        redis_client = None

        try:

            loop = asyncio.get_event_loop()

            if loop.is_running():

                import concurrent.futures

                with concurrent.futures.ThreadPoolExecutor() as pool:

                    future = pool.submit(asyncio.run, get_redis_client())

                    redis_client = future.result(timeout=2)

            else:

                redis_client = asyncio.run(get_redis_client())

        except Exception:

            redis_client = None



        return RedisChatMessageHistory(

            session_id=session_id,

            redis_client=redis_client,

        )



    except Exception as exc:

        import logging

        logging.getLogger(__name__).warning(

            "Redis session history unavailable (%s), using in-memory fallback", exc

        )



    # In-memory fallback

    if session_id not in _session_store:

        _session_store[session_id] = ChatMessageHistory()

    return _session_store[session_id]


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

# Step 1 — rephrase user question given chat history
CONTEXTUALIZE_SYSTEM = (
    "Given a chat history and the latest user question which might reference "
    "context in the chat history, formulate a standalone question which can be "
    "understood without the chat history. Do NOT answer the question, just "
    "reformulate it if needed and otherwise return it as is."
)

contextualize_q_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", CONTEXTUALIZE_SYSTEM),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ]
)

# Shared rich-output formatting guidance appended to both system prompts.
# NOTE: This guide MUST NOT contain any `{` or `}` characters so that it can be
# concatenated onto the raw system-prompt strings before the ChatPromptTemplate
# (f-string format) is built, leaving `{context}` as the only placeholder.
RICH_FORMAT_GUIDE = (
    "\n\nĐỊNH DẠNG TRÌNH BÀY — chọn định dạng phù hợp nhất với nội dung:\n"
    "- Quy trình, luồng xử lý, máy trạng thái, hoặc cây quyết định/phân nhánh có "
    "TỪ 3 BƯỚC trở lên HOẶC TỪ 2 NHÁNH trở lên: vẽ sơ đồ Mermaid.\n"
    "- So sánh TỪ 2 ĐỐI TƯỢNG trở lên theo TỪ 2 TIÊU CHÍ trở lên: dùng bảng "
    "Markdown (GFM), mỗi đối tượng một hàng, mỗi tiêu chí một cột.\n"
    "- Cấu trúc phân cấp/lồng nhau TỪ 2 CẤP trở lên: dùng danh sách lồng nhau "
    "hoặc cây ASCII đặt trong khối ```text.\n"
    "- Một phần vừa là quy trình vừa là phân cấp: ƯU TIÊN sơ đồ Mermaid.\n"
    "- Nội dung không thuộc các dạng trên: trả lời bằng VĂN XUÔI, không chèn "
    "sơ đồ/bảng/cây.\n"
    "- Một câu trả lời có thể chứa nhiều dạng: áp dụng định dạng phù hợp cho "
    "từng phần một cách độc lập.\n\n"
    "QUY TẮC MARKUP (bắt buộc):\n"
    "- Sơ đồ Mermaid đặt trong khối mã có info string đúng là `mermaid` (một từ, "
    "viết thường, không thêm ký tự) và phải đóng bằng dấu ``` khớp.\n"
    "- Mọi nhãn nút, tiêu đề cột, ô bảng, mục danh sách PHẢI bằng tiếng Việt "
    "(ví dụ nhãn nút 'Bắt đầu' thay vì 'Start').\n"
    "- Mọi khối mã phải có dấu mở và đóng ``` khớp nhau; bảng GFM phải có hàng "
    "tiêu đề, hàng phân cách, và các hàng dữ liệu cùng số cột.\n"
    "- Mã nguồn đặt trong khối mã với info string là tên ngôn ngữ; ASCII art "
    "đặt trong khối ```text.\n"
    "- KHÔNG bịa ra sơ đồ hay bảng. Nếu không thể tạo Mermaid/bảng hợp lệ, hãy "
    "chuyển sang văn xuôi hoặc danh sách lồng nhau thay vì xuất markup lỗi.\n\n"
    "VÍ DỤ sơ đồ hợp lệ:\n"
    "```mermaid\n"
    "flowchart TD\n"
    "  A[Bắt đầu] --> B[Đã đăng nhập?]\n"
    "  B -- Có --> C[Hiển thị trang chính]\n"
    "  B -- Không --> D[Chuyển đến trang đăng nhập]\n"
    "```\n"
)

# Step 2 — answer based on retrieved context
ANSWER_SYSTEM = (
    "Bạn là trợ lý AI thông minh. Bạn ĐÃ ĐỌC ĐƯỢC nội dung từ tài liệu người dùng upload.\n\n"
    "QUAN TRỌNG:\n"
    "- CONTEXT bên dưới chính là NỘI DUNG THỰC SỰ từ file PDF/DOCX người dùng đã upload.\n"
    "- Bạn CÓ THỂ và ĐÃ truy cập được nội dung file. Không bao giờ nói 'không thể đọc file' hay 'không có quyền truy cập'.\n"
    "- Khi user hỏi về nội dung file, hãy tóm tắt hoặc trích dẫn từ CONTEXT.\n\n"
    "Hướng dẫn trả lời:\n"
    "1. Dựa vào CONTEXT để trả lời. Đây là nội dung thực từ tài liệu đã upload.\n"
    "2. Trả lời tự nhiên, rõ ràng bằng tiếng Việt.\n"
    "3. Nếu câu hỏi hỏi về nội dung file: tóm tắt những gì có trong CONTEXT.\n"
    "4. Nếu thông tin KHÔNG có trong CONTEXT: nói 'Thông tin này không có trong tài liệu đã upload.'\n"
    "5. KHÔNG BAO GIỜ nói 'tôi không thể truy cập', 'không đọc được file', 'không có quyền'.\n\n"
    "CONTEXT (nội dung trích từ tài liệu đã upload):\n{context}"
) + RICH_FORMAT_GUIDE

answer_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", ANSWER_SYSTEM),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ]
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def format_docs(docs: List[Document]) -> str:
    """Concatenate doc page_content for the LLM context string."""
    return "\n\n---\n\n".join(doc.page_content for doc in docs)


def _contextualize_question(inputs: dict) -> str:
    """
    If there's chat history, rephrase the question to be standalone.
    Otherwise return it as-is (saves 1 LLM call on first message).
    """
    history: List[BaseMessage] = inputs.get("chat_history", [])
    if not history:
        return inputs["input"]

    llm = get_llm()
    chain = contextualize_q_prompt | llm | StrOutputParser()
    return chain.invoke(inputs)


def contextualize_question(question: str, session_id: str) -> str:
    """
    Return a standalone version of *question* using the session's chat history.

    Reads history READ-ONLY via get_session_history(session_id).messages and
    does NOT write back to it. If the history is empty, the question is returned
    unchanged (saves one LLM call on the first message of a conversation).

    Args:
        question: The raw user question.
        session_id: Conversation/session identifier whose history is consulted.

    Returns:
        The standalone (history-resolved) question, or the original question when
        there is no prior history.
    """
    history: List[BaseMessage] = get_session_history(session_id).messages
    if not history:
        return question

    llm = get_llm()
    chain = contextualize_q_prompt | llm | StrOutputParser()
    return chain.invoke({"input": question, "chat_history": history})


def retrieve_docs(
    question: str,
    doc_ids: List[str] | None = None,
    room_code: str | None = None,
) -> List[Document]:
    """
    Retrieve source documents for *question* by calling hybrid_search EXACTLY once.

    This is the single retrieval entry point used by the chat endpoint so that
    both the LLM context and the citation `sources` come from the same call.

    Args:
        question: The (already contextualized) standalone question to search with.
        doc_ids: If provided, only search within these document IDs.
        room_code: If provided, only search within this room.

    Returns:
        The raw list of retrieved documents.
    """
    return hybrid_search(question, doc_ids=doc_ids, room_code=room_code)


# ---------------------------------------------------------------------------
# Main chain factory
# ---------------------------------------------------------------------------


def build_rag_chain():
    """
    Build and return a RunnableWithMessageHistory RAG chain.

    Input keys  : {"input": str, "doc_ids": list | None}  (session_id handled by wrapper)
    Output      : str  (the answer)

    Usage:
        chain = build_rag_chain()
        answer = chain.invoke(
            {"input": "What is RAG?", "doc_ids": ["doc123"]},
            config={"configurable": {"session_id": "abc-123"}},
        )
    """
    llm = get_llm()

    def retrieve_with_filter(inputs: dict) -> str:
        """Retrieve docs with optional doc_id and room filtering."""
        query = inputs["standalone_q"]
        doc_ids = inputs.get("doc_ids")
        room_code = inputs.get("room_code")
        docs = hybrid_search(query, doc_ids=doc_ids, room_code=room_code)
        return format_docs(docs)

    # Core chain (no history injection yet)
    core_chain = (
        RunnablePassthrough.assign(
            # Rephrase question if history exists
            standalone_q=RunnableLambda(_contextualize_question)
        )
        | RunnablePassthrough.assign(
            # Retrieve docs using the (possibly rephrased) question, filtered by doc_ids
            context=RunnableLambda(retrieve_with_filter)
        )
        | RunnablePassthrough.assign(
            # Keep original input for final prompt; discard standalone_q
            input=lambda x: x["input"],
            context=lambda x: x["context"],
        )
        | answer_prompt
        | llm
        | StrOutputParser()
    )

    # Wrap with automatic history management
    chain_with_history = RunnableWithMessageHistory(
        core_chain,
        get_session_history,
        input_messages_key="input",
        history_messages_key="chat_history",
    )

    return chain_with_history


# Singleton — built once on first import
_rag_chain = None


def get_rag_chain():
    """Return the singleton RAG chain (lazy init).

    DEPRECATED for the chat flow: this chain retrieves internally. The chat
    endpoint now orchestrates retrieval explicitly (contextualize_question →
    retrieve_docs → get_rag_answer_chain) so retrieval happens exactly once and
    `sources` match the context. Kept for backward compatibility with any other
    callers.
    """
    global _rag_chain
    if _rag_chain is None:
        _rag_chain = build_rag_chain()
        logger.info("RAG chain initialized")
    return _rag_chain


# ---------------------------------------------------------------------------
# Answer-only chain factory (context supplied by caller — no retrieval inside)
# ---------------------------------------------------------------------------


def build_rag_answer_chain() -> Runnable:
    """
    Build an "answer from the given context" chain.

    Unlike build_rag_chain(), this chain does NOT retrieve. The caller supplies
    a pre-computed `context` string (built from documents retrieved exactly once
    in the endpoint). This guarantees the answer's context and the citation
    `sources` come from the same retrieval call.

    Input keys : {"input": str, "context": str}  (session_id handled by wrapper)
    Output     : str  (the answer)

    History still works: RunnableWithMessageHistory injects `chat_history` from
    the session before the prompt and writes exactly one (human + AI) pair back
    after the stream completes, keyed by `input`.
    """
    llm = get_llm()

    core_chain = answer_prompt | llm | StrOutputParser()

    chain_with_history = RunnableWithMessageHistory(
        core_chain,
        get_session_history,
        input_messages_key="input",
        history_messages_key="chat_history",
    )

    return chain_with_history


# Singleton for the answer-only chain
_rag_answer_chain: Runnable | None = None


def get_rag_answer_chain() -> Runnable:
    """Return the singleton answer-only RAG chain (lazy init)."""
    global _rag_answer_chain
    if _rag_answer_chain is None:
        _rag_answer_chain = build_rag_answer_chain()
        logger.info("RAG answer chain initialized")
    return _rag_answer_chain


# ---------------------------------------------------------------------------
# Retrieval helper (for building SourceDocument list in the API layer)
# ---------------------------------------------------------------------------


def retrieve_source_docs(question: str, doc_ids: List[str] | None = None, room_code: str | None = None) -> List[Document]:
    """
    Return raw source documents for a question.

    DEPRECATED for the chat flow: the chat endpoint no longer calls this (it uses
    the documents from the single `retrieve_docs` call to build `sources`). Kept
    as a thin wrapper around `retrieve_docs` for backward compatibility.

    Args:
        question: The user's question.
        doc_ids: If provided, only search within these document IDs.
        room_code: If provided, only search within this room.
    """
    return retrieve_docs(question, doc_ids=doc_ids, room_code=room_code)


# ---------------------------------------------------------------------------
# Direct chain (no RAG, general AI)
# ---------------------------------------------------------------------------


DIRECT_SYSTEM = (
    "Bạn là trợ lý AI thông minh và hữu ích.\n\n"
    "Hướng dẫn:\n"
    "1. Trả lời câu hỏi một cách chính xác, rõ ràng bằng tiếng Việt.\n"
    "2. Sử dụng kiến thức của bạn để trả lời.\n"
    "3. Nếu không chắc chắn, hãy nói rõ.\n"
    "4. Trả lời tự nhiên, thân thiện.\n"
) + RICH_FORMAT_GUIDE


direct_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", DIRECT_SYSTEM),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ]
)


def build_direct_chain():
    """
    Build a direct chat chain (no RAG retrieval).
    For general questions when no documents are uploaded.
    """
    llm = get_llm()
    
    core_chain = (
        direct_prompt
        | llm
        | StrOutputParser()
    )
    
    chain_with_history = RunnableWithMessageHistory(
        core_chain,
        get_session_history,
        input_messages_key="input",
        history_messages_key="chat_history",
    )
    
    return chain_with_history


# Singleton for direct chain
_direct_chain = None


def get_direct_chain():
    """Return the singleton direct chain (lazy init)."""
    global _direct_chain
    if _direct_chain is None:
        _direct_chain = build_direct_chain()
        logger.info("Direct chain initialized")
    return _direct_chain
