## Context

This project currently stores all document chunks in a single Chroma collection and exposes `/api/documents` without any caller-specific filter. The frontend already supports document-level filtering during chat through `active_doc_ids`, but that filtering happens only after the user has already received the global document list. As a result, a deployed anonymous experience would leak uploaded documents across users even if each chat narrows retrieval later.

The change needs to keep the current low-friction product posture: no required signup, no user table, and no heavy multi-tenant backend. It also needs to fit the current architecture, where FastAPI routes write metadata into Chroma and the React frontend owns transient chat state and document selection state.

## Goals / Non-Goals

**Goals:**
- Isolate uploaded documents by anonymous room without adding account registration.
- Reuse the existing `active_doc_ids` retrieval path instead of redesigning the RAG flow.
- Ensure file upload, URL ingest, Notion ingest, document listing, deletion, and chat all share the same room boundary.
- Keep room onboarding simple enough for trial users and easy to share via URL when needed.

**Non-Goals:**
- Building a full auth or user management system.
- Adding database-backed room registries, invitations, or permissions.
- Implementing background cleanup, room expiration jobs, or analytics.
- Repartitioning Chroma into one collection per room.

## Decisions

### Decision: Use opaque anonymous room codes instead of accounts or server-managed sessions
The frontend will ensure there is always an active `room_code` before any document API call. On first visit it will generate a code client-side, persist it in `localStorage`, and reuse it on refresh. If the URL contains a `room` query parameter, the app will adopt that room and persist it locally so a shared link can recreate the same workspace.

**Why this approach:** it preserves a zero-login experience, supports lightweight sharing, and avoids a new backend persistence layer.

**Alternatives considered:**
- **Mandatory auth**: strongest isolation, but directly conflicts with the product goal of frictionless trial.
- **Server-created room records**: adds lifecycle control, but requires extra endpoints and state without strong payoff for this stage.

### Decision: Store `room_code` in Chroma metadata on every chunk
All ingestion flows will add `room_code` alongside existing metadata such as `doc_id`, `source`, and `file_type`. The vector store helpers will then accept `room_code` parameters for listing, deletion, existence checks, and retrieval filtering.

**Why this approach:** it matches the current metadata-driven filtering style and avoids more invasive storage changes.

**Alternatives considered:**
- **One Chroma collection per room**: clearer physical isolation, but harder to manage and unnecessary at current scale.
- **Separate room-document index outside Chroma**: more flexible later, but introduces another data store now.

### Decision: Make room scope explicit in backend request contracts
Document-affecting endpoints will accept `room_code` as part of the request contract. `GET /api/documents` and delete operations will filter by room. Chat requests will include `room_code` and the backend will only retrieve from documents that belong to that room.

**Why this approach:** enforcement belongs on the server, not only in the browser.

**Alternatives considered:**
- **Infer room from session_id**: couples chat memory and document tenancy too tightly.
- **Trust frontend filtering only**: unsafe because callers could still hit the API directly.

### Decision: Keep `session_id` and `room_code` separate
`session_id` will continue to track conversation history, while `room_code` will define document scope. When the room changes in the frontend, the app should reset selected documents and clear chat session state to avoid mixing messages and sources from different workspaces.

**Why this approach:** chat history and document ownership are related but distinct concerns.

**Alternatives considered:**
- **Encode room into session_id**: makes debugging and validation harder, and does not help listing or deletion endpoints.

### Decision: Reject stale or foreign `active_doc_ids` at the room boundary
If a chat request includes `active_doc_ids`, the backend will validate that those document IDs belong to the provided room before retrieval. Requests that reference documents outside the active room will fail with a client error instead of silently crossing boundaries.

**Why this approach:** explicit failure is safer and easier to debug than silently ignoring bad selections.

**Alternatives considered:**
- **Silently drop invalid doc IDs**: lower friction, but can hide bugs and create confusing answer quality.

### Decision: Add lightweight room UI instead of a full room-management screen
The frontend will expose the current room code in an unobtrusive control area, with copy/share and “new room” affordances. This is enough to make room behavior understandable without turning the app into a workspace-management product.

**Why this approach:** users need visibility into why documents persist and how to share/isolate them, but the product should stay simple.

## Risks / Trade-offs

- **Client-generated room codes are not true authentication** → Use sufficiently unguessable codes and treat this as isolation for anonymous collaboration, not hardened access control.
- **Old chunks without `room_code` may remain in Chroma** → Treat them as legacy data outside the new flow and ensure new listing logic ignores documents without the active room.
- **Room switching can leave stale UI state** → Clear selected documents and chat session state whenever the active room changes.
- **Delete/list endpoints could still leak existence if responses differ by room** → Return room-scoped not-found behavior for documents outside the active room.

## Migration Plan

1. Add `room_code` to backend schemas and ingestion route contracts.
2. Update vector store helpers to write and filter by room metadata.
3. Update frontend API clients and state management so every document-related request includes the active room.
4. Add room bootstrap and lightweight room controls in the UI.
5. Verify new uploads are isolated by room and that cross-room document IDs cannot be listed, deleted, or queried.

Rollback is straightforward: revert the frontend room plumbing and backend metadata filters, returning the app to its current single-pool behavior. Existing chunks with extra metadata remain readable because Chroma metadata is additive.

## Open Questions

- Should the room code use a short human-friendly format (e.g. 8 uppercase chars) or a longer opaque token? The implementation should prefer readability unless collision risk becomes a concern.
- Should the room code appear in the page URL immediately on first load, or only after the user explicitly copies/shares it? Either is viable; the lightweight default is to keep it in local state and adopt URL-provided rooms when present.
