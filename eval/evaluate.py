"""
RAGAS evaluation module for the RAG Chatbot — quality gate.

Metrics evaluated:
  - faithfulness      : Are claims in the answer grounded in the retrieved context?
  - answer_relevancy  : Is the answer relevant to the question?
  - context_precision : Are the retrieved docs actually useful for the question?

This module is the **quality gate**: it runs RAGAS against a Golden_Set and
compares each metric to a threshold read from a single source of truth
(``Settings``). The CLI maps the result to a process exit code:

    PASS    → 0     (every metric >= its threshold)
    FAIL    → 1     (at least one metric below its threshold)
    SKIPPED → 2     (missing prerequisite: no OPENAI_API_KEY, or no ingested data)

RAGAS uses **OpenAI** models (judge + embeddings) configured separately from
the application's Groq LLM / HuggingFace embeddings:
  - LLM judge   : ``settings.RAGAS_LLM_MODEL``        (default ``gpt-4o-mini``)
  - embeddings  : ``settings.RAGAS_EMBEDDING_MODEL``  (default ``text-embedding-3-small``)

Usage (standalone script):
    python eval/evaluate.py --input eval/sample_questions.json

Usage (from Python):
    from eval.evaluate import run_evaluation
    results = run_evaluation(qa_pairs)

JSON input format:
    [
      {
        "question": "What is RAG?",
        "ground_truth": "RAG stands for Retrieval-Augmented Generation ..."
      },
      ...
    ]
"""

import argparse
import json
import logging
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, List, Literal, Tuple

# Add backend to sys.path so we can import app modules
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "backend"))

logger = logging.getLogger(__name__)

#: Quality-gate status returned by ``run_evaluation``.
EvalStatus = Literal["PASS", "FAIL", "SKIPPED"]

#: Default Golden_Set path (Requirement 9.4).
DEFAULT_INPUT_PATH = ROOT / "eval" / "sample_questions.json"

#: The three core RAGAS metrics this gate evaluates.
_METRIC_NAMES: Tuple[str, ...] = (
    "faithfulness",
    "answer_relevancy",
    "context_precision",
)

#: CLI exit codes for each quality-gate status (Requirement 11.2, 11.3).
_EXIT_CODES: Dict[str, int] = {
    "PASS": 0,
    "FAIL": 1,
    "SKIPPED": 2,
}


# ---------------------------------------------------------------------------
# Prerequisite guard (Requirement 2)
# ---------------------------------------------------------------------------


def _require_openai_api_key() -> None:
    """Ensure ``OPENAI_API_KEY`` is configured before any OpenAI API call.

    RAGAS judges answers with an OpenAI model, so a missing key is a hard
    prerequisite. When the key is blank/whitespace this logs a warning and
    raises ``ValueError`` with a Vietnamese message, stopping *before* any
    client is constructed (Requirement 2.1–2.4). The original cause is not
    swallowed and no fake score is produced.
    """
    from app.config import settings

    if not settings.OPENAI_API_KEY or not settings.OPENAI_API_KEY.strip():
        logger.warning(
            "Thiếu OPENAI_API_KEY — không thể chạy đánh giá RAGAS (điều kiện tiên quyết)."
        )
        raise ValueError(
            "OPENAI_API_KEY là điều kiện tiên quyết để chạy đánh giá RAGAS. "
            "Hãy đặt OPENAI_API_KEY trong backend/.env trước khi chạy."
        )


# ---------------------------------------------------------------------------
# RAGAS components (Requirement 1)
# ---------------------------------------------------------------------------


def _build_ragas_components(selected_metrics: List[Any]) -> None:
    """Attach OpenAI judge + embeddings to the given RAGAS metrics.

    Uses ``settings.RAGAS_LLM_MODEL`` / ``settings.RAGAS_EMBEDDING_MODEL`` — the
    OpenAI models reserved for evaluation — **not** the application's
    ``LLM_MODEL`` (Groq) or ``EMBEDDING_MODEL`` (HuggingFace). This is the fix
    for Bug 1 and Bug 2 (Requirement 1.1, 1.4, 1.6).
    """
    from langchain_openai import ChatOpenAI, OpenAIEmbeddings
    from ragas.embeddings import LangchainEmbeddingsWrapper
    from ragas.llms import LangchainLLMWrapper

    from app.config import settings

    llm = LangchainLLMWrapper(
        ChatOpenAI(
            model=settings.RAGAS_LLM_MODEL,
            temperature=0,
            openai_api_key=settings.OPENAI_API_KEY,
        )
    )
    embeddings = LangchainEmbeddingsWrapper(
        OpenAIEmbeddings(
            model=settings.RAGAS_EMBEDDING_MODEL,
            openai_api_key=settings.OPENAI_API_KEY,
        )
    )

    for metric in selected_metrics:
        metric.llm = llm
        if hasattr(metric, "embeddings"):
            metric.embeddings = embeddings


