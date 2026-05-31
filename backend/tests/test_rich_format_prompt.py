"""Prompt-behavior tests for the rich-summary-rendering backend change.

These tests cover the prompt-only edit in `app.core.rag.chain`: a shared
`RICH_FORMAT_GUIDE` constant appended to both `ANSWER_SYSTEM` and `DIRECT_SYSTEM`
so the pinned Groq model picks the clearest visual form (Mermaid / GFM table /
ASCII tree / prose) in Vietnamese.

No network / LLM / Postgres / Redis access happens:
- The static-string and template assertions read module-level constants directly.
- The behavioral checks mock `get_llm` (capturing the messages that reach the
  chain) and `get_session_history` (in-memory), or mock the chain `.stream`
  entirely behind the SSE endpoint — mirroring the mocking style in
  `test_chat_api.py`.

Validated requirements: 2.7, 3.2, 3.4, 11.3, 11.5.
"""

import json

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda
from langchain_community.chat_message_histories import ChatMessageHistory

from app.main import app
from app.core.rag.chain import (
    ANSWER_SYSTEM,
    DIRECT_SYSTEM,
    RICH_FORMAT_GUIDE,
    answer_prompt,
    direct_prompt,
    build_direct_chain,
    build_rag_answer_chain,
)

client = TestClient(app)


# Key instruction substrings that MUST survive in both system prompts so the
# model knows the markup contract (Mermaid / GFM table / ASCII / Vietnamese /
# no fabrication). Kept verbatim against the design's RICH_FORMAT_GUIDE.
_KEY_SUBSTRINGS = [
    "mermaid",       # lowercase info-string token + example fence
    "bảng Markdown",  # GFM comparison-table rule
    "```text",       # ASCII-art fenced block rule
    "tiếng Việt",    # Vietnamese labels rule
    "KHÔNG bịa",     # no-fabrication / graceful-degradation rule
]


# ---------------------------------------------------------------------------
# Helpers (SSE parsing + fake streaming chain) — mirrors test_chat_api.py
# ---------------------------------------------------------------------------


def parse_sse_events(response_text: str) -> list:
    """Parse SSE response text into a list of event dicts."""
    events = []
    for part in response_text.split("\n\n"):
        part = part.strip()
        if not part:
            continue
        for line in part.split("\n"):
            if line.startswith("data: "):
                try:
                    events.append(json.loads(line[6:]))
                except json.JSONDecodeError:
                    pass
    return events


def _make_answer_chain() -> MagicMock:
    """A mock chain whose .stream yields a fresh iterator each call."""
    chain = MagicMock()
    chain.stream.side_effect = lambda *a, **k: iter(["Xin", " ", "chào"])
    return chain


# ---------------------------------------------------------------------------
# 1. Guide present in BOTH prompts (Req 3.2, 3.4)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("substring", _KEY_SUBSTRINGS)
def test_key_substrings_present_in_answer_system(substring):
    """Every key instruction substring appears in ANSWER_SYSTEM (RAG prompt)."""
    assert substring in ANSWER_SYSTEM


@pytest.mark.parametrize("substring", _KEY_SUBSTRINGS)
def test_key_substrings_present_in_direct_system(substring):
    """Every key instruction substring appears in DIRECT_SYSTEM (direct prompt)."""
    assert substring in DIRECT_SYSTEM


def test_rich_format_guide_appended_to_both_prompts():
    """The shared guide is appended verbatim to both system prompts (Req 3.4).

    Applying the same guidance to the RAG answer prompt and the direct prompt is
    what preserves smart routing while giving both paths rich-format behavior.
    """
    assert RICH_FORMAT_GUIDE in ANSWER_SYSTEM
    assert RICH_FORMAT_GUIDE in DIRECT_SYSTEM


def test_rich_format_guide_has_valid_mermaid_example():
    """The guide ships a syntactically valid example fence the model can mimic."""
    assert "```mermaid" in RICH_FORMAT_GUIDE
    # Example uses bracket node labels (no braces, see no-brace rule below).
    assert "A[Bắt đầu]" in RICH_FORMAT_GUIDE
    assert "B[Đã đăng nhập?]" in RICH_FORMAT_GUIDE


# ---------------------------------------------------------------------------
# 2. Templates still build; {context} placeholder intact (Req 2.7, 3.2)
# ---------------------------------------------------------------------------


def test_guide_contains_no_template_braces():
    """RICH_FORMAT_GUIDE must contain no `{`/`}` so it can be concatenated onto a
    raw system-prompt string without introducing spurious template placeholders.
    """
    assert "{" not in RICH_FORMAT_GUIDE
    assert "}" not in RICH_FORMAT_GUIDE


def test_answer_system_has_single_context_placeholder():
    """`{context}` remains the ONLY placeholder in ANSWER_SYSTEM, exactly once."""
    assert ANSWER_SYSTEM.count("{context}") == 1
    # No other brace-delimited tokens leaked in from the guide.
    assert ANSWER_SYSTEM.count("{") == 1
    assert ANSWER_SYSTEM.count("}") == 1


def test_direct_system_has_no_placeholders():
    """DIRECT_SYSTEM carries no template placeholders (no `{context}`)."""
    assert "{context}" not in DIRECT_SYSTEM
    assert "{" not in DIRECT_SYSTEM
    assert "}" not in DIRECT_SYSTEM


