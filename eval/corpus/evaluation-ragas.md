# Evaluating RAG with RAGAS

## What RAGAS measures

RAGAS is a framework for evaluating RAG pipelines using a language model as a
judge. It scores the quality of retrieval and generation without requiring large
amounts of hand-labeled data, turning subjective quality into measurable
numbers.

## Faithfulness

Faithfulness measures whether the claims in the generated answer are grounded in
the retrieved context. A faithful answer makes no statements that the retrieved
documents do not support. In this project the faithfulness threshold is 0.9, so
the answer must be almost entirely supported by its context to pass.

## Answer relevancy

Answer relevancy measures whether the generated answer is relevant to the
question that was asked. A relevant answer addresses the actual question instead
of drifting to related but off-target information. The answer relevancy
threshold in this project is 0.8.

## Context precision

Context precision measures whether the retrieved documents are actually useful
for answering the question. High context precision means the retriever returned
documents that matter rather than noise. The context precision threshold in this
project is 0.75.

## The quality gate

The evaluation acts as a quality gate. It runs RAGAS against a golden set of
questions, compares each metric to its threshold, and returns PASS when every
metric meets its threshold or FAIL when any metric falls below. The judge and
embeddings used by RAGAS are OpenAI models configured separately from the
application's own models. The CLI maps the result to an exit code: PASS is 0,
FAIL is 1, and SKIPPED is 2. SKIPPED means a prerequisite is missing, such as no
OpenAI API key or no ingested data, and it never shares the FAIL exit code.
