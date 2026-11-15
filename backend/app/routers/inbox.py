"""Inbox loading, querying, and ingestion pipeline routes."""

from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import Settings
from app.dependencies import get_agent_service, get_app_settings, get_store
from app.models.schemas import (
    EmailDetailOut,
    EmailInput,
    EmailOut,
    LoadMockResponse,
    ProcessInboxRequest,
    ProcessInboxResponse,
)
from app.repositories.store import EmailStore
from app.services.email_agent import EmailAgentService

router = APIRouter(prefix="/api/inbox", tags=["inbox"])


@router.post("/load-mock", response_model=LoadMockResponse)
def load_mock_inbox(
    settings: Settings = Depends(get_app_settings),
    store: EmailStore = Depends(get_store),
) -> LoadMockResponse:
    """Load or reset the 16-email Mock Inbox JSON into SQLite."""
    mock_path = Path(settings.mock_inbox_path)
    if not mock_path.exists():
        raise HTTPException(status_code=404, detail=f"Mock inbox file not found: {mock_path}")
    emails = store.load_mock_inbox(mock_path, clear_existing=True)
    return LoadMockResponse(loaded_count=len(emails), emails=emails)


@router.post("/upload", response_model=LoadMockResponse)
def upload_emails(
    emails: List[EmailInput],
    replace: bool = Query(default=False, description="Replace existing inbox emails if true"),
    store: EmailStore = Depends(get_store),
) -> LoadMockResponse:
    """Ingest custom email JSON objects into the inbox."""
    saved = store.ingest_raw_emails(emails, clear_existing=replace)
    return LoadMockResponse(loaded_count=len(emails), emails=saved)


@router.get("/emails", response_model=List[EmailOut])
def list_emails(
    category: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    processed: Optional[bool] = Query(default=None),
    store: EmailStore = Depends(get_store),
) -> List[EmailOut]:
    """List inbox emails with optional category, search, and processed filters."""
    return store.list_emails(category=category, search=search, processed=processed)


@router.get("/emails/{email_id}", response_model=EmailDetailOut)
def get_email_detail(
    email_id: str,
    store: EmailStore = Depends(get_store),
) -> EmailDetailOut:
    """Return a single email along with its thread context and saved drafts."""
    detail = store.get_email_detail(email_id)
    if not detail:
        raise HTTPException(status_code=404, detail=f"Email '{email_id}' not found")
    return detail


@router.post("/process", response_model=ProcessInboxResponse)
async def process_inbox(
    payload: Optional[ProcessInboxRequest] = None,
    agent_service: EmailAgentService = Depends(get_agent_service),
) -> ProcessInboxResponse:
    """Run categorization and action-item extraction via stored Prompt Brain prompts."""
    email_ids = payload.email_ids if payload else None
    return await agent_service.process_inbox(email_ids=email_ids)
