# Embeddings and the Vector Store

## What embeddings are

An embedding is a numeric vector that represents the meaning of a piece of text.
Texts with similar meaning have vectors that are close together, which lets a
system find semantically related content by comparing vectors instead of
matching exact words.

## Application embeddings

The application uses the HuggingFace model all-MiniLM-L6-v2 to embed text. It
runs locally on CPU and has no API cost, which keeps ingestion cheap and avoids
sending document text to an external embedding service. These application
embeddings are separate from the OpenAI embeddings that RAGAS uses for
evaluation.

## The vector store: pgvector

Vectors are stored in PostgreSQL using the pgvector extension. The vector store
is the single entry point for adding documents, listing documents, hybrid
search, and deletion. A feature flag selects pgvector by default or the legacy
ChromaDB backend, and both backends expose identical public function signatures
so callers do not need to know which one is active.

## Adding documents

The public add_documents function stores each document along with its metadata
directly in the vector store. Every vector carries its room code in metadata so
that later retrieval can filter to a single room.
