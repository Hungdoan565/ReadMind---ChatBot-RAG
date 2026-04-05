from fastapi import APIRouter
from datetime import datetime, timezone
from app.models.schemas import HealthResponse
from app.config import settings

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="ok",
        app=settings.APP_NAME,
        version="0.1.0",
        timestamp=datetime.now(timezone.utc),
    )
