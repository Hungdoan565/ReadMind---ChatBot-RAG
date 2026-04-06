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

    # Retrieval
    RETRIEVAL_TOP_K: int = 10
    RERANK_TOP_N: int = 4

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


settings = Settings()
