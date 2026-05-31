# LCEL and LangChain Chains

## What LCEL is

LCEL, the LangChain Expression Language, is the modern way to build chains in
LangChain. It composes small units called Runnables using the pipe operator, so
a prompt, a model, and an output parser can be connected into a single
composable pipeline.

## LCEL versus legacy chains

Legacy chains such as RetrievalQA are deprecated. Compared to them, LCEL offers
better composability, first-class streaming support, and an async-first design.
Because each step is a Runnable, pipelines are easier to test, reuse, and extend
than the older monolithic chain classes.

## Streaming tokens

LCEL pipelines can stream tokens as the model produces them. In this project the
chat endpoint streams tokens to the browser over Server-Sent Events, so the user
sees the answer appear incrementally instead of waiting for the whole response.

## Session history

Chains that need conversation memory are wrapped in RunnableWithMessageHistory,
keyed by a session id. The history is stored in Redis with an in-memory
fallback, so a chain can recall earlier turns of the conversation when answering
a follow-up question.

## Contextualizing a question

Before retrieval, a follow-up question is contextualized: the chain reads the
conversation history read-only and rewrites a question like "what about its
cost" into a standalone question that makes sense on its own. If there is no
history yet, the original question is used unchanged, which saves a language
model call on the first turn.
