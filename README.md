<div align="center">

<img src="assets/logo.svg" alt="ReadMind Logo" width="100" />

# ReadMind

**RAG Chatbot** with anonymous, room-based document isolation

Upload documents to a room, ask questions, get answers grounded in those documents — or general AI when the room is empty. No login required, but you can claim rooms once you sign up.

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white&style=for-the-badge)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white&style=for-the-badge)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black&style=for-the-badge)
![Postgres](https://img.shields.io/badge/pgvector-pg16-4169E1?logo=postgresql&logoColor=white&style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

</div>

---

## Why ReadMind?

Most document Q&A tools are either generic (unaware of your context), expensive (closed SaaS with lock-in), or leak data across users. ReadMind takes a different approach:

- 🗂️ **Room-based isolation** — Each room gets its own document vault. No account required to start.
- ⚡ **Smart routing** — RAG mode when the room has documents, general AI mode when it's empty.
- 🔐 **Optional accounts** — Sign up with JWT auth to *claim* rooms to your profile; anonymous access keeps working.
- 🚀 **Zero friction** — Upload → Ask → Get cited answers, streamed token by token.

> Built as a full-stack portfolio project demonstrating production RAG architecture: hybrid retrieval, reranking, vector storage, auth, rate limiting, and containerized deployment.

---

## How It Works

### Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                            FRONTEND (React 19)                         │
│  FileUpload · UrlIngest · NotionImport · DocList · ChatWindow          │
│                              │ room_code                               │
└──────────────────────────────┼─────────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          BACKEND (FastAPI)                             │
│                                                                        │
│  /api/ingest · /api/ingest/url|urls|notion                            │
│        │  parse → chunk → embed (HuggingFace MiniLM)                   │
│        ▼                                                                │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Vector store (store.py)   pgvector (default) | ChromaDB (legacy)│  │
│  │  every vector tagged with room_code + doc_id                    │  │
│  └──────────────────────────────────────────────────────────────┘    │
│        ▲                                                                │
│  /api/chat → Smart Router (room has docs?)                             │
│        ├─ yes → RAG chain: contextualize → hybrid search               │
│        │         (semantic + BM25) → flashrank rerank → answer + sources│
│        └─ no  → Direct chain: general AI answer, no retrieval          │
│                                                                        │
│  /api/auth  (fastapi-users JWT)   /api/rooms  (claim/list)            │
└──────────────────────────────────────────────────────────────────────┘
        │                              │
   PostgreSQL + pgvector           Redis (chat history + rate limits)
```

### Data flow

1. **Ingestion** → Documents uploaded to a room → parsed (PDF/DOCX/TXT/XLSX/CSV, plus OCR for scanned PDFs, web URLs, Notion) → chunked → embedded via HuggingFace `all-MiniLM-L6-v2`.
2. **Storage** → Vectors indexed in pgvector (or ChromaDB legacy) with `room_code` + `doc_id` metadata for isolation.
3. **Query** → Question → hybrid retrieval (semantic + BM25, filtered by `room_code`) → flashrank reranking → top-N chunks.
4. **Routing** → Room has documents → RAG chain; room empty → direct AI chain. Both are LCEL pipelines with Redis-backed message history keyed by `session_id`.
5. **Response** → Streamed back over SSE with inline source citations.

### Tech decisions

| Decision | Why | Trade-off |
|---|---|---|
| **pgvector (default)** | One Postgres for users, room ownership, and vectors | Tied to a Postgres instance; ChromaDB kept as legacy fallback (`USE_CHROMA`) |
| **LangChain (LCEL)** | Composable chains, memory, streaming | Pinned — see note below; abstraction overhead |
| **Groq `llama-3.3-70b`** | Free tier, fast inference | Rate limits on free plan |
| **HuggingFace embeddings** | Local, CPU-only, no API cost | Slower cold start (warmed at startup) |
| **Hybrid search + rerank** | Better recall than pure semantic | Slight latency increase |
| **Room isolation** | Simple metadata filtering, no auth required | Metadata filtering, *not* cryptographic security |

> ⚠️ **LangChain is pinned** in `requirements.txt`. Do not upgrade it or its sub-packages without running the full test suite.

---

## Quick Start

### Prerequisites
- Python 3.12
- Node.js 18+
- PostgreSQL with the `pgvector` extension and Redis (or just use Docker Compose below)
- [Groq API Key](https://console.groq.com/) (free)

### Option 1: Docker (recommended)

Compose orchestrates four services: `postgres` (pgvector/pg16), `redis`, `backend` (FastAPI), and `frontend` (nginx).

```bash
cp backend/.env.example backend/.env   # add your GROQ_API_KEY
docker compose up --build

# Frontend : http://localhost:3000
# API docs : http://localhost:8000/docs   (DEBUG only)
# Health   : http://localhost:8000/api/health
```

### Option 2: Local development

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/Mac
pip install -r requirements.txt

cp .env.example .env            # add GROQ_API_KEY; point DATABASE_URL / REDIS_URL at your services
uvicorn app.main:app --reload --port 8000   # Alembic migrations auto-run on startup

# Frontend (new terminal)
cd frontend
npm install
npm run dev                     # Vite on :5173, proxies /api → :8000
```

---

## Features

| Feature | Details |
|---|---|
| 🗂️ **Room isolation** | Anonymous rooms via localStorage, shareable by URL; `room_code` required on every ingest/chat |
| 🔐 **Authentication** | fastapi-users JWT — register / login / logout / password reset / verify, cookie + bearer backends |
| 🏷️ **Room claiming** | Authenticated users can claim rooms to their account (`/api/rooms`) |
| 📄 **Multi-format upload** | PDF, DOCX, TXT, XLSX, CSV (max 50MB) |
| 🔎 **OCR** | Scanned-PDF text extraction via Tesseract (toggle with `OCR_ENABLED`) |
| 🌐 **URL ingestion** | Single or batch web pages (main-content extraction) |
| 📝 **Notion import** | Single page or full database |
| 🔍 **Hybrid search + rerank** | Semantic + BM25 retrieval, then flashrank reranking |
| 💬 **Smart routing** | RAG with docs, general AI when empty |
| 🔄 **SSE streaming** | Real-time token streaming with source citations |
| 🧠 **Session memory** | Redis-backed chat history (in-memory fallback) |
| 🚦 **Rate limiting** | slowapi, Redis-backed with in-memory fallback |
| 🌙 **Theming** | Dark/light via CSS variables |
| 🇻🇳 **Vietnamese UI** | Localized interface |
| 🧪 **Evaluation** | RAGAS-based eval framework |

---

## Project Structure

```
ChatBot-RAG/
├── backend/
│   ├── app/
│   │   ├── main.py              # App assembly: lifespan, CORS, rate limiter, routers
│   │   ├── config.py            # Pydantic Settings (single source for env config)
│   │   ├── api/routes/
│   │   │   ├── chat.py          # POST /api/chat — SSE + smart routing
│   │   │   ├── ingest.py        # POST /api/ingest — file upload pipeline
│   │   │   ├── ingest_sources.py# /api/ingest/url|urls|notion|notion/db
│   │   │   ├── auth.py          # fastapi-users routers under /api/auth
│   │   │   ├── rooms.py         # GET /api/rooms, POST /api/rooms/{code}/claim
│   │   │   ├── eval.py          # RAGAS evaluation endpoint
│   │   │   └── health.py        # GET /api/health
│   │   ├── core/
│   │   │   ├── rag/chain.py     # LCEL RAG + direct chains, prompts, session history
│   │   │   ├── llm/llm.py       # get_llm() — Groq ChatGroq singleton
│   │   │   ├── vectordb/        # store.py (pgvector + USE_CHROMA flag), store_chroma.py
│   │   │   ├── ingestion/       # pdf, docx, excel, csv, ocr, web, notion, chunker
│   │   │   ├── auth/            # User + RoomOwnership models, schemas, JWT setup
│   │   │   ├── cache/           # redis_client, session_store
│   │   │   └── reranker.py      # flashrank reranking
│   │   └── models/schemas.py    # API request/response schemas
│   ├── alembic/                 # Migrations; auto-run on startup
│   ├── tests/                   # pytest suite
│   ├── requirements.txt         # Pinned dependencies
│   └── Dockerfile               # tesseract + poppler in runtime image
├── frontend/                    # React 19 + Vite + Tailwind 4
├── eval/                        # RAGAS evaluation
├── docker-compose.yml
└── README.md
```

---

## API Reference

### Chat (SSE stream)

```bash
POST /api/chat
Content-Type: application/json

{
  "question": "What is in my documents?",
  "room_code": "ABC12345",
  "active_doc_ids": ["doc-uuid-1"],   // optional — scope to specific docs
  "session_id": "session-uuid"        // optional — conversation memory
}
```
Streams SSE events: `start` → `token` … → `end` (with `sources`) | `error`.

### Document ingestion

```bash
# File upload (PDF/DOCX/TXT/XLSX/CSV)
POST /api/ingest        (multipart/form-data)  file=<binary>  room_code=ABC12345

# Web URL (single / batch)
POST /api/ingest/url    { "url": "https://example.com", "room_code": "ABC12345" }
POST /api/ingest/urls   { "urls": ["..."], "room_code": "ABC12345" }

# Notion (page / database)
POST /api/ingest/notion     { "page_id": "...", "room_code": "ABC12345" }
POST /api/ingest/notion/db  { "database_id": "...", "room_code": "ABC12345" }
```

### Document management

```bash
GET    /api/documents?room_code=ABC12345
DELETE /api/ingest/{doc_id}?room_code=ABC12345
```

### Auth & rooms

```bash
POST  /api/auth/register            # create user
POST  /api/auth/login               # cookie login (browser)
POST  /api/auth/jwt/login           # bearer login (programmatic)
GET   /api/auth/me                  # current profile
GET   /api/rooms                    # list rooms owned by user
POST  /api/rooms/{room_code}/claim  # link a room to your account
```

Full interactive docs at `/docs` (DEBUG mode only).

---

## Configuration

All backend config flows through `app/config.py` (`pydantic-settings`), set via `backend/.env` (gitignored). See `backend/.env.example` for the full list.

- **Required:** `GROQ_API_KEY`
- **LLM:** `LLM_MODEL`, `LLM_TEMPERATURE`, `LLM_MAX_TOKENS`
- **Embeddings:** `EMBEDDING_MODEL`
- **Retrieval/chunking:** `RETRIEVAL_TOP_K`, `RERANK_TOP_N`, `CHUNK_SIZE`, `CHUNK_OVERLAP`
- **Vector store:** `USE_CHROMA` (`false` → pgvector), `CHROMA_PERSIST_DIR`
- **PostgreSQL:** `DATABASE_URL` (asyncpg), `DATABASE_URL_SYNC` (psycopg)
- **Redis:** `REDIS_URL`, `REDIS_RATE_LIMIT_URL`
- **Auth:** `JWT_SECRET` (**change in production**), `JWT_LIFETIME_SECONDS`, `JWT_REFRESH_LIFETIME_SECONDS`
- **Rate limits:** `RATE_LIMIT_CHAT`, `RATE_LIMIT_INGEST`
- **Optional:** `OPENAI_API_KEY` (RAGAS eval only), `NOTION_TOKEN`, `OCR_ENABLED`, `TESSERACT_CMD`, `CORS_ORIGINS`

> **Never commit `.env` or real secrets.** Add new config as a typed field in `Settings` *and* document it in `.env.example`.

---

## Tech Stack

### Backend
| Component | Technology | Purpose |
|---|---|---|
| Framework | FastAPI 0.115 | Async API, SSE streaming, auto-docs |
| Orchestration | LangChain 0.3 (LCEL) | Chains, memory, streaming — **pinned** |
| LLM | Groq `llama-3.3-70b-versatile` | Free, fast inference |
| Embeddings | HuggingFace `all-MiniLM-L6-v2` | Local, CPU-only |
| Vector store | pgvector (default) / ChromaDB (legacy) | Switched by `USE_CHROMA` |
| Relational DB | PostgreSQL (pgvector image) | Users, room ownership, vectors |
| Cache / sessions | Redis | Chat history + rate-limit storage |
| Auth | fastapi-users (JWT) | UUID users, register/login/reset/verify |
| Migrations | Alembic | Auto-runs on startup |
| Rate limiting | slowapi | Redis-backed, in-memory fallback |
| Reranking | flashrank | `core/reranker.py` |
| Parsing | pypdf, python-docx, openpyxl, BeautifulSoup, pytesseract | PDF/DOCX/TXT/XLSX/CSV + OCR + web/Notion |

### Frontend
| Component | Technology | Purpose |
|---|---|---|
| Framework | React 19 | Functional components + hooks |
| Language | TypeScript ~5.9 | strict mode |
| Build | Vite 8 | Dev proxy `/api` → `:8000` |
| Styling | Tailwind CSS 4 | CSS-variable theming |
| Animation | Framer Motion | Glassmorphism effects |
| Markdown | react-markdown + remark-gfm + rehype-highlight | Render AI responses |
| Diagrams | mermaid | Render diagrams in answers |
| Tests | Vitest + Testing Library, Playwright | Unit + E2E |

### DevOps
| Component | Technology | Purpose |
|---|---|---|
| Containers | Docker Compose | postgres · redis · backend · frontend |
| Backend image | Python 3.12-slim | tesseract + poppler in runtime |
| Frontend image | nginx-alpine | Static serving |

---

## Testing

```bash
# Backend
cd backend
pytest                       # all tests
pytest tests/test_chat_api.py
pytest -k chunker

# Frontend
cd frontend
npm run build                # tsc typecheck + vite build (fails on type errors)
npm run test:run             # Vitest once
npm run test:e2e             # Playwright
```

Before claiming "done": backend changes → `pytest` green; frontend changes → `npm run build` **and** `npm run test:run` green. New features/bugfixes ship with a test.

---

## Security Notes

- **Room codes are not authentication.** Isolation is metadata filtering — anyone with a room code can see that room's documents. Don't store sensitive data in shared rooms.
- **Change `JWT_SECRET`** before any production deployment.
- The default Docker credentials (`readmind` / `readmind_dev`) are for local development only.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Author

Built by **Doan Vinh Hung** as a portfolio project demonstrating full-stack development (Python + TypeScript), LLM/RAG architecture, and containerized deployment.

📧 [hungmobile457@gmail.com](mailto:hungmobile457@gmail.com)  
🔗 [LinkedIn](https://linkedin.com/in/hưng-đoàn-vĩnh-4b5a5b400)  
🐙 [GitHub](https://github.com/Hungdoan565)

---

<div align="center">

**[⬆ Back to Top](#readmind)**

</div>
