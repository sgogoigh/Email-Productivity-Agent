"""Pydantic schemas for requests, responses, observability, and domain entities."""

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
    duration_ms: float = 0.0
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
    conversation_id: Optional[str] = None
    tone: Optional[str] = None


class ChatMessageOut(BaseModel):
    """Persisted chat turn linked to unique conversation_id and optional email_id."""

    id: str
    conversation_id: str
    scope: Literal["email", "inbox"]
    email_id: Optional[str] = None
    role: Literal["user", "assistant"]
    content: str
    latency_ms: Optional[float] = None
    llm_mode: Optional[str] = None
    model_name: Optional[str] = None
    quality_rating: Optional[int] = None
    quality_notes: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: str


class AgentChatResponse(BaseModel):
    """Assistant response returned by the Email Agent."""

    conversation_id: str
    user_message: ChatMessageOut
    assistant_message: ChatMessageOut
    suggested_draft: Optional[Dict[str, Any]] = None
    referenced_email_ids: List[str] = Field(default_factory=list)
    prompts_used: List[str] = Field(default_factory=list)
    latency_ms: float = 0.0
    error: Optional[str] = None


class ConversationOut(BaseModel):
    """Logged conversation summary."""

    id: str
    scope: Literal["email", "inbox"]
    email_id: Optional[str] = None
    title: str
    message_count: int = 0
    avg_latency_ms: Optional[float] = None
    positive_ratings: int = 0
    negative_ratings: int = 0
    created_at: str
    updated_at: str


class QualityFeedbackRequest(BaseModel):
    """User quality rating (+1 thumbs up, -1 thumbs down) for an assistant message."""

    rating: Literal[1, -1]
    notes: Optional[str] = Field(default=None, max_length=500)


class LLMExecutionLogOut(BaseModel):
    """Structured telemetry record for a single LLM call."""

    id: str
    request_id: Optional[str] = None
    operation: str
    conversation_id: Optional[str] = None
    email_id: Optional[str] = None
    prompt_key: Optional[str] = None
    prompt_hash: Optional[str] = None
    provider: str
    model: str
    started_at: str
    completed_at: str
    latency_ms: float
    input_tokens: int
    output_tokens: int
    total_tokens: int
    parse_valid: bool
    status: str
    error_message: Optional[str] = None
    output_preview: Optional[str] = None


class DatabaseStatusOut(BaseModel):
    """Live database connectivity diagnostic report."""

    status: str
    dialect: str
    wal_mode: Optional[str] = None
    db_latency_ms: float
    pool: Dict[str, Any] = Field(default_factory=dict)
    table_counts: Dict[str, int] = Field(default_factory=dict)


class OperationStatsOut(BaseModel):
    """Aggregated timing and reliability metrics per LLM operation."""

    operation: str
    count: int
    success_count: int
    error_count: int
    avg_latency_ms: float
    p95_latency_ms: float
    total_tokens: int


class ObservabilityMetricsOut(BaseModel):
    """Overall quality, timing, and usage dashboard metrics."""

    total_calls: int
    success_count: int
    error_count: int
    success_rate_pct: float
    avg_latency_ms: float
    p95_latency_ms: float
    total_tokens: int
    parse_valid_rate_pct: float
    total_conversations: int
    rated_messages: int
    positive_ratings: int
    negative_ratings: int
    approval_rate_pct: Optional[float] = None
    by_operation: List[OperationStatsOut] = Field(default_factory=list)


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

    status: Literal["ok", "degraded"]
    service: str
    version: str
    llm_mode: str
    db_status: str
    db_dialect: str
    db_latency_ms: float
    email_count: int
    prompt_count: int
    draft_count: int
    conversation_count: int
    log_count: int
