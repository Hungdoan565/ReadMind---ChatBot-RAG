<div align="center">

# 📚 ReadMind

**Production-ready RAG Chatbot** with anonymous room-based document isolation

Query your documents with AI. No login required. Built with FastAPI, LangChain, ChromaDB, and React.

![Python](https://img.shields.io/badge/Python-3.9+-3776AB?logo=python&logoColor=white&style=for-the-badge)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white&style=for-the-badge)
![React](https://img.shields.io/badge/React-19+-61DAFB?logo=react&logoColor=black&style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

<img src="assets/demo.gif" alt="ReadMind Demo" width="700" />

</div>

---

## Why ReadMind?

Most document Q&A tools are either:
- **Generic** — Not aware of your team's context
- **Expensive** — Closed-source SaaS with vendor lock-in  
- **Insecure** — Central database leaks data across users

**ReadMind solves this** with:
- 🔐 **Room-based isolation** — Each session gets its own document vault, no account required
- ⚡ **Smart routing** — RAG mode for uploaded docs, general AI mode when room is empty
- 🚀 **Zero friction** — Upload → Ask → Get answers in seconds

> Built as a portfolio project demonstrating full-stack LLM architecture, from RAG pipeline design to production-ready deployment.

---

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │
│  │ FileUpload│  │UrlIngest │  │ DocList  │  │    ChatWindow        │ │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └──────────┬───────────┘ │
│        │             │             │                   │             │
│        └─────────────┴─────────────┴───────────────────┘             │
│                              │ room_code                             │
└──────────────────────────────┼───────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          BACKEND (FastAPI)                          │
│  ┌────────────┐    ┌────────────┐    ┌────────────────────────────┐ │
│  │ /api/ingest│───▶│  Chunker   │───▶│      ChromaDB              │ │
│  │ /api/ingest│    │ (500 chars)│    │  (room_code + doc_id)      │ │
│  │   /url     │    └────────────┘    └────────────────────────────┘ │
│  └────────────┘                                   │                 │
│                                                   ▼                 │
│  ┌────────────┐    ┌────────────┐    ┌────────────────────────────┐ │
│  │ /api/chat  │───▶│Smart Router│───▶│  RAG Chain / Direct Chain  │ │
│  │            │    │(has docs?) │    │      (LangChain + Groq)    │ │
│  └────────────┘    └────────────┘    └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Ingestion** → Documents uploaded to a room, chunked (500 chars), embedded via HuggingFace
2. **Storage** → Vectors indexed in ChromaDB with `room_code` metadata for isolation
3. **Query** → User question → hybrid search (semantic + BM25) → top-k retrieval
4. **Routing** → If room has documents → RAG chain; else → direct AI chain
5. **Response** → Streamed back with inline source citations

### Tech Decisions

| Decision | Why | Trade-off |
|----------|-----|-----------|
| **ChromaDB** | Lightweight, in-process, no external infra | Single-machine scale (~100k vectors) |
| **LangChain** | Built-in chains, memory, streaming | Adds ~30MB, abstraction overhead |
| **Groq LLM** | Free tier, fast inference (llama/mixtral) | Rate limits on free plan |
| **Room isolation** | Simple metadata filtering, no auth needed | Not cryptographically secure |
| **Hybrid search** | Better recall than pure semantic | Slight latency increase |

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- [Groq API Key](https://console.groq.com/) (free)

### Option 1: Local Development

```bash
# Clone
git clone https://github.com/yourusername/readmind.git
cd readmind

# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux/Mac
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env: add GROQ_API_KEY=gsk_...

# Run backend
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev

# Visit http://localhost:5173
```

### Option 2: Docker (Recommended)

```bash
# Configure
cp backend/.env.example backend/.env
# Edit backend/.env: add GROQ_API_KEY=gsk_...

# Run
docker compose up --build

# Visit http://localhost:3000
# API docs: http://localhost:8000/docs
```

---

## Features

| Feature | Status | Details |
|---------|--------|---------|
| 🔐 **Room Isolation** | ✅ Done | Anonymous rooms via localStorage, shareable via URL |
| 📄 **Multi-format Upload** | ✅ Done | PDF, TXT, MD, DOCX support |
| 🌐 **URL Ingestion** | ✅ Done | Crawl any webpage, JS rendering via Jina Reader |
| 🔍 **Hybrid Search** | ✅ Done | Semantic (embeddings) + keyword (BM25) |
| 💬 **Smart Routing** | ✅ Done | RAG mode with docs, general AI without |
| 🌙 **Dark/Light Theme** | ✅ Done | System preference + manual toggle |
| 📱 **Responsive UI** | ✅ Done | Mobile-friendly with drawer sidebar |
| ✨ **Glassmorphism UI** | ✅ Done | Modern glass effects, particle background |
| 🇻🇳 **Vietnamese UI** | ✅ Done | Localized interface |
| 📊 **Source Citations** | ✅ Done | Inline chips with expandable details |
| 🔄 **Streaming** | ✅ Done | Real-time token streaming |
| 📝 **Notion Import** | ✅ Done | Import pages from Notion |
| 🧪 **Evaluation** | ✅ Done | RAGAS-based eval framework |

---

## Project Structure

```
readmind/
├── backend/
│   ├── app/
│   │   ├── api/routes/       # FastAPI endpoints
│   │   │   ├── chat.py       # Chat + smart routing
│   │   │   ├── ingest.py     # File upload
│   │   │   └── ingest_sources.py  # URL/Notion
│   │   ├── core/
│   │   │   ├── ingestion/    # PDF, DOCX, web parsers
│   │   │   ├── rag/          # LangChain chains
│   │   │   ├── llm/          # LLM config (Groq)
│   │   │   └── vectordb/     # ChromaDB store
│   │   ├── models/           # Pydantic schemas
│   │   └── config.py         # Settings
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/       # React components (20+)
│   │   ├── hooks/            # useChat, useRoom
│   │   ├── api/              # API clients
│   │   └── types/            # TypeScript types
│   ├── package.json
│   └── Dockerfile
├── eval/                     # Evaluation scripts
├── docker-compose.yml
└── README.md
```

---

## API Reference

### Chat

```bash
POST /api/chat
Content-Type: application/json

{
  "question": "What is in my documents?",
  "room_code": "ABC12345",
  "active_doc_ids": ["doc-uuid-1", "doc-uuid-2"],  // optional
  "session_id": "session-uuid"  // optional, for conversation memory
}
```

### Document Ingestion

```bash
# File upload
POST /api/ingest
Content-Type: multipart/form-data
- file: <binary>
- room_code: "ABC12345"

# URL ingestion
POST /api/ingest/url
{
  "url": "https://example.com/article",
  "room_code": "ABC12345"
}
```

### Document Management

```bash
# List documents in room
GET /api/documents?room_code=ABC12345

# Delete document
DELETE /api/documents/{doc_id}?room_code=ABC12345
```

Full API documentation available at `/docs` when running in debug mode.

---

## Production Readiness

### What Works Now
- ✅ Room-based document isolation (metadata filtering)
- ✅ Graceful error handling with retry UI
- ✅ Smart routing between RAG and direct AI modes
- ✅ Docker deployment with health checks
- ✅ Structured logging

### Known Limitations
- ⚠️ **No authentication** — Room codes are anonymous, not secure for sensitive data
- ⚠️ **Single-machine scale** — ChromaDB is in-process; use Pinecone/Weaviate for scale
- ⚠️ **No rate limiting** — Add via FastAPI middleware for production
- ⚠️ **Embedding model** — HuggingFace local model; may be slow on first load

### What I'd Add Next
1. JWT authentication with FastAPI-Users
2. PostgreSQL + pgvector for production vector storage
3. Redis for session management
4. Prometheus metrics endpoint
5. E2E tests with Playwright

---

## Tech Stack

### Backend
| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | FastAPI 0.115 | Async API, auto-docs |
| LLM | Groq (llama-3.3-70b) | Free, fast inference |
| Embeddings | HuggingFace (all-MiniLM-L6-v2) | Local, no API cost |
| Vector DB | ChromaDB 0.6 | Embedded, metadata filtering |
| Orchestration | LangChain 0.3 | Chains, memory, streaming |
| Parsing | pypdf, python-docx, BeautifulSoup | Multi-format support |

### Frontend
| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | React 19 | UI components |
| Styling | Tailwind CSS 4 | Utility-first CSS |
| Animation | Framer Motion | Glassmorphism effects |
| Icons | Lucide React | Consistent iconography |
| Markdown | react-markdown | Render AI responses |

### DevOps
| Component | Technology | Purpose |
|-----------|------------|---------|
| Containers | Docker Compose | One-command deployment |
| Backend | Python 3.12-slim | Minimal image |
| Frontend | nginx-alpine | Static serving |

---

## Contributing

Contributions welcome! This is a portfolio project, but improvements are appreciated.

```bash
# Fork and clone
git checkout -b feature/your-idea

# Backend tests
cd backend && pytest

# Frontend build
cd frontend && npm run build

# Submit PR
```

### Good First Issues
- [ ] Add OCR support for scanned PDFs
- [ ] Implement rate limiting middleware
- [ ] Add more file format support (Excel, CSV)
- [ ] Improve chunking strategy

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Author

Built by **[Doan Vinh Hung]** as a portfolio project demonstrating:
- Full-stack development (Python + TypeScript)
- LLM/RAG architecture design
- Production deployment patterns
- Modern UI/UX implementation

📧 [hungmobile457@gmail.com](mailto:dvinhhung.dev@gmail.com)  
🔗 [LinkedIn](https://linkedin.com/in/hưng-đoàn-vĩnh-4b5a5b400)  
🐙 [GitHub](https://github.com/Hungdoan565)

---

<div align="center">

**[⬆ Back to Top](#-readmind)**

</div>
