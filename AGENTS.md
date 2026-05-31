# ReadMind — Agent Guidelines

RAG chatbot with anonymous, room-based document isolation. Upload documents to a
room, ask questions, get answers grounded in those documents (or general AI when
the room is empty). FastAPI + LangChain backend, React frontend.

> **Read this before touching code.** The `README.md` is marketing-facing and
> partially stale. This file reflects the *actual* current architecture. Where
> they disagree, trust the code and this document.

---

## Working Principles

- **Think before coding.** State assumptions, surface trade-offs, ask when a
  request has two materially different interpretations. Don't guess at scope.
- **Simplicity first.** Write the minimum code that solves the problem. No
  speculative abstractions, no config knobs nobody asked for.
- **Surgical changes.** Touch only what the task requires. Match the existing
  style even if you'd personally write it differently. Don't reformat or
  "improve" adjacent code.
- **Goal-driven execution.** Define what "done" looks like (a passing test, a
  green build, a working endpoint) and verify against it before claiming success.

---

## Stack at a Glance

### Backend (`backend/`)
| Concern | Choice | Notes |
|---|---|---|
| Framework | FastAPI 0.115 | Async, SSE streaming, auto-docs at `/docs` (DEBUG only) |
| Orchestration | LangChain 0.3 (LCEL) | **Pinned — do NOT upgrade without testing** |
| LLM | Groq `llama-3.3-70b-versatile` | Free tier, fast; rate-limited |
| Embeddings | HuggingFace `all-MiniLM-L6-v2` | Local, CPU-only torch, no API cost |
| Vector store | **pgvector (default)** / ChromaDB (legacy) | Switched by `USE_CHROMA` flag |
| Relational DB | PostgreSQL (pgvector image) | Users, room ownership, vectors |
| Cache / sessions | Redis | Chat history + rate-limit storage; degrades gracefully |
| Auth | fastapi-users (JWT) | UUID users, register/login/reset/verify |
| Migrations | Alembic | Auto-runs on startup (non-fatal on failure) |
| Rate limiting | slowapi | Redis-backed, in-memory fallback |
| Parsing | pypdf, python-docx, openpyxl, BeautifulSoup, pytesseract | PDF/DOCX/TXT/XLSX/CSV + OCR + web/Notion |
| Reranking | flashrank | `core/reranker.py` |

### Frontend (`frontend/`)
| Concern | Choice | Notes |
|---|---|---|
| Framework | React 19 | Functional components + hooks only |
| Language | TypeScript ~5.9 | **strict mode**, `noUnusedLocals`, `noUnusedParameters` |
| Build | Vite 8 | Dev proxy `/api` → `localhost:8000` |
| Styling | Tailwind CSS 4 | CSS variables for theming (`var(--bg-primary)`) |
| Animation | Framer Motion | Glassmorphism effects |
| HTTP | axios (`api/client.ts`) + raw `fetch` for SSE (`api/chat.ts`) |
| Unit tests | Vitest + Testing Library + jsdom | |
| E2E tests | Playwright | |

### DevOps
Docker Compose orchestrates four services: `postgres` (pgvector/pg16, :5432),
`redis` (7-alpine, :6379), `backend` (FastAPI, :8000), `frontend` (nginx, :3000).

---

## Architecture

### Request flow
```
Frontend (room_code)
  → POST /api/ingest            file upload  → parse → chunk → embed → vector store
  → POST /api/ingest/url|notion external src → fetch → chunk → embed → vector store
  → POST /api/chat              question     → smart router → SSE stream of tokens
```

### Smart routing (the core behavior)
`api/routes/chat.py` decides per request:
- **Room has documents** → RAG chain (`get_rag_chain`): contextualize question →
  hybrid retrieve (semantic + BM25, filtered by `room_code` and optional
  `active_doc_ids`) → answer from context → stream tokens → append `sources`.
- **Room is empty** → direct chain (`get_direct_chain`): general AI answer, no
  retrieval, no sources.

Both chains are LCEL pipelines wrapped in `RunnableWithMessageHistory`, keyed by
`session_id`. History is Redis-backed with an in-memory fallback.

### Room isolation
`room_code` is the isolation boundary and is **required** on ingest and chat.
Every vector carries `room_code` metadata; retrieval filters on it. This is
metadata filtering, *not* cryptographic security — anyone with a room code sees
that room's documents. Authenticated users may optionally *claim* rooms
(`room_ownership` table) but anonymous access still works.

### Vector store abstraction
`core/vectordb/store.py` is the single entry point. It exposes a stable public
API (`add_documents`, `hybrid_search`, `list_documents`, `delete_by_doc_id`,
`validate_doc_ids_in_room`, …). Based on `settings.USE_CHROMA`:
- `False` (default) → pgvector via `langchain_postgres.PGVector`.
- `True` → delegates to the legacy `store_chroma.py`.

**When adding store functionality, keep both paths' signatures identical.**
Callers (`chain.py`, `chat.py`, `ingest.py`, `rooms.py`) must not care which
backend is active.

