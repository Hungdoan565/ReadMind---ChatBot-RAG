"""
ChromaDB → pgvector migration script.

Migrates all documents from ChromaDB to PGVectorStore.
Idempotent: running twice will not create duplicates (checks doc_id existence).

Usage (from backend/ directory):
    python -m app.core.vectordb.migration

Environment variables used:
    CHROMA_PERSIST_DIR  — path to ChromaDB persist directory (default: ./data/chroma)
    DATABASE_URL_SYNC   — PostgreSQL connection string for pgvector
"""

import logging
import sys
from pathlib import Path
from typing import List, Dict, Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

BATCH_SIZE = 100


def _load_chroma_documents(chroma_dir: str) -> List[Dict[str, Any]]:
    """
    Load all documents from ChromaDB.

    Returns list of dicts with keys: page_content, metadata, id.
    """
    try:
        import chromadb
    except ImportError:
        logger.error(
            "chromadb is not installed. "
            "Install with: pip install chromadb>=0.6 to run this migration."
        )
        return []

    persist_path = Path(chroma_dir)
    if not persist_path.exists():
        logger.warning("ChromaDB persist directory does not exist: %s", chroma_dir)
        return []

    try:
        client = chromadb.PersistentClient(path=str(persist_path))
        # ChromaDB >= 0.6: list_collections() returns names (strings), not objects.
        collection_names = client.list_collections()
        # Normalise to a list of strings regardless of version
        if collection_names and not isinstance(collection_names[0], str):
            collection_names = [c.name for c in collection_names]
        if "rag_documents" not in collection_names:
            logger.warning(
                "ChromaDB collection 'rag_documents' not found. Nothing to migrate."
            )
            return []

        collection = client.get_collection("rag_documents")
        total = collection.count()
        if total == 0:
            logger.info("ChromaDB collection is empty. Nothing to migrate.")
            return []

        logger.info("Found %d documents in ChromaDB", total)
        results = collection.get(include=["documents", "metadatas"])

        docs = []
        ids = results.get("ids", [])
        documents = results.get("documents", [])
        metadatas = results.get("metadatas", [])

        for i, doc_id in enumerate(ids):
            docs.append(
                {
                    "id": doc_id,
                    "page_content": documents[i] if i < len(documents) else "",
                    "metadata": metadatas[i] if i < len(metadatas) else {},
                }
            )

        return docs

    except Exception as exc:
        logger.error("Failed to load ChromaDB documents: %s", exc)
        return []


def _get_existing_pgvector_doc_ids(room_code: str | None = None) -> set:
    """
    Return a set of doc_ids already present in pgvector.
    Used for idempotency check.
    """
    try:
        from app.core.vectordb.store import list_documents

        if room_code:
            docs = list_documents(room_code)
            return {d["doc_id"] for d in docs}
        else:
            return set()
    except Exception as exc:
        logger.warning("Could not query existing pgvector doc_ids: %s", exc)
        return set()


