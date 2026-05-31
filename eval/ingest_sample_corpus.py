"""
Ingest the sample evaluation corpus into the RAGAS evaluation room.

This script reads every file in ``eval/corpus/`` and ingests it through the
real ingestion pipeline (``chunk_documents`` → ``add_documents``) into the room
``settings.RAGAS_EVAL_ROOM_CODE`` (default ``"eval"``). The RAGAS quality gate
(``eval/evaluate.py``) retrieves from this very room, so running this script is
the prerequisite that turns the gate from SKIPPED into a real PASS/FAIL run.

Each corpus file becomes one ``Document`` whose ``page_content`` is the file's
text and whose metadata carries ``source``, ``doc_id`` and ``room_code``. The
chunker preserves source metadata, so setting ``room_code`` on the input
document is enough; this script also re-asserts ``room_code`` on every produced
chunk as a defensive guarantee that the room-isolation invariant holds.

This script requires a live Postgres/pgvector instance and the HuggingFace
embedding model, so it is meant to be run by hand when that infrastructure is
available. It is intentionally NOT executed inside the pytest suite.

Usage:
    python eval/ingest_sample_corpus.py
"""

import logging
import sys
from pathlib import Path
from typing import List

# Add backend to sys.path so we can import app modules (mirrors evaluate.py).
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "backend"))

logger = logging.getLogger(__name__)

#: Default corpus directory shipped alongside this script.
DEFAULT_CORPUS_DIR: Path = ROOT / "eval" / "corpus"

#: File extensions treated as ingestible plain-text/markdown corpus files.
_CORPUS_SUFFIXES: frozenset[str] = frozenset({".md", ".txt"})


def _load_corpus_documents(corpus_dir: Path, room_code: str):
    """Read every corpus file in ``corpus_dir`` into a list of ``Document``.

    Each file becomes one document with ``source``/``doc_id``/``room_code``
    metadata. ``doc_id`` is the file name, which is stable across re-runs so a
    re-ingest replaces rather than duplicates conceptually.
    """
    from langchain_core.documents import Document

    documents: List[Document] = []
    for path in sorted(corpus_dir.iterdir()):
        if not path.is_file() or path.suffix.lower() not in _CORPUS_SUFFIXES:
            continue
        text = path.read_text(encoding="utf-8")
        if not text.strip():
            logger.warning("Bỏ qua tệp rỗng: %s", path.name)
            continue
        documents.append(
            Document(
                page_content=text,
                metadata={
                    "source": path.name,
                    "doc_id": path.name,
                    "room_code": room_code,
                },
            )
        )
    return documents


def ingest_corpus(corpus_dir: Path | None = None) -> int:
    """Ingest the sample corpus into the RAGAS evaluation room.

    Args:
        corpus_dir: Directory of corpus files. Defaults to ``eval/corpus/``.

    Returns:
        The number of chunks added to the vector store.

    Raises:
        FileNotFoundError: If ``corpus_dir`` does not exist.
        ValueError: If ``corpus_dir`` contains no ingestible corpus files.
    """
    from app.config import settings
    from app.core.ingestion.chunker import chunk_documents
    from app.core.vectordb.store import add_documents

    resolved_dir = corpus_dir or DEFAULT_CORPUS_DIR
    if not resolved_dir.exists():
        raise FileNotFoundError(f"Không tìm thấy thư mục corpus: {resolved_dir}")

    room_code = settings.RAGAS_EVAL_ROOM_CODE
    documents = _load_corpus_documents(resolved_dir, room_code)
    if not documents:
        raise ValueError(
            f"Không có tệp corpus nào ({sorted(_CORPUS_SUFFIXES)}) trong {resolved_dir}."
        )

    chunks = chunk_documents(documents)

    # Defensive guarantee: every chunk must carry the eval room_code so the
    # room-isolation invariant holds even if upstream metadata handling changes.
    for chunk in chunks:
        chunk.metadata["room_code"] = room_code

    stored_count = add_documents(chunks)

    logger.info(
        "Ingested %d file(s) → %d chunk(s) into room '%s'",
        len(documents),
        stored_count,
        room_code,
    )
    print(
        f"Ingested {len(documents)} file(s) → {stored_count} chunk(s) "
        f"into room '{room_code}'"
    )
    return stored_count


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    ingest_corpus()
