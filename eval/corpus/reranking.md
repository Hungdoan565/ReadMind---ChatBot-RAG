# Reranking with a Cross-Encoder

## Why rerank

After hybrid search produces a fused candidate list, a reranking step reorders
those candidates by relevance to the query. Reranking improves precision by
promoting the most relevant documents to the top before they are handed to the
language model.

## Cross-encoder reranking

A cross-encoder reranker reads the query and each candidate document together
and scores how well they match. This is more accurate than the initial
retrieval because the model sees the query and the document at the same time,
rather than comparing independent embeddings. The project uses FlashRank as the
cross-encoder reranker.

## Rerank on the full candidate pool, then cut

The reranker must see the full fused candidate pool, not a list that was already
trimmed to the final size. The correct order is to fuse all candidates, rerank
that larger set, and only then cut to the final number of documents. If the cut
happens before reranking, the cross-encoder only sees a small pre-trimmed set
and its benefit is largely lost. The final number returned is the smaller of the
configured rerank top_n and the caller's requested top_k.

## Safe fallback

If the reranker is unavailable or raises an error, the system falls back to the
fused Reciprocal Rank Fusion ordering, returns the top results from that fused
list, and logs a warning. Reranking failure never crashes the pipeline; it
degrades gracefully to the fused ranking.
