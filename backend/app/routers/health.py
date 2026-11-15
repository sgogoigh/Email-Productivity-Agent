"""Healthcheck endpoint."""

from fastapi import APIRouter, Depends

from app.config import Settings
from app.dependencies import get_app_settings, get_store
from app.models.schemas import HealthResponse
from app.repositories.store import EmailStore

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health_check(
    settings: Settings = Depends(get_app_settings),
    store: EmailStore = Depends(get_store),
) -> HealthResponse:
    """Return service readiness, active LLM mode, and SQLite entity counts."""
    counts = store.get_counts()
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        llm_mode=settings.effective_llm_mode,
        **counts,
    )
