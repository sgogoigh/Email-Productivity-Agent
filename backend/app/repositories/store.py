"""SQLAlchemy persistence repository for emails, Prompt Brain, drafts, chat, and telemetry."""

import hashlib
import json
import math
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy import Engine, case, delete, func, insert, or_, select, update

from app.database import (
    chat_messages_table,
    conversations_table,
    drafts_table,
    emails_table,
    llm_execution_logs_table,
    ping_database,
    prompts_table,
)
from app.models.schemas import (
    ActionItem,
    ChatMessageOut,
    ConversationOut,
    DatabaseStatusOut,
    DraftOut,
    EmailDetailOut,
    EmailInput,
    EmailOut,
    LLMExecutionLogOut,
    ObservabilityMetricsOut,
    OperationStatsOut,
    PromptOut,
)


def utc_now_iso() -> str:
    """Return current UTC timestamp in ISO-8601 format."""
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def compute_prompt_hash(template: str) -> str:
    """Return a short deterministic SHA-256 fingerprint of a prompt template."""
    return hashlib.sha256(template.encode("utf-8")).hexdigest()[:12]


def _percentile(values: List[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, math.ceil((pct / 100.0) * len(ordered)) - 1))
    return round(ordered[idx], 2)


def _parse_json_list(raw: Optional[str]) -> List[Any]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        return []


def _parse_json_dict(raw: Optional[str]) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _row_to_email(row: Any) -> EmailOut:
    raw_items = _parse_json_list(row["action_items_json"])
    items: List[ActionItem] = []
    for item in raw_items:
        if isinstance(item, dict) and item.get("task"):
            items.append(
                ActionItem(
                    task=str(item["task"]),
                    deadline=str(item.get("deadline") or "Unspecified"),
                )
            )
    return EmailOut(
        id=row["id"],
        thread_id=row["thread_id"],
        sender=row["sender"],
        sender_email=row["sender_email"],
        recipient=row["recipient"],
        subject=row["subject"],
        body=row["body"],
        timestamp=row["timestamp"],
        is_read=bool(row["is_read"]),
        category=row["category"],
        urgency=row["urgency"],
        category_reason=row["category_reason"],
        action_items=items,
        processing_error=row["processing_error"],
        processed_at=row["processed_at"],
    )


def _row_to_prompt(row: Any) -> PromptOut:
    return PromptOut(
        key=row["key"],
        name=row["name"],
        description=row["description"],
        template=row["template"],
        is_default=bool(row["is_default"]),
        updated_at=row["updated_at"],
    )


