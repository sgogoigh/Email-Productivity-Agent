"""Draft Generation Agent routes (drafts are strictly saved, never auto-sent)."""

from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_agent_service, get_store
from app.models.schemas import DraftCreate, DraftGenerateRequest, DraftOut, DraftUpdate
from app.repositories.store import EmailStore
from app.services.email_agent import EmailAgentService
from app.services.llm_client import LLMServiceError

router = APIRouter(prefix="/api/drafts", tags=["drafts"])


@router.get("", response_model=List[DraftOut])
def list_drafts(
    email_id: Optional[str] = Query(default=None),
    store: EmailStore = Depends(get_store),
) -> List[DraftOut]:
    """List saved email drafts."""
    return store.list_drafts(email_id=email_id)


@router.post("/generate", response_model=DraftOut, status_code=201)
async def generate_draft(
    payload: DraftGenerateRequest,
    agent_service: EmailAgentService = Depends(get_agent_service),
) -> DraftOut:
    """Generate a new email or thread-aware reply draft using the Auto-Reply prompt."""
    try:
        return await agent_service.generate_draft(payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (LLMServiceError, httpx.HTTPError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Unable to generate draft due to LLM error: {exc}",
        )


@router.post("", response_model=DraftOut, status_code=201)
def create_draft(
    payload: DraftCreate,
    store: EmailStore = Depends(get_store),
) -> DraftOut:
    """Manually save a new draft without sending."""
    if payload.email_id and not store.get_email(payload.email_id):
        raise HTTPException(status_code=404, detail=f"Email '{payload.email_id}' not found")
    return store.create_draft(
        subject=payload.subject,
        body=payload.body,
        email_id=payload.email_id,
        suggested_followups=payload.suggested_followups,
        metadata=payload.metadata,
    )


@router.put("/{draft_id}", response_model=DraftOut)
def update_draft(
    draft_id: str,
    payload: DraftUpdate,
    store: EmailStore = Depends(get_store),
) -> DraftOut:
    """Edit and persist an existing draft."""
    updated = store.update_draft(
        draft_id=draft_id,
        subject=payload.subject,
        body=payload.body,
        suggested_followups=payload.suggested_followups,
        metadata=payload.metadata,
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Draft '{draft_id}' not found")
    return updated


@router.delete("/{draft_id}", status_code=204)
def delete_draft(draft_id: str, store: EmailStore = Depends(get_store)) -> None:
    """Delete a saved draft."""
    if not store.delete_draft(draft_id):
        raise HTTPException(status_code=404, detail=f"Draft '{draft_id}' not found")