def migrate(dry_run: bool = False) -> Dict[str, int]:
    """
    Run the ChromaDB → pgvector migration.

    Args:
        dry_run: If True, log what would be migrated without writing.

    Returns:
        Dict with keys: total_chroma, migrated, skipped, errors
    """
    from app.config import settings

    logger.info("=" * 60)
    logger.info("ChromaDB → pgvector migration")
    logger.info("  CHROMA_PERSIST_DIR : %s", settings.CHROMA_PERSIST_DIR)
    logger.info("  DATABASE_URL_SYNC  : %s", settings.DATABASE_URL_SYNC[:60] + "...")
    logger.info("  DRY RUN            : %s", dry_run)
    logger.info("=" * 60)

    # Load ChromaDB documents
    chroma_docs = _load_chroma_documents(settings.CHROMA_PERSIST_DIR)
    total_chroma = len(chroma_docs)

    if total_chroma == 0:
        logger.info("No documents to migrate.")
        return {"total_chroma": 0, "migrated": 0, "skipped": 0, "errors": 0}

    # Import pgvector store (force non-Chroma path)
    try:
        from langchain_core.documents import Document as LCDocument
        from langchain_huggingface import HuggingFaceEmbeddings

        try:
            from langchain_postgres import PGVector
        except ImportError:
            from langchain_postgres.vectorstores import PGVector

        embeddings = HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
        pg_store = PGVector(
            connection=settings.DATABASE_URL_SYNC,
            embeddings=embeddings,
            collection_name="rag_documents",
            use_jsonb=True,
        )
    except Exception as exc:
        logger.error("Failed to initialize PGVectorStore: %s", exc)
        return {
            "total_chroma": total_chroma,
            "migrated": 0,
            "skipped": 0,
            "errors": total_chroma,
        }

    # Gather existing doc_ids across all rooms (best effort for idempotency)
    # Since we can't easily list all rooms, we'll check per-document using metadata
    existing_pgvector_ids: set = set()
    try:
        # Sample a search to get existing doc_ids in pgvector
        sample_results = pg_store.similarity_search("", k=10000)
        for doc in sample_results:
            if "doc_id" in doc.metadata:
                existing_pgvector_ids.add(doc.metadata["doc_id"])
        logger.info("Found %d existing doc_ids in pgvector", len(existing_pgvector_ids))
    except Exception as exc:
        logger.warning("Could not pre-load existing pgvector doc_ids: %s", exc)

    # Process in batches
    migrated = 0
    skipped = 0
    errors = 0

    batch: List[LCDocument] = []

    def flush_batch():
        nonlocal migrated, errors
        if not batch or dry_run:
            migrated += len(batch)
            if dry_run:
                logger.info("[DRY RUN] Would insert %d documents", len(batch))
            batch.clear()
            return
        try:
            pg_store.add_documents(batch)
            migrated += len(batch)
            logger.info(
                "Inserted batch of %d documents (total migrated: %d)",
                len(batch),
                migrated,
            )
        except Exception as exc:
            logger.error("Batch insert failed: %s", exc)
            errors += len(batch)
        finally:
            batch.clear()

    for doc_data in chroma_docs:
        chroma_id = doc_data["id"]
        page_content = doc_data["page_content"]
        metadata = doc_data["metadata"]

        doc_id = metadata.get("doc_id", chroma_id)

        # Skip if already in pgvector
        if doc_id in existing_pgvector_ids:
            skipped += 1
            continue

        if not page_content or not page_content.strip():
            logger.debug("Skipping empty document: %s", chroma_id)
            skipped += 1
            continue

        lc_doc = LCDocument(page_content=page_content, metadata=metadata)
        batch.append(lc_doc)

        if len(batch) >= BATCH_SIZE:
            flush_batch()

    # Flush remaining
    if batch:
        flush_batch()

    # Verification step — compare counts per room_code
    logger.info("-" * 60)
    logger.info("Migration complete!")
    logger.info("  Total in ChromaDB : %d", total_chroma)
    logger.info("  Migrated          : %d", migrated)
    logger.info("  Skipped (dup)     : %d", skipped)
    logger.info("  Errors            : %d", errors)

    # Verify counts by room_code
    if not dry_run:
        _verify_by_room(chroma_docs, pg_store)

    return {
        "total_chroma": total_chroma,
        "migrated": migrated,
        "skipped": skipped,
        "errors": errors,
    }


def _verify_by_room(chroma_docs: list, pg_store: Any) -> None:
    """Compare document counts per room_code between ChromaDB and pgvector."""
    from collections import Counter

    chroma_counts: Counter = Counter()
    for doc in chroma_docs:
        room = doc["metadata"].get("room_code", "<unknown>")
        chroma_counts[room] += 1

    logger.info("Verification — counts by room_code:")
    logger.info("  %-30s  %8s  %8s  %8s", "room_code", "chroma", "pgvector", "match")
    logger.info("  " + "-" * 58)

    for room_code, chroma_count in chroma_counts.most_common():
        try:
            pg_results = pg_store.similarity_search(
                "", k=10000, filter={"room_code": {"$eq": room_code}}
            )
            pg_count = len(pg_results)
        except Exception:
            pg_count = -1

        match = "✓" if pg_count >= chroma_count else "✗"
        logger.info(
            "  %-30s  %8d  %8d  %8s",
            room_code[:30],
            chroma_count,
            pg_count,
            match,
        )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Migrate ChromaDB → pgvector")
    parser.add_argument(
        "--dry-run", action="store_true", help="Preview without writing"
    )
    args = parser.parse_args()

    stats = migrate(dry_run=args.dry_run)
    exit_code = 0 if stats["errors"] == 0 else 1
    sys.exit(exit_code)
