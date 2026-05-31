# Chunking for RAG

## Why chunking matters

Chunking is one of the most important steps in a RAG pipeline. Roughly 80% of
RAG failures can be traced back to ingestion and chunking problems rather than
to the language model itself. If the chunks are poorly formed, retrieval returns
irrelevant or fragmented context and the final answer suffers.

## Chunk size and overlap

Chunk size controls the granularity of the retrieved context. A common default
is around 512 tokens per chunk with about 10% overlap between neighboring
chunks. If chunks are too large, the language model loses focus and the
retrieved context contains noise. If chunks are too small, important context is
fragmented across many pieces and the retriever may miss the full answer. The
overlap helps preserve continuity so that a sentence split across a boundary is
still recoverable.

## Two-pass section-aware chunking

A two-pass strategy first splits a document on semantic section boundaries such
as markdown headers and paragraph breaks. In the second pass, any section that
is still larger than the configured chunk size is split again with a character
based splitter. This keeps related content together while guaranteeing that no
chunk exceeds the size limit.

## Preserving metadata

Each chunk keeps metadata from its source document, including the source name,
the document id, and the room code. Chunks are also annotated with a chunk
index, a chunk total, and the nearest preceding section title so that retrieved
context can be attributed back to its location in the original document.