---

## Project Structure

```
backend/
├── app/
│   ├── main.py              # App assembly: lifespan, CORS, rate limiter, routers
│   ├── config.py            # Pydantic Settings (single source for env config)
│   ├── api/
│   │   ├── deps.py          # Shared FastAPI dependencies
│   │   └── routes/
│   │       ├── chat.py            # POST /api/chat — SSE + smart routing
│   │       ├── ingest.py          # POST /api/ingest — file upload pipeline
│   │       ├── ingest_sources.py  # /api/ingest/url|urls|notion|notion/db
│   │       ├── auth.py            # fastapi-users routers under /api/auth
│   │       ├── rooms.py          # GET /api/rooms, POST /api/rooms/{code}/claim
│   │       ├── eval.py           # Evaluation endpoint
│   │       └── health.py         # GET /api/health
│   ├── core/
│   │   ├── rag/chain.py     # LCEL RAG + direct chains, prompts, session history
│   │   ├── llm/llm.py       # get_llm() — Groq ChatGroq singleton
│   │   ├── vectordb/        # store.py (pgvector + flag), store_chroma.py, migration.py
│   │   ├── ingestion/       # chunker, pdf, docx_parser, excel, csv_parser, ocr, web, notion
│   │   ├── auth/            # db.py, models.py (User, RoomOwnership), schemas.py, users.py
│   │   ├── cache/           # redis_client, session_store (RedisChatMessageHistory)
│   │   └── reranker.py      # flashrank reranking
│   └── models/schemas.py    # Pydantic request/response schemas (API layer)
├── alembic/                 # Migrations (env.py, versions/); runs on startup
├── tests/                   # pytest suite (see Testing)
├── requirements.txt         # Pinned dependencies
└── Dockerfile               # Multi-stage; tesseract + poppler in runtime image

frontend/
├── src/
│   ├── App.tsx              # Root layout: Sidebar + ChatWindow + ChatInput
│   ├── main.tsx             # Entry point
│   ├── index.css            # Tailwind + CSS-variable theme tokens
│   ├── api/
│   │   ├── client.ts        # axios instance + interceptors
│   │   ├── chat.ts          # streamMessage() async generator (SSE via fetch)
│   │   └── ingest.ts        # upload / url / document management
│   ├── hooks/
│   │   ├── useChat.ts       # message state, streaming, activeDocIds
│   │   └── useRoom.ts       # room_code: URL → localStorage → generate
│   ├── types/index.ts       # All shared TS types (requests, responses, events, UI)
│   ├── components/          # 20 components (PascalCase, named exports)
│   └── test/setup.ts        # Vitest setup (jest-dom)
├── vite.config.ts
├── tsconfig.json
└── Dockerfile               # nginx-alpine static serving

openspec/                    # OpenSpec change proposals (see Workflow)
eval/                        # RAGAS evaluation (evaluate.py, sample_questions.json)
docker-compose.yml
```

---

## Commands

### Backend
```bash
cd backend
python -m venv .venv && .venv\Scripts\activate    # Windows
pip install -r requirements.txt

uvicorn app.main:app --reload --port 8000          # dev server
pytest                                             # run all tests
pytest tests/test_chat_api.py                      # single file
pytest -k chunker                                  # by keyword
```

### Frontend
```bash
cd frontend
npm install
npm run dev            # Vite dev server on :5173 (proxies /api → :8000)
npm run build          # tsc typecheck + vite build (build FAILS on type errors)
npm test               # Vitest watch
npm run test:run       # Vitest once (CI)
npm run test:coverage  # with coverage
npm run test:e2e       # Playwright
```

### Full stack
```bash
cp backend/.env.example backend/.env   # fill GROQ_API_KEY
docker compose up --build              # http://localhost:3000
```

---

## Configuration

All backend config flows through `app/config.py` (`pydantic-settings`). Set via
`backend/.env` (gitignored). Keys defined in `.env.example`:

- **Required:** `GROQ_API_KEY`
- **LLM:** `LLM_MODEL`, `LLM_TEMPERATURE`, `LLM_MAX_TOKENS`
- **Embeddings:** `EMBEDDING_MODEL`
- **Retrieval/chunking:** `RETRIEVAL_TOP_K`, `RERANK_TOP_N`, `CHUNK_SIZE`, `CHUNK_OVERLAP`
- **Vector store:** `USE_CHROMA` (false → pgvector), `CHROMA_PERSIST_DIR`
- **PostgreSQL:** `DATABASE_URL` (asyncpg), `DATABASE_URL_SYNC` (psycopg)
- **Redis:** `REDIS_URL`, `REDIS_RATE_LIMIT_URL`
- **Auth:** `JWT_SECRET` (**must change in production**), `JWT_LIFETIME_SECONDS`, `JWT_REFRESH_LIFETIME_SECONDS`
- **Rate limits:** `RATE_LIMIT_CHAT`, `RATE_LIMIT_INGEST`
- **Optional:** `OPENAI_API_KEY` (RAGAS eval only), `NOTION_TOKEN`, `OCR_ENABLED`, `TESSERACT_CMD`, `CORS_ORIGINS`

