# Hybrid Search and Reciprocal Rank Fusion

## Dense versus sparse retrieval

Dense retrieval uses vector embeddings to find documents that are semantically
similar to the query, even when they share no exact keywords. Sparse retrieval,
such as BM25, ranks documents by keyword overlap and term frequency. Each method
has blind spots: dense search can miss rare exact terms, while BM25 can miss
paraphrases. Hybrid search combines both to get the strengths of each.

## What hybrid search is

Hybrid search combines dense vector search with sparse BM25 keyword search and
then fuses the two ranked lists into a single ranking. In this project the
hybrid search runs a dense semantic search to fetch candidates, runs BM25 over
those candidates, and fuses the results. Hybrid retrieval reaches about 91%
recall at 10 results, compared to roughly 78% for dense-only search.

## BM25

BM25 is a classic sparse ranking function based on term frequency and inverse
document frequency, with a saturation term so that repeated words give
diminishing returns. It is strong at matching exact keywords and rare terms that
a dense embedding model might smooth over.

## Reciprocal Rank Fusion (RRF)

Reciprocal Rank Fusion merges several ranked lists into one. For each document
it sums a score of one divided by a constant plus the rank in each list. The
constant, often 60, dampens the influence of lower ranks. RRF does not need the
raw scores to be on the same scale, which makes it a robust way to combine the
dense ranking and the BM25 ranking into a final fused order.

## Candidate pool

The retriever fetches a larger candidate pool than the number of results it will
ultimately return — typically three times the requested top_k. Fusing the full
candidate pool before cutting gives the later reranking stage many candidates to
choose from.
