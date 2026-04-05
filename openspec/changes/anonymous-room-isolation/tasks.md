## 1. Backend request contracts

- [x] 1.1 Add `room_code` fields to backend schema models used by chat and non-file ingestion requests
- [x] 1.2 Update the file upload route to accept `room_code` from multipart form data
- [x] 1.3 Update document listing and deletion routes to require room scope inputs
- [x] 1.4 Enforce consistent missing/empty `room_code` validation across document-scoped routes ← (verify: file upload, URL ingest, Notion ingest, document list/delete, and chat all reject missing or blank room codes)

## 2. Room-aware vector store operations

- [x] 2.1 Add reusable room-filter helpers in `backend/app/core/vectordb/store.py`
- [x] 2.2 Update document listing to return only documents for the active room
- [x] 2.3 Update document deletion to scope by both `room_code` and `doc_id`
- [x] 2.4 Add a helper to validate that selected `doc_id` values belong to the active room
- [x] 2.5 Update dense and hybrid retrieval paths to enforce room filtering with optional `active_doc_ids` ← (verify: retrieval with no selected docs stays inside one room, and retrieval with selected docs never crosses room boundaries)

## 3. Ingestion metadata propagation

- [x] 3.1 Tag file-uploaded documents with `room_code` before chunk storage
- [x] 3.2 Tag single-URL and batch-URL ingestion flows with `room_code`
- [x] 3.3 Tag Notion page and Notion database ingestion flows with `room_code`
- [x] 3.4 Preserve existing `doc_id`, `source`, and response behavior while adding room metadata ← (verify: successful ingest responses still return usable `doc_id` and source info, and stored chunks include room metadata)

## 4. Chat room enforcement

- [x] 4.1 Extend the chat request contract to send `room_code`
- [x] 4.2 Validate selected `active_doc_ids` against the active room before invoking the RAG chain
- [x] 4.3 Keep source citation generation constrained to the same room filter as retrieval
- [x] 4.4 Return a client error for foreign-room `active_doc_ids` instead of silently ignoring them ← (verify: stale or guessed doc IDs outside the room fail fast and do not trigger retrieval)

## 5. Frontend room state and API plumbing

- [ ] 5.1 Extend frontend request/response types and API client helpers to include `room_code`
- [ ] 5.2 Create a room utility or hook that generates, persists, restores, and URL-adopts anonymous room codes
- [ ] 5.3 Wire `App.tsx` and `useChat.ts` to track the active room and reset room-dependent chat state when it changes
- [ ] 5.4 Pass `room_code` through upload, document list, delete, and chat calls ← (verify: every document-scoped frontend request includes the active room code)

## 6. Frontend room UI behavior

- [ ] 6.1 Add lightweight room controls that display the active room code and support copy/share or new-room creation
- [ ] 6.2 Update sidebar ingestion and document-list flows to refetch data when the room changes
- [ ] 6.3 Prevent stale selected documents from carrying across room switches
- [ ] 6.4 Handle URL-based room entry so shared room links open the expected workspace ← (verify: switching rooms updates visible documents immediately and clears old room selections/chat state)

## 7. End-to-end verification

- [ ] 7.1 Manually verify same-room persistence across refreshes in a single browser
- [ ] 7.2 Manually verify two different rooms cannot list, delete, or chat over each other's documents
- [ ] 7.3 Run frontend build and backend verification commands for touched code paths ← (verify: builds/checks pass and room isolation works for upload → list → chat → delete)