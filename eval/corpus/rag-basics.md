# Retrieval-Augmented Generation (RAG)

## What is RAG

Retrieval-Augmented Generation (RAG) is a technique that combines a retrieval
system with a large language model. Instead of relying only on what the model
memorized during training, RAG first retrieves relevant documents from a
knowledge base and then uses those documents as context for the language model
to generate a grounded, accurate answer.

## Why grounding matters

A language model on its own can hallucinate — it may produce fluent text that is
factually wrong. By grounding generation in retrieved source documents, RAG
keeps the answer tied to real evidence. The model is instructed to answer from
the provided context, which reduces hallucination and makes answers verifiable
against the sources that were retrieved.

## The two stages of a RAG pipeline

A RAG pipeline has two stages. The first stage is retrieval: given a user
question, the system searches a vector store and returns the most relevant
chunks of text. The second stage is generation: the retrieved chunks are
formatted into a context string and passed to the language model together with
the question, and the model writes the final answer.

## Sources and citations

Because the answer is generated from a specific set of retrieved documents, a
RAG system can show the user which sources were used. These citations come from
the very same documents that produced the context, so the user can trace each
answer back to its origin.
