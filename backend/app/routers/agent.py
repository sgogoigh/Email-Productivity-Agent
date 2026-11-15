"""Conversational Email Agent routes with conversation_id filtering."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_agent_service, get_store
from app.models.schemas import AgentChatRequest, AgentChatResponse, ChatMessageOut
from app.repositories.store import EmailStore
from app.services.email_agent import EmailAgentService

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.post("/chat", response_model=AgentChatResponse)
async def chat_with_agent(
    payload: AgentChatRequest,
    agent_service: EmailAgentService = Depends(get_agent_service),
) -> AgentChatResponse:
    """Run a chat query over a selected email or the entire inbox using stored prompts."""
    try:
        return await agent_service.chat(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/history", response_model=List[ChatMessageOut])
def get_chat_history(
    scope: Optional[str] = Query(default=None),
    email_id: Optional[str] = Query(default=None),
    conversation_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    store: EmailStore = Depends(get_store),
) -> List[ChatMessageOut]:
    """Retrieve stored Email Agent chat history filtered by conversation_id, email_id, or scope."""
    return store.list_chat_messages(
        scope=scope, email_id=email_id, conversation_id=conversation_id, limit=limit
    )


@router.delete("/history", status_code=204)
def clear_chat_history(store: EmailStore = Depends(get_store)) -> None:
    """Clear stored chat transcript and conversation summaries."""
    store.clear_chat_messages()
