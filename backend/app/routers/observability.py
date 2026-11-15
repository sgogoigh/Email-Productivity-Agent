"""Observability, database connectivity, conversation logs, and quality rating routes."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_store
from app.models.schemas import (
    ChatMessageOut,
    ConversationOut,
    DatabaseStatusOut,
    LLMExecutionLogOut,
    ObservabilityMetricsOut,
    QualityFeedbackRequest,
)
from app.repositories.store import EmailStore

router = APIRouter(prefix="/api/observability", tags=["observability"])


@router.get("/db-status", response_model=DatabaseStatusOut)
def get_database_status(store: EmailStore = Depends(get_store)) -> DatabaseStatusOut:
    """Verify live database connectivity, measure ping latency, and inspect table counts."""
    return store.get_db_status()


@router.get("/metrics", response_model=ObservabilityMetricsOut)
def get_observability_metrics(
    store: EmailStore = Depends(get_store),
) -> ObservabilityMetricsOut:
    """Return aggregated timing, token usage, reliability, and quality feedback metrics."""
    return store.get_observability_metrics()


@router.get("/logs", response_model=List[LLMExecutionLogOut])
def list_execution_logs(
    operation: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    email_id: Optional[str] = Query(default=None),
    conversation_id: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    store: EmailStore = Depends(get_store),
) -> List[LLMExecutionLogOut]:
    """Query LLM execution telemetry records by operation, status, email_id, or conversation_id."""
    return store.list_llm_logs(
        operation=operation,
        status=status,
        email_id=email_id,
        conversation_id=conversation_id,
        limit=limit,
    )


@router.get("/conversations", response_model=List[ConversationOut])
def list_conversations(
    email_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    store: EmailStore = Depends(get_store),
) -> List[ConversationOut]:
    """List logged conversations with unique conversation_id, email_id, and timing stats."""
    return store.list_conversations(email_id=email_id, limit=limit)


@router.post("/messages/{message_id}/feedback", response_model=ChatMessageOut)
def submit_message_feedback(
    message_id: str,
    payload: QualityFeedbackRequest,
    store: EmailStore = Depends(get_store),
) -> ChatMessageOut:
    """Record thumbs-up (+1) or thumbs-down (-1) quality rating on a chat turn."""
    updated = store.rate_chat_message(
        message_id=message_id, rating=payload.rating, notes=payload.notes
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Chat message '{message_id}' not found")
    return updated
