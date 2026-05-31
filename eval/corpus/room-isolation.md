# Room Isolation

## What a room is

A room is the isolation boundary for documents in this project. Documents are
uploaded into a room identified by a room code, and questions are answered using
only the documents in that room. The room code is required and validated on
every ingest and chat request.

## How isolation works

Every vector stored in the database carries its room code in metadata. When the
system retrieves documents, it filters on the room code so that only documents
from the requested room can be returned. This keeps one room's documents from
leaking into another room's answers.

## Metadata filtering, not cryptography

Room isolation is metadata filtering, not cryptographic security. Anyone who
knows a room code can see that room's documents. The boundary prevents
accidental cross-room mixing rather than enforcing access control against a
determined attacker.

## Retrieval must always pass the room code

Every retrieval path must carry the room code, including the hybrid retriever.
If a retrieval path drops the room code, documents from other rooms can leak
into the results. The evaluation pipeline uses a dedicated fixed room so that
evaluation stays isolated from real user data.

## Smart routing

When a room has documents, the chat endpoint uses the RAG chain and returns
sources. When a room is empty, it uses a direct chain that answers from general
knowledge, performs no retrieval, and returns no sources.
