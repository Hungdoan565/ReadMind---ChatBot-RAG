"""
Evaluation endpoint — POST /api/eval
Run RAGAS metrics on a set of QA pairs against the RAG pipeline.
"""

import logging
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


# --- Schemas (eval-specific, not in main schemas.py) ---


class EvalPair(BaseModel):
    question: str
    ground_truth: Optional[str] = None


class EvalRequest(BaseModel):
    samples: List[EvalPair]
    metrics: Optional[List[str]] = None  # defaults to all 3 metrics


class EvalMetricResult(BaseModel):
    score: float
    passed: bool
    threshold: float


class EvalResponse(BaseModel):
    sample_count: int
    metrics: Dict[str, EvalMetricResult]
    error: Optional[str] = None


@router.post("/eval", response_model=EvalResponse)
async def evaluate(request: EvalRequest):
    """
    Run RAGAS evaluation against the live RAG pipeline.

    Provide a list of questions (and optionally ground truth answers).
    The endpoint runs the full RAG pipeline on each question, then
    scores the results using RAGAS metrics.

    Thresholds:
      - faithfulness      >= 0.90 (PASS)
      - answer_relevancy  >= 0.80 (PASS)
      - context_precision >= 0.75 (PASS)

    Note: This endpoint makes LLM API calls proportional to sample count.
    Typical cost: ~0.01 USD per sample with gpt-4o-mini.
    """
    if not request.samples:
        raise HTTPException(status_code=400, detail="samples list cannot be empty")

    if len(request.samples) > 50:
        raise HTTPException(
            status_code=400,
            detail="Maximum 50 samples per evaluation request to control costs",
        )

    # Validate metric names
    VALID_METRICS = {"faithfulness", "answer_relevancy", "context_precision"}
    if request.metrics:
        invalid = set(request.metrics) - VALID_METRICS
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid metrics: {invalid}. Valid: {VALID_METRICS}",
            )

    try:
        import sys
        from pathlib import Path

        # Ensure eval module is importable
        eval_dir = Path(__file__).parent.parent.parent.parent / "eval"
        if str(eval_dir.parent) not in sys.path:
            sys.path.insert(0, str(eval_dir.parent))

        from eval.evaluate import run_evaluation

        qa_pairs = [
            {"question": s.question, "ground_truth": s.ground_truth or ""}
            for s in request.samples
        ]

        results = await _run_in_threadpool(run_evaluation, qa_pairs, request.metrics)

        if "error" in results:
            return EvalResponse(
                sample_count=0,
                metrics={},
                error=results["error"],
            )

        THRESHOLDS = {
            "faithfulness": 0.90,
            "answer_relevancy": 0.80,
            "context_precision": 0.75,
        }

        metric_results = {
            metric: EvalMetricResult(
                score=score,
                passed=results["passed"].get(metric, False),
                threshold=THRESHOLDS.get(metric, 0.0),
            )
            for metric, score in results["metrics"].items()
        }

        return EvalResponse(
            sample_count=results["sample_count"],
            metrics=metric_results,
        )

    except Exception as e:
        logger.error(f"Evaluation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")


async def _run_in_threadpool(func, *args):
    """Run a blocking function in FastAPI's threadpool."""
    import asyncio
    from functools import partial

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(func, *args))