def test_answer_prompt_template_builds_and_formats():
    """`answer_prompt` is a ChatPromptTemplate that still builds and formats with
    `context` as its content variable (Req 2.7, 3.2)."""
    assert isinstance(answer_prompt, ChatPromptTemplate)
    assert "context" in answer_prompt.input_variables
    assert "input" in answer_prompt.input_variables

    messages = answer_prompt.format_messages(
        context="NỘI DUNG TÀI LIỆU", chat_history=[], input="Tóm tắt giúp tôi"
    )
    system_msg = messages[0]
    assert isinstance(system_msg, SystemMessage)
    # The rendered system message embeds the supplied context AND the guide.
    assert "NỘI DUNG TÀI LIỆU" in system_msg.content
    assert RICH_FORMAT_GUIDE in system_msg.content


def test_direct_prompt_template_builds_and_formats():
    """`direct_prompt` is a ChatPromptTemplate that builds and formats without a
    context variable (Req 2.7, 3.2)."""
    assert isinstance(direct_prompt, ChatPromptTemplate)
    assert "context" not in direct_prompt.input_variables
    assert "input" in direct_prompt.input_variables

    messages = direct_prompt.format_messages(chat_history=[], input="Xin chào")
    system_msg = messages[0]
    assert isinstance(system_msg, SystemMessage)
    assert RICH_FORMAT_GUIDE in system_msg.content


# ---------------------------------------------------------------------------
# 3. Behavioral — the guide reaches the chain (Req 3.4, 11.3)
# ---------------------------------------------------------------------------


def _capturing_chain_and_box():
    """Return (fake_llm, captured) where fake_llm records the messages it gets.

    The fake LLM is a Runnable that captures `prompt_value.to_messages()` (what
    a real ChatModel would receive) and returns a trivial AIMessage so the
    downstream StrOutputParser produces a string.
    """
    captured: dict = {}

    def _capture(prompt_value):
        captured["messages"] = prompt_value.to_messages()
        return AIMessage(content="ok")

    return RunnableLambda(_capture), captured


@patch("app.core.rag.chain.get_session_history")
@patch("app.core.rag.chain.get_llm")
def test_direct_chain_system_message_carries_guide(mock_get_llm, mock_history):
    """Building and invoking the direct chain delivers a system message that
    includes RICH_FORMAT_GUIDE to the LLM (Req 3.4)."""
    fake_llm, captured = _capturing_chain_and_box()
    mock_get_llm.return_value = fake_llm
    mock_history.return_value = ChatMessageHistory()

    chain = build_direct_chain()
    result = chain.invoke(
        {"input": "Mô tả quy trình đăng nhập"},
        config={"configurable": {"session_id": "rich-direct"}},
    )
    assert result == "ok"

    system_msg = captured["messages"][0]
    assert isinstance(system_msg, SystemMessage)
    assert RICH_FORMAT_GUIDE in system_msg.content
    for substring in _KEY_SUBSTRINGS:
        assert substring in system_msg.content


@patch("app.core.rag.chain.get_session_history")
@patch("app.core.rag.chain.get_llm")
def test_rag_answer_chain_system_message_carries_guide(mock_get_llm, mock_history):
    """Building and invoking the RAG answer chain also delivers a system message
    that includes RICH_FORMAT_GUIDE — smart routing keeps both paths rich
    (Req 3.4)."""
    fake_llm, captured = _capturing_chain_and_box()
    mock_get_llm.return_value = fake_llm
    mock_history.return_value = ChatMessageHistory()

    chain = build_rag_answer_chain()
    result = chain.invoke(
        {"input": "Tóm tắt tài liệu", "context": "NỘI DUNG TRÍCH"},
        config={"configurable": {"session_id": "rich-rag"}},
    )
    assert result == "ok"

    system_msg = captured["messages"][0]
    assert isinstance(system_msg, SystemMessage)
    assert RICH_FORMAT_GUIDE in system_msg.content
    # The retrieved context still flows into the same system message.
    assert "NỘI DUNG TRÍCH" in system_msg.content


# ---------------------------------------------------------------------------
# 4. Behavioral — SSE event contract unchanged (Req 2.7, 11.3, 11.5)
# ---------------------------------------------------------------------------


@patch("app.api.routes.chat.get_direct_chain")
@patch("app.api.routes.chat.list_documents")
def test_sse_event_types_unchanged_with_rich_guide(mock_list, mock_direct):
    """The rich-format guidance does not introduce new SSE event types: a chat
    request still streams only `start`, `token`, and `end` (Req 2.7, 11.5)."""
    mock_list.return_value = []  # empty room → direct chain path
    mock_direct.return_value = _make_answer_chain()

    response = client.post(
        "/api/chat", json={"question": "Xin chào", "room_code": "RICHROOM"}
    )
    assert response.status_code == 200

    events = parse_sse_events(response.text)
    event_types = {e["event"] for e in events}

    # Exactly the legacy happy-path event types — no new types added.
    assert event_types == {"start", "token", "end"}
    # And never anything outside the allowed contract set.
    assert event_types <= {"start", "token", "end", "error"}
