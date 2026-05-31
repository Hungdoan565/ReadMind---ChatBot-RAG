from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List
import json


class Settings(BaseSettings):
    # App
    APP_NAME: str = "RAG Chatbot"
    APP_ENV: str = "development"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # OpenAI (optional — only needed for RAGAS eval now)
    OPENAI_API_KEY: str = ""

    # Groq
    GROQ_API_KEY: str

    # ChromaDB
    CHROMA_PERSIST_DIR: str = "./data/chroma"

    # LLM
    LLM_MODEL: str = "llama-3.3-70b-versatile"
    LLM_TEMPERATURE: float = 0.0
    LLM_MAX_TOKENS: int = 2048

    # Embedding
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"  # HuggingFace local model

    # RAGAS evaluation (chỉ dùng cho eval; tách khỏi App embeddings/LLM)
    RAGAS_EMBEDDING_MODEL: str = "text-embedding-3-small"  # OpenAI embeddings cho RAGAS
    RAGAS_LLM_MODEL: str = "gpt-4o-mini"  # OpenAI chat model làm LLM judge
    RAGAS_EVAL_ROOM_CODE: str = "eval"  # room cố định chứa corpus mẫu
    RAGAS_THRESHOLD_FAITHFULNESS: float = 0.9
    RAGAS_THRESHOLD_ANSWER_RELEVANCY: float = 0.8
    RAGAS_THRESHOLD_CONTEXT_PRECISION: float = 0.75

    # Retrieval
    # RETRIEVAL_TOP_K: số ứng viên truy hồi (dense+BM25 fuse) trước rerank.
    # RERANK_TOP_N: số chunk cuối cùng đưa vào context của LLM.
    # Với CHUNK_SIZE=512, RERANK_TOP_N=8 ~ 4k token context — đủ cho phần lớn
    # câu hỏi chi tiết mà vẫn an toàn với rate limit Groq. (Câu hỏi "tóm tắt cả
    # tài liệu" vẫn là giới hạn bản chất của RAG top-k — xem MAP_REDUCE phía dưới.)
    RETRIEVAL_TOP_K: int = 20
    RERANK_TOP_N: int = 8

    # Chunking
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 52

    # Notion
    NOTION_TOKEN: str = ""

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://chatbot-rag.up.railway.app",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v

    model_config = {"env_file": ".env", "case_sensitive": True}


    # Rate Limiting
    RATE_LIMIT_CHAT: str = "20/minute"
    RATE_LIMIT_INGEST: str = "10/minute"


    # PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://readmind:readmind_dev@localhost:5432/readmind"
    DATABASE_URL_SYNC: str = "postgresql+psycopg://readmind:readmind_dev@localhost:5432/readmind"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_RATE_LIMIT_URL: str = "redis://localhost:6379/1"

    # Auth
    JWT_SECRET: str = "CHANGE-ME-IN-PRODUCTION"
    JWT_LIFETIME_SECONDS: int = 3600
    JWT_REFRESH_LIFETIME_SECONDS: int = 604800

    # Migration feature flag
    USE_CHROMA: bool = False

    # OCR
    OCR_ENABLED: bool = True
    TESSERACT_CMD: str = "tesseract"

settings = Settings()