**Never commit `.env` or real secrets.** Add new config as a typed field in
`Settings` *and* document it in `.env.example`.

---

## Conventions

### Backend (Python)
- **Module docstrings** at the top of every file explaining purpose; section
  dividers use `# ---------------------------------------------------------------------------`.
- **Lazy singletons** for expensive resources: `get_llm()`, `get_rag_chain()`,
  `get_direct_chain()`, `_vectorstore`, `_embeddings`. Follow this pattern for
  new heavy objects (models, clients) instead of constructing per-request.
- **Graceful degradation:** external dependencies (Redis, Alembic) fail
  *non-fatally* at startup and fall back. Use `except Exception as exc:  # noqa: BLE001`
  with a `logger.warning` for non-critical paths — mirror the existing style.
- **Type hints everywhere.** Use `from typing import ...`; `X | None` unions are
  fine (matches existing code).
- **Pydantic schemas:** API-facing request/response models live in
  `app/models/schemas.py`. Small route-local response models may be declared
  inline (see `rooms.py`). SQLAlchemy ORM models live in `app/core/auth/models.py`.
- **Logging:** `logger = logging.getLogger(__name__)` per module. No `print`.
- **Routes:** one `APIRouter()` per file, mounted in `main.py` with `prefix="/api"`.
  Apply `@limiter.limit(...)` using the configured rate-limit settings.
- `room_code` is **required and validated** on every ingest/chat endpoint.

### Frontend (TypeScript / React)
- **Functional components**, named exports (`export function Sidebar`). `App` is
  the only default export.
- **`import type { ... }`** for type-only imports — `verbatimModuleSyntax` is on,
  so mixing value and type imports will break the build.
- **strict mode is non-negotiable.** `noUnusedLocals` / `noUnusedParameters`
  mean unused symbols fail `tsc`. `npm run build` typechecks before bundling.
- **File naming:** components `PascalCase.tsx`, hooks/api `camelCase.ts`.
- **State:** local `useState`/`useCallback`; custom hooks (`useChat`, `useRoom`)
  encapsulate domain logic. No global state library.
- **Theming:** use CSS variables (`var(--bg-primary)`, `var(--text-secondary)`),
  never hard-coded colors. Dark/light handled via `ThemeProvider`.
- **UI copy is Vietnamese.** Keep user-facing strings in Vietnamese to match.

### Hard rules (all languages)
- **Never** suppress type errors (`as any`, `@ts-ignore`, `# type: ignore`) or
  swallow exceptions with bare empty `except`/`catch`.
- **Never** upgrade LangChain or its sub-packages without running the test suite
  (they are pinned for a reason — see `requirements.txt`).
- **Never** commit unless explicitly asked.
- **Never** delete or skip a failing test to make CI green — fix the cause.

---

## Testing

### Backend (`backend/tests/`)
- pytest. `conftest.py` injects a dummy `GROQ_API_KEY` so settings import cleanly.
- Naming: `test_*.py`. Existing suites: `test_chat_api`, `test_ingest_api`,
  `test_chunker` / `test_chunker_v2`, `test_rate_limiting`, `test_reranker`,
  `test_store`.
- Add tests alongside these for any new endpoint or core module.

### Frontend (`frontend/src`)
- Unit/component: Vitest + Testing Library, tests in `__tests__/` folders next to
  the code (`api/__tests__/`, `hooks/__tests__/`). Setup in `src/test/setup.ts`.
- E2E: Playwright via `npm run test:e2e`.

### Before claiming "done"
- Backend change → `pytest` passes.
- Frontend change → `npm run build` (typecheck) **and** `npm run test:run` pass.
- New feature or bugfix → a test that exercises it. For bugs, write a failing
  test that reproduces the bug first, then make it pass.

---

## Development Workflow

This repo uses **OpenSpec** for non-trivial changes. Specs live under
`openspec/changes/<change-name>/` as `proposal.md`, `design.md`, `tasks.md`, and
per-capability `specs/*/spec.md`; completed changes move to
`openspec/changes/archive/`.

- For a substantial feature, check whether a relevant change folder exists and
  align with its `tasks.md` before writing code.
- For small fixes, code directly — no spec ceremony required.
- Migrations: create a new Alembic revision in `backend/alembic/versions/` for
  any schema change; it will auto-apply on next backend startup.

---

## Quality Gates

- [ ] Change traces directly to the request — nothing extra.
- [ ] Backend: `pytest` green; Frontend: `npm run build` + `npm run test:run` green.
- [ ] No suppressed type errors, no swallowed exceptions.
- [ ] New config documented in both `Settings` and `.env.example`.
- [ ] Vector store changes keep pgvector and ChromaDB signatures identical.
- [ ] No secrets committed.