def get_ragas_thresholds() -> Dict[str, float]:
    """Return the per-metric PASS thresholds from the single config source.

    Reading from ``Settings`` keeps the CLI gate and the ``/api/eval`` endpoint
    aligned (Requirement 10.5) and lets CI tune thresholds via env without code
    changes.
    """
    from app.config import settings

    return {
        "faithfulness": settings.RAGAS_THRESHOLD_FAITHFULNESS,
        "answer_relevancy": settings.RAGAS_THRESHOLD_ANSWER_RELEVANCY,
        "context_precision": settings.RAGAS_THRESHOLD_CONTEXT_PRECISION,
    }


# ---------------------------------------------------------------------------
# Dataset construction (single retrieval per question)
# ---------------------------------------------------------------------------


def _build_ragas_dataset(qa_pairs: List[Dict[str, str]]) -> Tuple[Any, int]:
    """Run the RAG pipeline on each question and build a RAGAS dataset.

    For each question the pipeline retrieves **exactly once** via
    ``contextualize_question`` + ``retrieve_docs`` (filtered to
    ``settings.RAGAS_EVAL_ROOM_CODE``), so ``retrieved_contexts`` are the page
    contents of those very documents. Questions that error out are logged
    (``logger.error``) and skipped — the cause is not swallowed.

    Returns:
        A tuple ``(dataset, contextful_count)`` where ``contextful_count`` is
        the number of samples whose ``retrieved_contexts`` is non-empty.
    """
    from ragas import EvaluationDataset, SingleTurnSample

    from app.config import settings
    from app.core.rag.chain import (
        contextualize_question,
        get_rag_answer_chain,
        format_docs,
        retrieve_docs,
    )

    answer_chain = get_rag_answer_chain()
    room_code = settings.RAGAS_EVAL_ROOM_CODE
    samples: List[Any] = []
    contextful_count = 0

    for i, pair in enumerate(qa_pairs):
        question = pair["question"]
        ground_truth = pair.get("ground_truth", "")

        logger.info("Evaluating [%d/%d]: %s...", i + 1, len(qa_pairs), question[:60])

        try:
            # Fresh session per question — contextualize reads history read-only.
            session_id = f"eval-{uuid.uuid4()}"
            standalone_q = contextualize_question(question, session_id)

            # Single retrieval — both context and citations come from these docs.
            docs = retrieve_docs(standalone_q, room_code=room_code)
            retrieved_contexts = [doc.page_content for doc in docs]

            context = format_docs(docs)
            answer = answer_chain.invoke(
                {"input": question, "context": context},
                config={"configurable": {"session_id": session_id}},
            )

            samples.append(
                SingleTurnSample(
                    user_input=question,
                    response=answer,
                    retrieved_contexts=retrieved_contexts,
                    reference=ground_truth or None,
                )
            )
            if retrieved_contexts:
                contextful_count += 1

        except Exception as exc:  # noqa: BLE001 — log + skip this question, do not swallow
            logger.error(
                "Bỏ qua câu hỏi '%s...' do lỗi khi build dataset: %s",
                question[:40],
                exc,
            )

    return EvaluationDataset(samples=samples), contextful_count


# ---------------------------------------------------------------------------
# Quality gate (Requirement 10)
# ---------------------------------------------------------------------------


def evaluate_quality_gate(scores: Dict[str, float]) -> Tuple[EvalStatus, Dict[str, bool]]:
    """Compare each metric score against its threshold.

    Pure function: ``status`` is ``"PASS"`` only when every present metric is
    ``>=`` its threshold, otherwise ``"FAIL"``. ``passed_map`` records the
    per-metric verdict (Requirement 10.1, 10.5).
    """
    thresholds = get_ragas_thresholds()
    passed_map: Dict[str, bool] = {
        metric: float(score) >= thresholds.get(metric, 0.0)
        for metric, score in scores.items()
    }
    status: EvalStatus = "PASS" if all(passed_map.values()) else "FAIL"
    return status, passed_map


# ---------------------------------------------------------------------------
# Top-level evaluation
# ---------------------------------------------------------------------------


