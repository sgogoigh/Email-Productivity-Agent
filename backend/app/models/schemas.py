"""Pydantic schemas for requests, responses, and domain entities."""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ActionItem(BaseModel):
    """Structured task extracted from an email."""

    task: str = Field(..., min_length=1)
    deadline: str = Field(default="Unspecified")


class EmailInput(BaseModel):
    """Schema for ingesting a custom email JSON object."""

    id: Optional[str] = None
    thread_id: Optional[str] = None
    sender: str
    sender_email: str
    recipient: str = "user@acme-corp.io"
    subject: str
    body: str
    timestamp: str
    is_read: bool = False


class EmailOut(BaseModel):
    """Email representation returned to the UI."""

    id: str
    thread_id: str
    sender: str
    sender_email: str
    recipient: str
    subject: str
    body: str
    timestamp: str
    is_read: bool
    category: Optional[str] = None
    urgency: Optional[str] = None
    category_reason: Optional[str] = None
    action_items: List[ActionItem] = Field(default_factory=list)
    processing_error: Optional[str] = None
    processed_at: Optional[str] = None


class DraftOut(BaseModel):
    """Stored email draft. Status is strictly 'draft' and never auto-sent."""

    id: str
    email_id: Optional[str] = None
    subject: str
    body: str
    suggested_followups: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    status: Literal["draft"] = "draft"
    created_at: str
    updated_at: str


class EmailDetailOut(EmailOut):
    """Detailed email view including chronological thread context and saved drafts."""

    thread_emails: List[EmailOut] = Field(default_factory=list)
    drafts: List[DraftOut] = Field(default_factory=list)


class LoadMockResponse(BaseModel):
    """Response after loading or resetting the mock inbox."""

    loaded_count: int
    emails: List[EmailOut]


class ProcessInboxRequest(BaseModel):
    """Optional subset of email IDs to process; empty processes all inbox emails."""

    email_ids: Optional[List[str]] = None


class ProcessInboxResponse(BaseModel):
    """Summary of an ingestion pipeline execution."""

    total_requested: int
    processed_count: int
    error_count: int
    prompts_used: Dict[str, str]
    emails: List[EmailOut]


class PromptCreate(BaseModel):
    """Payload to create a new custom prompt in the Prompt Brain."""

    key: str = Field(..., min_length=2, max_length=64, pattern=r"^[a-z0-9_-]+$")
    name: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    template: str = Field(..., min_length=5)


class PromptUpdate(BaseModel):
    """Payload to update an existing prompt configuration."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    template: str = Field(..., min_length=5)


class PromptOut(BaseModel):
    """Stored Prompt Brain item."""

    key: str
    name: str
    description: str
    template: str
    is_default: bool
    updated_at: str


class AgentChatRequest(BaseModel):
    """Chat query sent to the Email Processing Agent."""

    query: str = Field(..., min_length=1)
    scope: Literal["email", "inbox"] = "email"
    email_id: Optional[str] = None
    tone: Optional[str] = None


class ChatMessageOut(BaseModel):
    """Persisted chat turn."""

    id: str
    scope: Literal["email", "inbox"]
    email_id: Optional[str] = None
    role: Literal["user", "assistant"]
    content: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: str


class AgentChatResponse(BaseModel):
    """Assistant response returned by the Email Agent."""

    user_message: ChatMessageOut
    assistant_message: ChatMessageOut
    suggested_draft: Optional[Dict[str, Any]] = None
    referenced_email_ids: List[str] = Field(default_factory=list)
    prompts_used: List[str] = Field(default_factory=list)
    error: Optional[str] = None


class DraftGenerateRequest(BaseModel):
    """Request to generate an AI-authored reply or new email draft."""

    email_id: Optional[str] = None
    instruction: Optional[str] = None
    tone: str = "polite and professional"
    recipient: Optional[str] = None
    subject_hint: Optional[str] = None


class DraftCreate(BaseModel):
    """Request to manually create and save a new draft."""

    email_id: Optional[str] = None
    subject: str = Field(..., min_length=1)
    body: str = Field(..., min_length=1)
    suggested_followups: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class DraftUpdate(BaseModel):
    """Request to edit and save an existing draft."""

    subject: Optional[str] = Field(default=None, min_length=1)
    body: Optional[str] = Field(default=None, min_length=1)
    suggested_followups: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


class HealthResponse(BaseModel):
    """Healthcheck payload for readiness probes and UI status indicator."""

    status: Literal["ok"]
    service: str
    version: str
    llm_mode: str
    email_count: int
    prompt_count: int
    draft_count: int