def _row_to_draft(row: Any) -> DraftOut:
    followups = [str(x) for x in _parse_json_list(row["suggested_followups_json"])]
    return DraftOut(
        id=row["id"],
        email_id=row["email_id"],
        subject=row["subject"],
        body=row["body"],
        suggested_followups=followups,
        metadata=_parse_json_dict(row["metadata_json"]),
        status="draft",
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_chat_message(row: Any) -> ChatMessageOut:
    return ChatMessageOut(
        id=row["id"],
        conversation_id=row["conversation_id"],
        scope=row["scope"],
        email_id=row["email_id"],
        role=row["role"],
        content=row["content"],
        latency_ms=row["latency_ms"],
        llm_mode=row["llm_mode"],
        model_name=row["model_name"],
        quality_rating=row["quality_rating"],
        quality_notes=row["quality_notes"],
        metadata=_parse_json_dict(row["metadata_json"]),
        created_at=row["created_at"],
    )


def _row_to_llm_log(row: Any) -> LLMExecutionLogOut:
    return LLMExecutionLogOut(
        id=row["id"],
        request_id=row["request_id"],
        operation=row["operation"],
        conversation_id=row["conversation_id"],
        email_id=row["email_id"],
        prompt_key=row["prompt_key"],
        prompt_hash=row["prompt_hash"],
        provider=row["provider"],
        model=row["model"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
        latency_ms=row["latency_ms"],
        input_tokens=row["input_tokens"],
        output_tokens=row["output_tokens"],
        total_tokens=row["total_tokens"],
        parse_valid=bool(row["parse_valid"]),
        status=row["status"],
        error_message=row["error_message"],
        output_preview=row["output_preview"],
    )


class EmailStore:
    """Dialect-agnostic SQLAlchemy repository for all domain and observability tables."""

    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    # ------------------------------------------------------------------
    # Prompts ("The Agent Brain")
    # ------------------------------------------------------------------
    def seed_default_prompts(
        self, default_prompts_path: Path, overwrite: bool = False
    ) -> List[PromptOut]:
        """Load default prompt templates from JSON into the database."""
        data = json.loads(default_prompts_path.read_text(encoding="utf-8"))
        now = utc_now_iso()
        with self.engine.begin() as conn:
            for item in data:
                existing = conn.execute(
                    select(prompts_table.c.key).where(prompts_table.c.key == item["key"])
                ).first()
                values = {
                    "name": item["name"],
                    "description": item.get("description", ""),
                    "template": item["template"],
                    "is_default": 1 if item.get("is_default", True) else 0,
                    "updated_at": now,
                }
                if existing:
                    if overwrite:
                        conn.execute(
                            update(prompts_table)
                            .where(prompts_table.c.key == item["key"])
                            .values(**values)
                        )
                else:
                    conn.execute(
                        insert(prompts_table).values(key=item["key"], **values)
                    )
        return self.list_prompts()

    def list_prompts(self) -> List[PromptOut]:
        """Return all stored prompts ordered with core defaults first."""
        priority_order = case(
            (prompts_table.c.key == "categorization", 1),
            (prompts_table.c.key == "action_item", 2),
            (prompts_table.c.key == "auto_reply", 3),
            else_=4,
        )
        with self.engine.connect() as conn:
            rows = conn.execute(
                select(prompts_table).order_by(priority_order, prompts_table.c.name.asc())
            ).mappings()
            return [_row_to_prompt(row) for row in rows]

    def get_prompt(self, key: str) -> Optional[PromptOut]:
        """Return a single prompt by key."""
        with self.engine.connect() as conn:
            row = (
                conn.execute(select(prompts_table).where(prompts_table.c.key == key))
                .mappings()
                .first()
            )
            return _row_to_prompt(row) if row else None

    def get_prompt_map(self) -> Dict[str, PromptOut]:
        """Return prompts keyed by prompt key."""
        return {prompt.key: prompt for prompt in self.list_prompts()}

    def create_prompt(
        self, key: str, name: str, description: str, template: str
    ) -> PromptOut:
        """Create a new custom prompt template."""
        now = utc_now_iso()
        with self.engine.begin() as conn:
            conn.execute(
                insert(prompts_table).values(
                    key=key,
                    name=name,
                    description=description,
                    template=template,
                    is_default=0,
                    updated_at=now,
                )
            )
            row = (
                conn.execute(select(prompts_table).where(prompts_table.c.key == key))
                .mappings()
                .one()
            )
            return _row_to_prompt(row)

    def update_prompt(
        self,
        key: str,
        template: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Optional[PromptOut]:
        """Update an existing prompt template."""
        now = utc_now_iso()
        with self.engine.begin() as conn:
            existing = (
                conn.execute(select(prompts_table).where(prompts_table.c.key == key))
                .mappings()
                .first()
            )
            if not existing:
                return None
            conn.execute(
                update(prompts_table)
                .where(prompts_table.c.key == key)
                .values(
                    name=name if name is not None else existing["name"],
                    description=(
                        description if description is not None else existing["description"]
                    ),
                    template=template,
                    updated_at=now,
                )
            )
            row = (
                conn.execute(select(prompts_table).where(prompts_table.c.key == key))
                .mappings()
                .one()
            )
            return _row_to_prompt(row)

    def delete_prompt(self, key: str) -> bool:
        """Delete a non-default custom prompt."""
        with self.engine.begin() as conn:
            row = (
                conn.execute(
                    select(prompts_table.c.is_default).where(prompts_table.c.key == key)
                )
                .mappings()
                .first()
            )
            if not row or row["is_default"]:
                return False
            conn.execute(delete(prompts_table).where(prompts_table.c.key == key))
            return True

    # ------------------------------------------------------------------
    # Emails & Processing State
    # ------------------------------------------------------------------
    def load_mock_inbox(
        self, mock_inbox_path: Path, clear_existing: bool = True
    ) -> List[EmailOut]:
        """Load sample emails from JSON file into database."""
        raw_emails = json.loads(mock_inbox_path.read_text(encoding="utf-8"))
        parsed = [EmailInput(**item) for item in raw_emails]
        return self.ingest_raw_emails(parsed, clear_existing=clear_existing)

    def ingest_raw_emails(
        self, emails: List[EmailInput], clear_existing: bool = False
    ) -> List[EmailOut]:
        """Insert or reset raw emails in database prior to LLM processing."""
        with self.engine.begin() as conn:
            if clear_existing:
                conn.execute(delete(emails_table))
            for item in emails:
                email_id = item.id or f"email-{uuid.uuid4().hex[:8]}"
                thread_id = item.thread_id or f"thread-{email_id}"
                values = {
                    "thread_id": thread_id,
                    "sender": item.sender,
                    "sender_email": item.sender_email,
                    "recipient": item.recipient,
                    "subject": item.subject,
                    "body": item.body,
                    "timestamp": item.timestamp,
                    "is_read": 1 if item.is_read else 0,
                    "category": None,
                    "urgency": None,
                    "category_reason": None,
                    "action_items_json": "[]",
                    "processing_error": None,
                    "processed_at": None,
                }
                existing = conn.execute(
                    select(emails_table.c.id).where(emails_table.c.id == email_id)
                ).first()
                if existing:
                    conn.execute(
                        update(emails_table)
                        .where(emails_table.c.id == email_id)
                        .values(**values)
                    )
                else:
                    conn.execute(insert(emails_table).values(id=email_id, **values))
        return self.list_emails()

    def list_emails(
        self,
        category: Optional[str] = None,
        search: Optional[str] = None,
        processed: Optional[bool] = None,
    ) -> List[EmailOut]:
        """List emails ordered newest-first with optional filters."""
        stmt = select(emails_table)
        if category and category.lower() != "all":
            if category.lower() == "unprocessed":
                stmt = stmt.where(emails_table.c.category.is_(None))
            else:
                stmt = stmt.where(
                    func.lower(emails_table.c.category) == category.lower()
                )
        if processed is True:
            stmt = stmt.where(emails_table.c.processed_at.is_not(None))
        elif processed is False:
            stmt = stmt.where(emails_table.c.processed_at.is_(None))
        if search and search.strip():
            term = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    emails_table.c.sender.ilike(term),
                    emails_table.c.sender_email.ilike(term),
                    emails_table.c.subject.ilike(term),
                    emails_table.c.body.ilike(term),
                )
            )
        stmt = stmt.order_by(emails_table.c.timestamp.desc(), emails_table.c.id.asc())
        with self.engine.connect() as conn:
            rows = conn.execute(stmt).mappings()
            return [_row_to_email(row) for row in rows]

    def get_email(self, email_id: str) -> Optional[EmailOut]:
        """Fetch a single email by ID."""
        with self.engine.connect() as conn:
            row = (
                conn.execute(select(emails_table).where(emails_table.c.id == email_id))
                .mappings()
                .first()
            )
            return _row_to_email(row) if row else None

    def get_email_detail(self, email_id: str) -> Optional[EmailDetailOut]:
        """Fetch email alongside chronological thread context and associated drafts."""
        email = self.get_email(email_id)
        if not email:
            return None
        with self.engine.connect() as conn:
            thread_rows = conn.execute(
                select(emails_table)
                .where(emails_table.c.thread_id == email.thread_id)
                .order_by(emails_table.c.timestamp.asc(), emails_table.c.id.asc())
            ).mappings()
            draft_rows = conn.execute(
                select(drafts_table)
                .where(drafts_table.c.email_id == email.id)
                .order_by(drafts_table.c.updated_at.desc())
            ).mappings()
            return EmailDetailOut(
                **email.model_dump(),
                thread_emails=[_row_to_email(r) for r in thread_rows],
                drafts=[_row_to_draft(r) for r in draft_rows],
            )

    def save_email_processing(
        self,
        email_id: str,
        category: Optional[str],
        urgency: Optional[str],
        category_reason: Optional[str],
        action_items: List[ActionItem],
        processing_error: Optional[str] = None,
    ) -> Optional[EmailOut]:
        """Persist categorization and extracted action items for an email."""
        now = utc_now_iso()
        serialized_items = json.dumps([item.model_dump() for item in action_items])
        with self.engine.begin() as conn:
            conn.execute(
                update(emails_table)
                .where(emails_table.c.id == email_id)
                .values(
                    category=category,
                    urgency=urgency,
                    category_reason=category_reason,
                    action_items_json=serialized_items,
                    processing_error=processing_error,
                    processed_at=now if not processing_error else None,
                )
            )
            row = (
                conn.execute(select(emails_table).where(emails_table.c.id == email_id))
                .mappings()
                .first()
            )
            return _row_to_email(row) if row else None

    # ------------------------------------------------------------------
    # Drafts (Strictly stored as 'draft', never auto-sent)
    # ------------------------------------------------------------------
    def create_draft(
        self,
        subject: str,
        body: str,
        email_id: Optional[str] = None,
        suggested_followups: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> DraftOut:
        """Create and persist a new email draft."""
        draft_id = f"draft-{uuid.uuid4().hex[:10]}"
        now = utc_now_iso()
        with self.engine.begin() as conn:
            conn.execute(
                insert(drafts_table).values(
                    id=draft_id,
                    email_id=email_id,
                    subject=subject,
                    body=body,
                    suggested_followups_json=json.dumps(suggested_followups or []),
                    metadata_json=json.dumps(metadata or {}),
                    status="draft",
                    created_at=now,
                    updated_at=now,
                )
            )
            row = (
                conn.execute(select(drafts_table).where(drafts_table.c.id == draft_id))
                .mappings()
                .one()
            )
            return _row_to_draft(row)

    def list_drafts(self, email_id: Optional[str] = None) -> List[DraftOut]:
        """List saved drafts, optionally filtered by source email ID."""
        stmt = select(drafts_table)
        if email_id:
            stmt = stmt.where(drafts_table.c.email_id == email_id)
        stmt = stmt.order_by(drafts_table.c.updated_at.desc())
        with self.engine.connect() as conn:
            rows = conn.execute(stmt).mappings()
            return [_row_to_draft(row) for row in rows]

    def get_draft(self, draft_id: str) -> Optional[DraftOut]:
        """Fetch a single draft by ID."""
        with self.engine.connect() as conn:
            row = (
                conn.execute(select(drafts_table).where(drafts_table.c.id == draft_id))
                .mappings()
                .first()
            )
            return _row_to_draft(row) if row else None

    def update_draft(
        self,
        draft_id: str,
        subject: Optional[str] = None,
        body: Optional[str] = None,
        suggested_followups: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[DraftOut]:
        """Update an existing draft while enforcing status='draft'."""
        now = utc_now_iso()
        with self.engine.begin() as conn:
            existing = (
                conn.execute(select(drafts_table).where(drafts_table.c.id == draft_id))
                .mappings()
                .first()
            )
            if not existing:
                return None
            conn.execute(
                update(drafts_table)
                .where(drafts_table.c.id == draft_id)
                .values(
                    subject=subject if subject is not None else existing["subject"],
                    body=body if body is not None else existing["body"],
                    suggested_followups_json=(
                        json.dumps(suggested_followups)
                        if suggested_followups is not None
                        else existing["suggested_followups_json"]
                    ),
                    metadata_json=(
                        json.dumps(metadata)
                        if metadata is not None
                        else existing["metadata_json"]
                    ),
                    status="draft",
                    updated_at=now,
                )
            )
            row = (
                conn.execute(select(drafts_table).where(drafts_table.c.id == draft_id))
                .mappings()
                .one()
            )
            return _row_to_draft(row)

    def delete_draft(self, draft_id: str) -> bool:
        """Delete a draft by ID."""
        with self.engine.begin() as conn:
            res = conn.execute(delete(drafts_table).where(drafts_table.c.id == draft_id))
            return res.rowcount > 0

    # ------------------------------------------------------------------
    # Conversations, Chat History & Quality Feedback
    # ------------------------------------------------------------------
    def ensure_conversation(
        self,
        conversation_id: Optional[str],
        scope: str,
        email_id: Optional[str],
        title_hint: str,
    ) -> str:
        """Create or touch a conversation record and return its unique conversation_id."""
        conv_id = (conversation_id or "").strip() or f"conv-{uuid.uuid4().hex[:12]}"
        now = utc_now_iso()
        title = title_hint.strip()[:120] or (
            f"Email {email_id}" if email_id else "Inbox Conversation"
        )
        with self.engine.begin() as conn:
            existing = conn.execute(
                select(conversations_table.c.id).where(conversations_table.c.id == conv_id)
            ).first()
            if existing:
                conn.execute(
                    update(conversations_table)
                    .where(conversations_table.c.id == conv_id)
                    .values(updated_at=now)
                )
            else:
                conn.execute(
                    insert(conversations_table).values(
                        id=conv_id,
                        scope=scope,
                        email_id=email_id,
                        title=title,
                        created_at=now,
                        updated_at=now,
                    )
                )
        return conv_id

    def add_chat_message(
        self,
        conversation_id: str,
        scope: str,
        role: str,
        content: str,
        email_id: Optional[str] = None,
        latency_ms: Optional[float] = None,
        llm_mode: Optional[str] = None,
        model_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ChatMessageOut:
        """Persist a chat turn linked to conversation_id and optional email_id."""
        msg_id = f"msg-{uuid.uuid4().hex[:10]}"
        now = utc_now_iso()
        with self.engine.begin() as conn:
            conn.execute(
                insert(chat_messages_table).values(
                    id=msg_id,
                    conversation_id=conversation_id,
                    scope=scope,
                    email_id=email_id,
                    role=role,
                    content=content,
                    latency_ms=latency_ms,
                    llm_mode=llm_mode,
                    model_name=model_name,
                    quality_rating=None,
                    quality_notes=None,
                    metadata_json=json.dumps(metadata or {}),
                    created_at=now,
                )
            )
            row = (
                conn.execute(
                    select(chat_messages_table).where(chat_messages_table.c.id == msg_id)
                )
                .mappings()
                .one()
            )
            return _row_to_chat_message(row)

    def list_chat_messages(
        self,
        scope: Optional[str] = None,
        email_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[ChatMessageOut]:
        """List chat messages ordered chronologically."""
        stmt = select(chat_messages_table)
        if scope:
            stmt = stmt.where(chat_messages_table.c.scope == scope)
        if email_id:
            stmt = stmt.where(chat_messages_table.c.email_id == email_id)
        if conversation_id:
            stmt = stmt.where(chat_messages_table.c.conversation_id == conversation_id)
        stmt = stmt.order_by(chat_messages_table.c.created_at.desc()).limit(limit)
        with self.engine.connect() as conn:
            rows = list(conn.execute(stmt).mappings())
            return [_row_to_chat_message(row) for row in reversed(rows)]

    def rate_chat_message(
        self, message_id: str, rating: int, notes: Optional[str] = None
    ) -> Optional[ChatMessageOut]:
        """Attach a quality rating (+1 / -1) and optional notes to an assistant turn."""
        with self.engine.begin() as conn:
            existing = conn.execute(
                select(chat_messages_table.c.id).where(
                    chat_messages_table.c.id == message_id
                )
            ).first()
            if not existing:
                return None
            conn.execute(
                update(chat_messages_table)
                .where(chat_messages_table.c.id == message_id)
                .values(quality_rating=rating, quality_notes=notes)
            )
            row = (
                conn.execute(
                    select(chat_messages_table).where(
                        chat_messages_table.c.id == message_id
                    )
                )
                .mappings()
                .one()
            )
            return _row_to_chat_message(row)

    def list_conversations(
        self, email_id: Optional[str] = None, limit: int = 50
    ) -> List[ConversationOut]:
        """Return conversation summaries with message counts, timing, and ratings."""
        stmt = select(conversations_table)
        if email_id:
            stmt = stmt.where(conversations_table.c.email_id == email_id)
        stmt = stmt.order_by(conversations_table.c.updated_at.desc()).limit(limit)
        with self.engine.connect() as conn:
            convs = list(conn.execute(stmt).mappings())
            msgs = list(conn.execute(select(chat_messages_table)).mappings())

        grouped: Dict[str, List[Any]] = {}
        for m in msgs:
            grouped.setdefault(m["conversation_id"], []).append(m)

        results: List[ConversationOut] = []
        for c in convs:
            turns = grouped.get(c["id"], [])
            latencies = [float(t["latency_ms"]) for t in turns if t["latency_ms"] is not None]
            pos = sum(1 for t in turns if t["quality_rating"] == 1)
            neg = sum(1 for t in turns if t["quality_rating"] == -1)
            results.append(
                ConversationOut(
                    id=c["id"],
                    scope=c["scope"],
                    email_id=c["email_id"],
                    title=c["title"],
                    message_count=len(turns),
                    avg_latency_ms=(
                        round(sum(latencies) / len(latencies), 2) if latencies else None
                    ),
                    positive_ratings=pos,
                    negative_ratings=neg,
                    created_at=c["created_at"],
                    updated_at=c["updated_at"],
                )
            )
        return results

    def clear_chat_messages(self) -> None:
        """Clear chat history and conversation records."""
        with self.engine.begin() as conn:
            conn.execute(delete(chat_messages_table))
            conn.execute(delete(conversations_table))

    # ------------------------------------------------------------------
    # LLM Execution Telemetry & Database Diagnostics
    # ------------------------------------------------------------------
    def record_llm_log(
        self,
        *,
        request_id: Optional[str],
        operation: str,
        conversation_id: Optional[str],
        email_id: Optional[str],
        prompt_key: Optional[str],
        prompt_hash: Optional[str],
        provider: str,
        model: str,
        started_at: str,
        completed_at: str,
        latency_ms: float,
        input_tokens: int,
        output_tokens: int,
        total_tokens: int,
        parse_valid: bool,
        status: str,
        error_message: Optional[str] = None,
        output_preview: Optional[str] = None,
    ) -> LLMExecutionLogOut:
        """Persist an LLM telemetry record for quality & timing observation."""
        log_id = f"log-{uuid.uuid4().hex[:12]}"
        with self.engine.begin() as conn:
            conn.execute(
                insert(llm_execution_logs_table).values(
                    id=log_id,
                    request_id=request_id,
                    operation=operation,
                    conversation_id=conversation_id,
                    email_id=email_id,
                    prompt_key=prompt_key,
                    prompt_hash=prompt_hash,
                    provider=provider,
                    model=model,
                    started_at=started_at,
                    completed_at=completed_at,
                    latency_ms=round(latency_ms, 2),
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=total_tokens,
                    parse_valid=1 if parse_valid else 0,
                    status=status,
                    error_message=error_message,
                    output_preview=(output_preview or "")[:300] or None,
                )
            )
            row = (
                conn.execute(
                    select(llm_execution_logs_table).where(
                        llm_execution_logs_table.c.id == log_id
                    )
                )
                .mappings()
                .one()
            )
            return _row_to_llm_log(row)

    def list_llm_logs(
        self,
        operation: Optional[str] = None,
        status: Optional[str] = None,
        email_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        limit: int = 100,
    ) -> List[LLMExecutionLogOut]:
        """List recent LLM execution trace logs with optional filters."""
        stmt = select(llm_execution_logs_table)
        if operation:
            stmt = stmt.where(llm_execution_logs_table.c.operation == operation)
        if status:
            stmt = stmt.where(llm_execution_logs_table.c.status == status)
        if email_id:
            stmt = stmt.where(llm_execution_logs_table.c.email_id == email_id)
        if conversation_id:
            stmt = stmt.where(
                llm_execution_logs_table.c.conversation_id == conversation_id
            )
        stmt = stmt.order_by(llm_execution_logs_table.c.started_at.desc()).limit(limit)
        with self.engine.connect() as conn:
            rows = conn.execute(stmt).mappings()
            return [_row_to_llm_log(row) for row in rows]

    def get_observability_metrics(self) -> ObservabilityMetricsOut:
        """Compute aggregate latency, token, reliability, and quality scores."""
        with self.engine.connect() as conn:
            logs = list(conn.execute(select(llm_execution_logs_table)).mappings())
            conv_count = int(
                conn.execute(select(func.count()).select_from(conversations_table)).scalar()
                or 0
            )
            ratings = list(
                conn.execute(
                    select(chat_messages_table.c.quality_rating).where(
                        chat_messages_table.c.quality_rating.is_not(None)
                    )
                ).scalars()
            )

        total = len(logs)
        success_cnt = sum(1 for l in logs if l["status"] == "success")
        error_cnt = total - success_cnt
        latencies = [float(l["latency_ms"]) for l in logs]
        tokens = sum(int(l["total_tokens"] or 0) for l in logs)
        parse_valid_cnt = sum(1 for l in logs if l["parse_valid"])

        pos = sum(1 for r in ratings if r == 1)
        neg = sum(1 for r in ratings if r == -1)
        rated = len(ratings)

        by_op_map: Dict[str, List[Any]] = {}
        for l in logs:
            by_op_map.setdefault(l["operation"], []).append(l)

        by_operation = []
        for op, entries in sorted(by_op_map.items()):
            op_lats = [float(e["latency_ms"]) for e in entries]
            op_succ = sum(1 for e in entries if e["status"] == "success")
            by_operation.append(
                OperationStatsOut(
                    operation=op,
                    count=len(entries),
                    success_count=op_succ,
                    error_count=len(entries) - op_succ,
                    avg_latency_ms=round(sum(op_lats) / len(op_lats), 2),
                    p95_latency_ms=_percentile(op_lats, 95),
                    total_tokens=sum(int(e["total_tokens"] or 0) for e in entries),
                )
            )

        return ObservabilityMetricsOut(
            total_calls=total,
            success_count=success_cnt,
            error_count=error_cnt,
            success_rate_pct=round((success_cnt / total) * 100.0, 1) if total else 100.0,
            avg_latency_ms=round(sum(latencies) / total, 2) if total else 0.0,
            p95_latency_ms=_percentile(latencies, 95),
            total_tokens=tokens,
            parse_valid_rate_pct=(
                round((parse_valid_cnt / total) * 100.0, 1) if total else 100.0
            ),
            total_conversations=conv_count,
            rated_messages=rated,
            positive_ratings=pos,
            negative_ratings=neg,
            approval_rate_pct=round((pos / rated) * 100.0, 1) if rated else None,
            by_operation=by_operation,
        )

    def get_counts(self) -> Dict[str, int]:
        """Return row counts across all core and observability tables."""
        tables = {
            "email_count": emails_table,
            "prompt_count": prompts_table,
            "draft_count": drafts_table,
            "conversation_count": conversations_table,
            "log_count": llm_execution_logs_table,
        }
        counts: Dict[str, int] = {}
        with self.engine.connect() as conn:
            for key, tbl in tables.items():
                counts[key] = int(
                    conn.execute(select(func.count()).select_from(tbl)).scalar() or 0
                )
        return counts

    def get_db_status(self) -> DatabaseStatusOut:
        """Run a live DB ping and collect table statistics."""
        ping = ping_database(self.engine)
        counts = self.get_counts()
        with self.engine.connect() as conn:
            msg_count = int(
                conn.execute(
                    select(func.count()).select_from(chat_messages_table)
                ).scalar()
                or 0
            )
        return DatabaseStatusOut(
            status=ping["status"],
            dialect=ping["dialect"],
            wal_mode=ping["wal_mode"],
            db_latency_ms=ping["db_latency_ms"],
            pool=ping["pool"],
            table_counts={
                "emails": counts["email_count"],
                "prompts": counts["prompt_count"],
                "drafts": counts["draft_count"],
                "conversations": counts["conversation_count"],
                "chat_messages": msg_count,
                "llm_execution_logs": counts["log_count"],
            },
        )