def run_evaluation(
    qa_pairs: List[Dict[str, str]],
    metrics: List[str] | None = None,
) -> Dict[str, Any]:
    """Run the RAGAS quality gate on a list of QA pairs.

    Args:
        qa_pairs: List of ``{"question": ..., "ground_truth": ...}`` dicts.
        metrics: Which metrics to run. Defaults to all three core metrics.

    Returns:
        When evaluation runs (PASS/FAIL)::

            {"status", "sample_count", "metrics", "passed", "thresholds"}

        When skipped due to a missing prerequisite (no ingested data)::

            {"status": "SKIPPED", "reason": str, "sample_count": int}

    Raises:
        ValueError: If ``OPENAI_API_KEY`` is missing (prerequisite guard).
    """
    # Prerequisite guard FIRST — before building dataset / constructing clients.
    _require_openai_api_key()

    from ragas import evaluate
    from ragas.metrics import answer_relevancy, context_precision, faithfulness

    from app.config import settings

    metric_registry = {
        "faithfulness": faithfulness,
        "answer_relevancy": answer_relevancy,
        "context_precision": context_precision,
    }

    selected_metric_names = metrics or list(metric_registry.keys())
    selected_metrics = [
        metric_registry[m] for m in selected_metric_names if m in metric_registry
    ]

    # Build dataset (single retrieval per question, in the eval room).
    logger.info("Building evaluation dataset for %d questions...", len(qa_pairs))
    dataset, contextful_count = _build_ragas_dataset(qa_pairs)

    # No ingested data → SKIPPED (prerequisite), distinct from FAIL (Req 11).
    if contextful_count == 0:
        return {
            "status": "SKIPPED",
            "reason": (
                f"Chưa có dữ liệu đã ingest trong room '{settings.RAGAS_EVAL_ROOM_CODE}' "
                "— hãy chạy eval/ingest_sample_corpus.py trước."
            ),
            "sample_count": len(dataset.samples),
        }

    # Attach OpenAI judge + embeddings (uses RAGAS_* models, not app models).
    _build_ragas_components(selected_metrics)

    logger.info("Running RAGAS evaluation (%s)...", selected_metric_names)
    result = evaluate(dataset=dataset, metrics=selected_metrics)

    raw_scores = result.to_pandas().mean(numeric_only=True).to_dict()
    metric_scores = {
        m: round(float(raw_scores[m]), 4)
        for m in selected_metric_names
        if m in raw_scores
    }

    status, passed_map = evaluate_quality_gate(metric_scores)
    thresholds = get_ragas_thresholds()

    return {
        "status": status,
        "sample_count": len(dataset.samples),
        "metrics": metric_scores,
        "passed": passed_map,
        "thresholds": {m: thresholds[m] for m in metric_scores},
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def _print_results(results: Dict[str, Any]) -> None:
    """Print scores and per-metric PASS/FAIL status (Requirement 10.4)."""
    status = results.get("status", "UNKNOWN")
    print("\n=== RAGAS Evaluation Results ===")
    print(f"Status       : {status}")
    print(f"Sample count : {results.get('sample_count', 0)}")

    if status == "SKIPPED":
        print(f"Reason       : {results.get('reason', 'unknown')}")
        return

    metrics = results.get("metrics", {})
    passed = results.get("passed", {})
    thresholds = results.get("thresholds", {})
    if metrics:
        print("\nScores:")
        for metric, score in metrics.items():
            verdict = "PASS" if passed.get(metric, False) else "FAIL"
            threshold = thresholds.get(metric, 0.0)
            print(f"  {metric:<25} {score:.4f}  (>= {threshold})  [{verdict}]")


def _cli() -> int:
    """Run the CLI gate and return a process exit code.

    Exit codes: PASS → 0, FAIL → 1, SKIPPED → 2. A missing ``OPENAI_API_KEY``
    (``ValueError``) is caught here, logged, and mapped to exit 2 (prerequisite),
    never to the FAIL code (Requirement 11.2, 11.3).
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    parser = argparse.ArgumentParser(
        description="Run RAGAS evaluation on the RAG chatbot"
    )
    parser.add_argument(
        "--input",
        "-i",
        default=str(DEFAULT_INPUT_PATH),
        help="Path to JSON file with QA pairs",
    )
    parser.add_argument(
        "--output",
        "-o",
        default=None,
        help="Optional: save results to JSON file",
    )
    parser.add_argument(
        "--metrics",
        "-m",
        nargs="+",
        default=None,
        choices=list(_METRIC_NAMES),
        help="Which metrics to evaluate (default: all)",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"[ERROR] Input file not found: {input_path}")
        return _EXIT_CODES["SKIPPED"]

    qa_pairs = json.loads(input_path.read_text(encoding="utf-8"))
    print(f"Loaded {len(qa_pairs)} QA pairs from {input_path}")

    try:
        results = run_evaluation(qa_pairs, metrics=args.metrics)
    except ValueError as exc:
        # Missing prerequisite (e.g. OPENAI_API_KEY) — not a threshold FAIL.
        logger.error("Bỏ qua đánh giá do thiếu điều kiện tiên quyết: %s", exc)
        print(f"\n[SKIPPED] {exc}")
        return _EXIT_CODES["SKIPPED"]

    _print_results(results)

    if args.output:
        out_path = Path(args.output)
        out_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
        print(f"\nResults saved to {out_path}")

    return _EXIT_CODES.get(results.get("status", "SKIPPED"), _EXIT_CODES["SKIPPED"])


if __name__ == "__main__":
    sys.exit(_cli())
