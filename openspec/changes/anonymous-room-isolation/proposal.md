## Why

The current deployment model stores every uploaded document in one shared Chroma collection and exposes the full document list to any client. That is acceptable for a single-user demo, but it breaks privacy and becomes confusing as soon as multiple anonymous users upload documents in the same deployed environment.

## What Changes

- Introduce anonymous room codes so each browser session works inside an isolated document workspace without requiring account creation.
- Attach room metadata to every ingested document chunk across file, URL, and Notion ingestion flows.
- Scope document listing, deletion, and chat retrieval to the active room so users only see and query their own room's documents.
- Add frontend room state management with local persistence and shareable room bootstrap behavior.
- Preserve the existing per-chat `active_doc_ids` filtering, but validate it inside the room boundary.

## Capabilities

### New Capabilities
- `anonymous-room-context`: Create, persist, restore, and optionally join an anonymous room context in the frontend and API contract.
- `room-scoped-ingestion`: Store uploaded and ingested content with room metadata so documents are isolated at write time.
- `room-scoped-document-management`: List and delete documents only within the active room.
- `room-scoped-chat-access`: Restrict chat retrieval and source citations to documents that belong to the active room.

### Modified Capabilities
- None.

## Impact

- Backend: `backend/app/models/schemas.py`, `backend/app/api/routes/ingest.py`, `backend/app/api/routes/ingest_sources.py`, `backend/app/api/routes/chat.py`, `backend/app/core/vectordb/store.py`, and ingestion helpers that preserve metadata.
- Frontend: `frontend/src/types/index.ts`, `frontend/src/api/chat.ts`, `frontend/src/api/ingest.ts`, `frontend/src/hooks/useChat.ts`, `frontend/src/App.tsx`, `frontend/src/components/Sidebar.tsx`, `frontend/src/components/DocumentList.tsx`, `frontend/src/components/FileUpload.tsx`, `frontend/src/components/UrlIngest.tsx`, and any new room utility or UI components.
- Data model: Chroma metadata shape expands to include room identity fields.
- UX: anonymous users keep low-friction onboarding while avoiding cross-user document leakage.
