# Backend Dockerfile — multi-stage build for minimal production image
# Stage 1: builder — installs deps into a virtual env
# Stage 2: runtime — copies only the venv, no build tools

# ---- Builder ----
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build dependencies for packages like chromadb, numpy
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Create venv
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python deps first (layer cache)
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt


# ---- Runtime ----
FROM python:3.12-slim AS runtime

WORKDIR /app

# Non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser -d /home/appuser -m appuser

# HuggingFace cache directory (for sentence-transformers model)
ENV HF_HOME=/home/appuser/.cache/huggingface
RUN mkdir -p $HF_HOME && chown -R appuser:appuser /home/appuser

# Copy only the venv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application code
COPY app/ ./app/

# Data directory for ChromaDB persistence
RUN mkdir -p ./data/chroma && chown -R appuser:appuser /app

USER appuser

# Expose FastAPI port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"

# Run with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
