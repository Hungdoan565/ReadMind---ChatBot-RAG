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
from langchain_core.runnables import RunnablePassthrough, RunnableLambda
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_community.chat_message_histories import ChatMessageHistory

from app.core.llm.llm import get_llm
from app.core.vectordb.store import get_hybrid_retriever, hybrid_search, list_documents

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory session store  {session_id: ChatMessageHistory}
# ---------------------------------------------------------------------------
_session_store: dict[str, ChatMessageHistory] = {}


def get_session_history(session_id: str) -> ChatMessageHistory:
    """Return (or create) a ChatMessageHistory for the given session."""
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
)

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
    """Return the singleton RAG chain (lazy init)."""
    global _rag_chain
    if _rag_chain is None:
        _rag_chain = build_rag_chain()
        logger.info("RAG chain initialized")
    return _rag_chain


# ---------------------------------------------------------------------------
# Retrieval helper (for building SourceDocument list in the API layer)
# ---------------------------------------------------------------------------


def retrieve_source_docs(question: str, doc_ids: List[str] | None = None, room_code: str | None = None) -> List[Document]:
    """
    Return raw source documents for a question.
    Used by the chat endpoint to populate the `sources` field.
    
    Args:
        question: The user's question.
        doc_ids: If provided, only search within these document IDs.
        room_code: If provided, only search within this room.
    """
    return hybrid_search(question, doc_ids=doc_ids, room_code=room_code)


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
)


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
