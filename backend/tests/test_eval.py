"""
Tests for the RAGAS evaluation quality gate (feature: rag-quality-upgrade).

This module currently covers the "settings" smoke checks that keep the typed
``Settings`` model and ``backend/.env.example`` in sync for every ``RAGAS_*``
configuration key. Keeping both sources aligned prevents the evaluation gate
from silently drifting between the CLI and the API endpoint.
"""

from pathlib import Path

from app.config import Settings, settings


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

#: Absolute path to ``backend/.env.example`` (two levels up from this file).
_ENV_EXAMPLE_PATH: Path = Path(__file__).resolve().parent.parent / ".env.example"

#: The six RAGAS settings introduced by the rag-quality-upgrade feature and
#: their expected default values on the ``Settings`` model.
_EXPECTED_RAGAS_DEFAULTS: dict[str, object] = {
    "RAGAS_EMBEDDING_MODEL": "text-embedding-3-small",
    "RAGAS_LLM_MODEL": "gpt-4o-mini",
    "RAGAS_EVAL_ROOM_CODE": "eval",
    "RAGAS_THRESHOLD_FAITHFULNESS": 0.9,
    "RAGAS_THRESHOLD_ANSWER_RELEVANCY": 0.8,
    "RAGAS_THRESHOLD_CONTEXT_PRECISION": 0.75,
}


def _parse_env_example_keys(prefix: str) -> set[str]:
    """Return the set of ``KEY`` names in ``.env.example`` starting with ``prefix``.

    Lines are expected in ``KEY=value`` form; blank lines and ``#`` comments are
    ignored. Only the portion before the first ``=`` is treated as the key.
    """
    keys: set[str] = set()
    content = _ENV_EXAMPLE_PATH.read_text(encoding="utf-8")
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key = line.split("=", 1)[0].strip()
        if key.startswith(prefix):
            keys.add(key)
    return keys


# ---------------------------------------------------------------------------
# Settings smoke tests
# ---------------------------------------------------------------------------


def test_settings_has_ragas_fields_with_expected_defaults() -> None:
    """All six RAGAS_* fields exist on ``settings`` with the documented defaults."""
    for field_name, expected_value in _EXPECTED_RAGAS_DEFAULTS.items():
        assert hasattr(settings, field_name), f"Settings thiếu trường {field_name}"
        actual_value = getattr(settings, field_name)
        assert actual_value == expected_value, (
            f"{field_name} mặc định lệch: {actual_value!r} != {expected_value!r}"
        )


def test_settings_ragas_fields_are_declared_in_model() -> None:
    """The RAGAS_* fields are declared (typed) on the ``Settings`` model itself."""
    for field_name in _EXPECTED_RAGAS_DEFAULTS:
        assert field_name in Settings.model_fields, (
            f"Settings.model_fields thiếu trường {field_name}"
        )


def test_settings_in_sync_with_env_example_for_ragas_keys() -> None:
    """Every RAGAS_* key in ``.env.example`` maps to a field in ``Settings``.

    Guards against drift where a key is documented in ``.env.example`` but never
    declared on the typed ``Settings`` model (or vice versa).
    """
    env_keys = _parse_env_example_keys("RAGAS_")
    model_fields = set(Settings.model_fields)

    # Every documented RAGAS_* key must have a matching Settings field.
    missing_in_settings = env_keys - model_fields
    assert not missing_in_settings, (
        f".env.example có key RAGAS_* không khai báo trong Settings: {missing_in_settings}"
    )

    # The six expected RAGAS fields must all be documented in .env.example.
    expected_keys = set(_EXPECTED_RAGAS_DEFAULTS)
    missing_in_env = expected_keys - env_keys
    assert not missing_in_env, (
        f"Settings có trường RAGAS_* không tài liệu hóa trong .env.example: {missing_in_env}"
    )


# ===========================================================================
# Step 2 — RAGAS quality gate (eval/evaluate.py + routes/eval.py)
# ===========================================================================
#
# These tests reflect the post-fix behavior:
#   - Bug 1/Bug 2: RAGAS judge + embeddings use RAGAS_LLM_MODEL /
#     RAGAS_EMBEDDING_MODEL, never the app's Groq LLM_MODEL / HuggingFace
#     EMBEDDING_MODEL.
#   - Missing OPENAI_API_KEY → run_evaluation raises ValueError (Vietnamese)
#     before constructing any OpenAI client, with a logged warning.
#   - Property 11: per-metric threshold comparison.
#   - Property 12: status → exit-code mapping is pairwise distinct.
#   - Unified thresholds + endpoint status (no 500 on SKIPPED / missing key).
#
# All OpenAI / ragas dependencies are mocked — no network access.

