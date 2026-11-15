"""Healthcheck endpoint including live database connectivity diagnostics."""

from fastapi import APIRouter, Depends

from app.config import Settings
from app.database import ping_database
from app.dependencies import get_app_settings, get_store
from app.models.schemas import HealthResponse
from app.repositories.store import EmailStore

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health_check(
    settings: Settings = Depends(get_app_settings),
    store: EmailStore = Depends(get_store),
) -> HealthResponse:
    """Return service readiness, live DB ping latency, active LLM mode, and entity counts."""
    counts = store.get_counts()
    try:
        db_ping = ping_database(store.engine)
        db_status = db_ping["status"]
        db_dialect = db_ping["dialect"]
        db_latency_ms = db_ping["db_latency_ms"]
        status = "ok"
    except Exception:
        db_status = "error"
        db_dialect = store.engine.dialect.name
        db_latency_ms = -1.0
        status = "degraded"

    return HealthResponse(
        status=status,
        service=settings.app_name,
        version=settings.app_version,
        llm_mode=settings.effective_llm_mode,
        db_status=db_status,
        db_dialect=db_dialect,
        db_latency_ms=db_latency_ms,
        **counts,
    )