import logging  # noqa: E402
import sys  # noqa: E402
import json  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from hypothesis import given, settings as hyp_settings, strategies as st  # noqa: E402

# Make the namespace package `eval` importable (repo root on sys.path).
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from app.main import app  # noqa: E402
from eval.evaluate import (  # noqa: E402
    DEFAULT_INPUT_PATH,
    _EXIT_CODES,
    _build_ragas_components,
    _cli,
    evaluate_quality_gate,
    get_ragas_thresholds,
    run_evaluation,
)


# ---------------------------------------------------------------------------
# TASK 3.1 — Bug 1 / Bug 2 regression + missing-key guard
# ---------------------------------------------------------------------------


def test_build_ragas_components_uses_ragas_models_not_app_models() -> None:
    """RAGAS judge + embeddings must use the RAGAS_* OpenAI models, never the
    application's Groq LLM_MODEL or HuggingFace EMBEDDING_MODEL (Bug 1 + Bug 2).

    Reflects Requirements 1.1, 1.4, 1.6.
    """
    metric = MagicMock()

    with (
        patch("langchain_openai.ChatOpenAI") as mock_chat,
        patch("langchain_openai.OpenAIEmbeddings") as mock_emb,
    ):
        _build_ragas_components([metric])

    # ChatOpenAI judge → RAGAS_LLM_MODEL (gpt-4o-mini), NOT the Groq LLM_MODEL.
    assert mock_chat.call_count == 1
    chat_kwargs = mock_chat.call_args.kwargs
    assert chat_kwargs["model"] == settings.RAGAS_LLM_MODEL
    assert chat_kwargs["model"] != settings.LLM_MODEL

    # OpenAIEmbeddings → RAGAS_EMBEDDING_MODEL, NOT the HuggingFace EMBEDDING_MODEL.
    assert mock_emb.call_count == 1
    emb_kwargs = mock_emb.call_args.kwargs
    assert emb_kwargs["model"] == settings.RAGAS_EMBEDDING_MODEL
    assert emb_kwargs["model"] != settings.EMBEDDING_MODEL

    # The metric was wired with both the judge and the embeddings.
    assert metric.llm is not None
    assert metric.embeddings is not None


def test_run_evaluation_missing_openai_key_raises_value_error(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Blank/whitespace OPENAI_API_KEY → run_evaluation raises ValueError with a
    Vietnamese message, BEFORE any OpenAI client is constructed, and logs a
    warning. Reflects Requirements 2.1, 2.2, 2.3, 2.4.
    """
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "   ")

    with (
        patch("langchain_openai.ChatOpenAI") as mock_chat,
        patch("langchain_openai.OpenAIEmbeddings") as mock_emb,
        caplog.at_level(logging.WARNING),
    ):
        with pytest.raises(ValueError) as excinfo:
            run_evaluation([{"question": "Câu hỏi?", "ground_truth": "Đáp án"}])

    message = str(excinfo.value)
    assert "OPENAI_API_KEY" in message
    assert "điều kiện tiên quyết" in message

    # Stopped before constructing any OpenAI client (Requirement 2.2).
    mock_chat.assert_not_called()
    mock_emb.assert_not_called()

    # A warning was logged about the missing prerequisite (Requirement 2.4).
    assert any(record.levelno == logging.WARNING for record in caplog.records)


# ---------------------------------------------------------------------------
# TASK 3.5 — Property 11
# ---------------------------------------------------------------------------

_metric_score = st.floats(
    min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False
)


# Feature: rag-quality-upgrade, Property 11: Cổng chất lượng so từng metric với ngưỡng riêng
@given(faithfulness=_metric_score, answer_relevancy=_metric_score, context_precision=_metric_score)
@hyp_settings(max_examples=100, deadline=None)
def test_property_11_quality_gate_per_metric_threshold(
    faithfulness: float, answer_relevancy: float, context_precision: float
) -> None:
    """For any score vector in [0,1], passed[m] holds iff score[m] >= threshold[m],
    with thresholds read from the unified config source (Settings).

    Validates: Requirements 10.1, 10.5

    `evaluate_quality_gate` is a pure function — it touches neither the OpenAI
    client nor ragas.evaluate, so no network call is possible here.
    """
    scores = {
        "faithfulness": faithfulness,
        "answer_relevancy": answer_relevancy,
        "context_precision": context_precision,
    }

    status, passed = evaluate_quality_gate(scores)
    thresholds = get_ragas_thresholds()

    for metric, score in scores.items():
        assert passed[metric] == (score >= thresholds[metric])

    assert status == ("PASS" if all(passed.values()) else "FAIL")


# ---------------------------------------------------------------------------
# TASK 3.6 — Property 12
# ---------------------------------------------------------------------------


# Feature: rag-quality-upgrade, Property 12: Ánh xạ trạng thái → mã thoát rời nhau và đúng nghĩa
@given(case=st.sampled_from(["PASS", "FAIL", "SKIPPED", "SKIPPED_KEY"]))
@hyp_settings(max_examples=100, deadline=None)
def test_property_12_status_to_exit_code_mapping(case: str) -> None:
    """PASS→0, FAIL→1, SKIPPED→2; the three exit codes are pairwise distinct so
    SKIPPED never shares FAIL's code. run_evaluation is fully mocked (no network).

    Validates: Requirements 10.2, 10.3, 11.2, 11.3
    """
    # The exit-code map itself is injective and keeps SKIPPED != FAIL.
    assert len(set(_EXIT_CODES.values())) == 3
    assert _EXIT_CODES["SKIPPED"] != _EXIT_CODES["FAIL"]

    side_effect = None
    if case == "PASS":
        result = {
            "status": "PASS",
            "sample_count": 3,
            "metrics": {"faithfulness": 0.95},
            "passed": {"faithfulness": True},
            "thresholds": {"faithfulness": 0.9},
        }
        expected_code = _EXIT_CODES["PASS"]
    elif case == "FAIL":
        result = {
            "status": "FAIL",
            "sample_count": 3,
            "metrics": {"faithfulness": 0.10},
            "passed": {"faithfulness": False},
            "thresholds": {"faithfulness": 0.9},
        }
        expected_code = _EXIT_CODES["FAIL"]
    elif case == "SKIPPED":
        result = {"status": "SKIPPED", "reason": "Chưa ingest", "sample_count": 0}
        expected_code = _EXIT_CODES["SKIPPED"]
    else:  # SKIPPED_KEY — run_evaluation raises ValueError (missing key)
        result = None
        side_effect = ValueError("OPENAI_API_KEY là điều kiện tiên quyết ...")
        expected_code = _EXIT_CODES["SKIPPED"]

    argv = ["evaluate.py", "--input", str(DEFAULT_INPUT_PATH)]
    with patch.object(sys, "argv", argv):
        if side_effect is not None:
            with patch("eval.evaluate.run_evaluation", side_effect=side_effect):
                exit_code = _cli()
        else:
            with patch("eval.evaluate.run_evaluation", return_value=result):
                exit_code = _cli()

    assert exit_code == expected_code
    # SKIPPED (key or data) must never collide with the FAIL exit code.
    if case in ("SKIPPED", "SKIPPED_KEY"):
        assert exit_code != _EXIT_CODES["FAIL"]


# ---------------------------------------------------------------------------
# TASK 3.7 — Unified thresholds + endpoint status reflection
# ---------------------------------------------------------------------------

_eval_client = TestClient(app)


def test_get_ragas_thresholds_matches_settings() -> None:
    """The CLI/endpoint share one threshold source: get_ragas_thresholds() reads
    exactly the RAGAS_THRESHOLD_* fields on Settings. Reflects Requirement 10.5.
    """
    assert get_ragas_thresholds() == {
        "faithfulness": settings.RAGAS_THRESHOLD_FAITHFULNESS,
        "answer_relevancy": settings.RAGAS_THRESHOLD_ANSWER_RELEVANCY,
        "context_precision": settings.RAGAS_THRESHOLD_CONTEXT_PRECISION,
    }


def _post_eval(payload: dict):
    return _eval_client.post("/api/eval", json=payload)


def test_endpoint_reflects_pass_status_with_unified_thresholds() -> None:
    """PASS → HTTP 200, status PASS, per-metric threshold from Settings."""
    result = {
        "status": "PASS",
        "sample_count": 2,
        "metrics": {
            "faithfulness": 0.95,
            "answer_relevancy": 0.90,
            "context_precision": 0.85,
        },
        "passed": {
            "faithfulness": True,
            "answer_relevancy": True,
            "context_precision": True,
        },
        "thresholds": get_ragas_thresholds(),
    }

    with patch("eval.evaluate.run_evaluation", return_value=result):
        response = _post_eval({"samples": [{"question": "q", "ground_truth": "g"}]})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "PASS"
    assert body["sample_count"] == 2
    assert body["metrics"]["faithfulness"]["score"] == 0.95
    assert body["metrics"]["faithfulness"]["passed"] is True
    assert (
        body["metrics"]["faithfulness"]["threshold"]
        == settings.RAGAS_THRESHOLD_FAITHFULNESS
    )


def test_endpoint_reflects_fail_status() -> None:
    """FAIL → HTTP 200, status FAIL."""
    result = {
        "status": "FAIL",
        "sample_count": 2,
        "metrics": {
            "faithfulness": 0.40,
            "answer_relevancy": 0.90,
            "context_precision": 0.85,
        },
        "passed": {
            "faithfulness": False,
            "answer_relevancy": True,
            "context_precision": True,
        },
        "thresholds": get_ragas_thresholds(),
    }

    with patch("eval.evaluate.run_evaluation", return_value=result):
        response = _post_eval({"samples": [{"question": "q", "ground_truth": "g"}]})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "FAIL"
    assert body["metrics"]["faithfulness"]["passed"] is False


def test_endpoint_skipped_when_no_ingested_data_is_200() -> None:
    """SKIPPED (no ingested data) → HTTP 200, status SKIPPED, empty metrics,
    error carries the prerequisite reason. Never a 500."""
    result = {
        "status": "SKIPPED",
        "reason": "Chưa có dữ liệu đã ingest trong room 'eval' — hãy chạy ...",
        "sample_count": 0,
    }

    with patch("eval.evaluate.run_evaluation", return_value=result):
        response = _post_eval({"samples": [{"question": "q", "ground_truth": "g"}]})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "SKIPPED"
    assert body["metrics"] == {}
    assert body["error"] == result["reason"]


def test_endpoint_missing_key_is_skipped_not_500() -> None:
    """Missing OPENAI_API_KEY (run_evaluation raises ValueError) → HTTP 200 with
    status SKIPPED and the exception message in `error`, NOT a 500.
    Reflects Requirements 2.1, 11.1, 11.2.
    """
    message = (
        "OPENAI_API_KEY là điều kiện tiên quyết để chạy đánh giá RAGAS. "
        "Hãy đặt OPENAI_API_KEY trong backend/.env trước khi chạy."
    )

    with patch("eval.evaluate.run_evaluation", side_effect=ValueError(message)):
        response = _post_eval({"samples": [{"question": "q", "ground_truth": "g"}]})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "SKIPPED"
    assert "OPENAI_API_KEY" in body["error"]


# ===========================================================================
# Step 5 — Golden_Set: size, schema, default path, and --input override
# ===========================================================================
#
# These tests guard Requirement 9:
#   9.1 — at least 20 {question, ground_truth} pairs
#   9.2 — the CLI accepts an --input override pointing at another Golden_Set
#   9.3 — JSON array of objects, each with non-empty `question` + `ground_truth`
#   9.4 — the default input path is eval/sample_questions.json
#
# No network / Postgres: run_evaluation is fully mocked for the override test.


def _load_golden_set() -> list[dict[str, str]]:
    """Load and return the default Golden_Set as parsed JSON."""
    raw = DEFAULT_INPUT_PATH.read_text(encoding="utf-8")
    return json.loads(raw)


def test_golden_set_exists_and_is_a_list() -> None:
    """The default Golden_Set file exists and parses to a JSON list (Req 9.3)."""
    assert DEFAULT_INPUT_PATH.exists(), (
        f"Golden_Set không tồn tại tại {DEFAULT_INPUT_PATH}"
    )
    golden_set = _load_golden_set()
    assert isinstance(golden_set, list), "Golden_Set phải là một mảng JSON"


def test_golden_set_has_at_least_20_pairs() -> None:
    """The Golden_Set contains at least 20 QA pairs (Requirement 9.1)."""
    golden_set = _load_golden_set()
    assert len(golden_set) >= 20, (
        f"Golden_Set cần >=20 câu hỏi, hiện có {len(golden_set)}"
    )


def test_golden_set_every_item_has_nonempty_question_and_ground_truth() -> None:
    """Each item is an object with non-empty `question` and `ground_truth`
    string fields (Requirements 9.1, 9.3)."""
    golden_set = _load_golden_set()
    for index, item in enumerate(golden_set):
        assert isinstance(item, dict), f"Phần tử {index} không phải object"
        assert set(item.keys()) == {"question", "ground_truth"}, (
            f"Phần tử {index} phải có đúng 2 khóa question/ground_truth, "
            f"hiện có {sorted(item.keys())}"
        )

        question = item["question"]
        assert isinstance(question, str) and question.strip(), (
            f"Phần tử {index}: 'question' phải là chuỗi không rỗng"
        )

        ground_truth = item["ground_truth"]
        assert isinstance(ground_truth, str) and ground_truth.strip(), (
            f"Phần tử {index}: 'ground_truth' phải là chuỗi không rỗng"
        )


def test_golden_set_default_input_path_points_to_sample_questions() -> None:
    """DEFAULT_INPUT_PATH resolves to eval/sample_questions.json (Req 9.4)."""
    assert DEFAULT_INPUT_PATH.name == "sample_questions.json"
    assert DEFAULT_INPUT_PATH.parent.name == "eval"


def test_golden_set_cli_input_default_is_sample_questions() -> None:
    """The CLI argparse `--input` option defaults to the Golden_Set path (Req 9.4).

    Verifies the parser's default by invoking _cli() with no --input and a
    fully mocked run_evaluation, then asserting the loaded count matches the
    default Golden_Set.
    """
    golden_set = _load_golden_set()

    captured: dict[str, object] = {}

    def _fake_run_evaluation(
        qa_pairs: list[dict[str, str]], metrics: list[str] | None = None
    ) -> dict[str, object]:
        captured["count"] = len(qa_pairs)
        return {
            "status": "PASS",
            "sample_count": len(qa_pairs),
            "metrics": {"faithfulness": 0.95},
            "passed": {"faithfulness": True},
            "thresholds": {"faithfulness": 0.9},
        }

    argv = ["evaluate.py"]  # no --input → must fall back to DEFAULT_INPUT_PATH
    with patch.object(sys, "argv", argv):
        with patch("eval.evaluate.run_evaluation", side_effect=_fake_run_evaluation):
            exit_code = _cli()

    assert exit_code == _EXIT_CODES["PASS"]
    assert captured["count"] == len(golden_set)


def test_golden_set_cli_input_override_reads_other_file(tmp_path: Path) -> None:
    """`--input` overrides the default Golden_Set path (Requirement 9.2).

    Writes a temporary Golden_Set with a single pair, runs _cli() with
    --input pointing at it, and asserts run_evaluation received that one pair
    (not the 20+ from the default file). run_evaluation is mocked — no network.
    """
    override_pairs = [{"question": "Câu hỏi tạm?", "ground_truth": "Đáp án tạm."}]
    override_path = tmp_path / "custom_golden_set.json"
    override_path.write_text(
        json.dumps(override_pairs, ensure_ascii=False), encoding="utf-8"
    )

    captured: dict[str, object] = {}

    def _fake_run_evaluation(
        qa_pairs: list[dict[str, str]], metrics: list[str] | None = None
    ) -> dict[str, object]:
        captured["pairs"] = qa_pairs
        return {
            "status": "PASS",
            "sample_count": len(qa_pairs),
            "metrics": {"faithfulness": 0.95},
            "passed": {"faithfulness": True},
            "thresholds": {"faithfulness": 0.9},
        }

    argv = ["evaluate.py", "--input", str(override_path)]
    with patch.object(sys, "argv", argv):
        with patch("eval.evaluate.run_evaluation", side_effect=_fake_run_evaluation):
            exit_code = _cli()

    assert exit_code == _EXIT_CODES["PASS"]
    assert captured["pairs"] == override_pairs
    assert len(captured["pairs"]) == 1
