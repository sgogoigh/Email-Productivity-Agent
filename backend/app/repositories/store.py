"""SQLite persistence repository for emails, Prompt Brain, drafts, and chat."""

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.database import get_connection
from app.models.schemas import (
    ActionItem,
    ChatMessageOut,
    DraftOut,
    EmailDetailOut,
    EmailInput,
    EmailOut,
    PromptOut,
)


def utc_now_iso() -> str:
    """Return current UTC timestamp in ISO-8601 format."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


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


def _row_to_email(row: sqlite3.Row) -> EmailOut:
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


def _row_to_prompt(row: sqlite3.Row) -> PromptOut:
    return PromptOut(
        key=row["key"],
        name=row["name"],
        description=row["description"],
        template=row["template"],
        is_default=bool(row["is_default"]),
        updated_at=row["updated_at"],
    )


def _row_to_draft(row: sqlite3.Row) -> DraftOut:
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


def _row_to_chat_message(row: sqlite3.Row) -> ChatMessageOut:
    return ChatMessageOut(
        id=row["id"],
        scope=row["scope"],
        email_id=row["email_id"],
        role=row["role"],
        content=row["content"],
        metadata=_parse_json_dict(row["metadata_json"]),
        created_at=row["created_at"],
    )


class EmailStore:
    """Repository encapsulating all SQLite CRUD operations."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    # ------------------------------------------------------------------
    # Prompts ("The Agent Brain")
    # ------------------------------------------------------------------
    def seed_default_prompts(self, default_prompts_path: Path, overwrite: bool = False) -> List[PromptOut]:
        """Load default prompt templates from JSON into SQLite."""
        data = json.loads(default_prompts_path.read_text(encoding="utf-8"))
        now = utc_now_iso()
        with get_connection(self.db_path) as conn:
            for item in data:
                existing = conn.execute(
                    "SELECT key FROM prompts WHERE key = ?", (item["key"],)
                ).fetchone()
                if existing and not overwrite:
                    continue
                conn.execute(
                    """
                    INSERT INTO prompts (key, name, description, template, is_default, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET
                        name = excluded.name,
                        description = excluded.description,
                        template = excluded.template,
                        is_default = excluded.is_default,
                        updated_at = excluded.updated_at
                    """,
                    (
                        item["key"],
                        item["name"],
                        item.get("description", ""),
                        item["template"],
                        1 if item.get("is_default", True) else 0,
                        now,
                    ),
                )
        return self.list_prompts()

    def list_prompts(self) -> List[PromptOut]:
        """Return all stored prompts ordered with core defaults first."""
        with get_connection(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT * FROM prompts
                ORDER BY
                    CASE key
                        WHEN 'categorization' THEN 1
                        WHEN 'action_item' THEN 2
                        WHEN 'auto_reply' THEN 3
                        ELSE 4
                    END,
                    name ASC
                """
            ).fetchall()
            return [_row_to_prompt(row) for row in rows]

    def get_prompt(self, key: str) -> Optional[PromptOut]:
        """Return a single prompt by key."""
        with get_connection(self.db_path) as conn:
            row = conn.execute("SELECT * FROM prompts WHERE key = ?", (key,)).fetchone()
            return _row_to_prompt(row) if row else None

    def get_prompt_map(self) -> Dict[str, PromptOut]:
        """Return prompts keyed by prompt key."""
        return {prompt.key: prompt for prompt in self.list_prompts()}

    def create_prompt(self, key: str, name: str, description: str, template: str) -> PromptOut:
        """Create a new custom prompt template."""
        now = utc_now_iso()
        with get_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO prompts (key, name, description, template, is_default, updated_at)
                VALUES (?, ?, ?, ?, 0, ?)
                """,
                (key, name, description, template, now),
            )
            row = conn.execute("SELECT * FROM prompts WHERE key = ?", (key,)).fetchone()
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
        with get_connection(self.db_path) as conn:
            existing = conn.execute("SELECT * FROM prompts WHERE key = ?", (key,)).fetchone()
            if not existing:
                return None
            new_name = name if name is not None else existing["name"]
            new_desc = description if description is not None else existing["description"]
            conn.execute(
                """
                UPDATE prompts
                SET name = ?, description = ?, template = ?, updated_at = ?
                WHERE key = ?
                """,
                (new_name, new_desc, template, now, key),
            )
            row = conn.execute("SELECT * FROM prompts WHERE key = ?", (key,)).fetchone()
            return _row_to_prompt(row)

    def delete_prompt(self, key: str) -> bool:
        """Delete a non-default custom prompt."""
        with get_connection(self.db_path) as conn:
            row = conn.execute("SELECT is_default FROM prompts WHERE key = ?", (key,)).fetchone()
            if not row or row["is_default"]:
                return False
            conn.execute("DELETE FROM prompts WHERE key = ?", (key,))
            return True

    # ------------------------------------------------------------------
    # Emails & Processing State
    # ------------------------------------------------------------------
    def load_mock_inbox(self, mock_inbox_path: Path, clear_existing: bool = True) -> List[EmailOut]:
        """Load sample emails from JSON file into SQLite."""
        raw_emails = json.loads(mock_inbox_path.read_text(encoding="utf-8"))
        parsed = [EmailInput(**item) for item in raw_emails]
        return self.ingest_raw_emails(parsed, clear_existing=clear_existing)

    def ingest_raw_emails(
        self, emails: List[EmailInput], clear_existing: bool = False
    ) -> List[EmailOut]:
        """Insert or replace raw emails in SQLite prior to LLM processing."""
        with get_connection(self.db_path) as conn:
            if clear_existing:
                conn.execute("DELETE FROM emails")
            for idx, item in enumerate(emails):
                email_id = item.id or f"email-{uuid.uuid4().hex[:8]}"
                thread_id = item.thread_id or f"thread-{email_id}"
                conn.execute(
                    """
                    INSERT INTO emails (
                        id, thread_id, sender, sender_email, recipient,
                        subject, body, timestamp, is_read,
                        category, urgency, category_reason, action_items_json,
                        processing_error, processed_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, '[]', NULL, NULL)
                    ON CONFLICT(id) DO UPDATE SET
                        thread_id = excluded.thread_id,
                        sender = excluded.sender,
                        sender_email = excluded.sender_email,
                        recipient = excluded.recipient,
                        subject = excluded.subject,
                        body = excluded.body,
                        timestamp = excluded.timestamp,
                        is_read = excluded.is_read,
                        category = NULL,
                        urgency = NULL,
                        category_reason = NULL,
                        action_items_json = '[]',
                        processing_error = NULL,
                        processed_at = NULL
                    """,
                    (
                        email_id,
                        thread_id,
                        item.sender,
                        item.sender_email,
                        item.recipient,
                        item.subject,
                        item.body,
                        item.timestamp,
                        1 if item.is_read else 0,
                    ),
                )
        return self.list_emails()

    def list_emails(
        self,
        category: Optional[str] = None,
        search: Optional[str] = None,
        processed: Optional[bool] = None,
    ) -> List[EmailOut]:
        """List emails ordered newest-first with optional filters."""
        clauses: List[str] = []
        params: List[Any] = []
        if category and category.lower() != "all":
            if category.lower() == "unprocessed":
                clauses.append("category IS NULL")
            else:
                clauses.append("LOWER(category) = LOWER(?)")
                params.append(category)
        if processed is True:
            clauses.append("processed_at IS NOT NULL")
        elif processed is False:
            clauses.append("processed_at IS NULL")
        if search and search.strip():
            term = f"%{search.strip()}%"
            clauses.append("(sender LIKE ? OR sender_email LIKE ? OR subject LIKE ? OR body LIKE ?)")
            params.extend([term, term, term, term])

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with get_connection(self.db_path) as conn:
            rows = conn.execute(
                f"SELECT * FROM emails {where_sql} ORDER BY timestamp DESC, id ASC",
                tuple(params),
            ).fetchall()
            return [_row_to_email(row) for row in rows]

    def get_email(self, email_id: str) -> Optional[EmailOut]:
        """Fetch a single email by ID."""
        with get_connection(self.db_path) as conn:
            row = conn.execute("SELECT * FROM emails WHERE id = ?", (email_id,)).fetchone()
            return _row_to_email(row) if row else None

    def get_email_detail(self, email_id: str) -> Optional[EmailDetailOut]:
        """Fetch email alongside chronological thread context and associated drafts."""
        email = self.get_email(email_id)
        if not email:
            return None
        with get_connection(self.db_path) as conn:
            thread_rows = conn.execute(
                "SELECT * FROM emails WHERE thread_id = ? ORDER BY timestamp ASC, id ASC",
                (email.thread_id,),
            ).fetchall()
            draft_rows = conn.execute(
                "SELECT * FROM drafts WHERE email_id = ? ORDER BY updated_at DESC",
                (email.id,),
            ).fetchall()
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
        with get_connection(self.db_path) as conn:
            conn.execute(
                """
                UPDATE emails
                SET category = ?,
                    urgency = ?,
                    category_reason = ?,
                    action_items_json = ?,
                    processing_error = ?,
                    processed_at = ?
                WHERE id = ?
                """,
                (
                    category,
                    urgency,
                    category_reason,
                    serialized_items,
                    processing_error,
                    now if not processing_error else None,
                    email_id,
                ),
            )
            row = conn.execute("SELECT * FROM emails WHERE id = ?", (email_id,)).fetchone()
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
        with get_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO drafts (
                    id, email_id, subject, body,
                    suggested_followups_json, metadata_json,
                    status, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)
                """,
                (
                    draft_id,
                    email_id,
                    subject,
                    body,
                    json.dumps(suggested_followups or []),
                    json.dumps(metadata or {}),
                    now,
                    now,
                ),
            )
            row = conn.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()
            return _row_to_draft(row)

    def list_drafts(self, email_id: Optional[str] = None) -> List[DraftOut]:
        """List saved drafts, optionally filtered by source email ID."""
        with get_connection(self.db_path) as conn:
            if email_id:
                rows = conn.execute(
                    "SELECT * FROM drafts WHERE email_id = ? ORDER BY updated_at DESC",
                    (email_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM drafts ORDER BY updated_at DESC"
                ).fetchall()
            return [_row_to_draft(row) for row in rows]

    def get_draft(self, draft_id: str) -> Optional[DraftOut]:
        """Fetch a single draft by ID."""
        with get_connection(self.db_path) as conn:
            row = conn.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()
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
        with get_connection(self.db_path) as conn:
            existing = conn.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()
            if not existing:
                return None
            new_subject = subject if subject is not None else existing["subject"]
            new_body = body if body is not None else existing["body"]
            new_followups = (
                json.dumps(suggested_followups)
                if suggested_followups is not None
                else existing["suggested_followups_json"]
            )
            new_metadata = (
                json.dumps(metadata) if metadata is not None else existing["metadata_json"]
            )
            conn.execute(
                """
                UPDATE drafts
                SET subject = ?, body = ?, suggested_followups_json = ?,
                    metadata_json = ?, status = 'draft', updated_at = ?
                WHERE id = ?
                """,
                (new_subject, new_body, new_followups, new_metadata, now, draft_id),
            )
            row = conn.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()
            return _row_to_draft(row)

    def delete_draft(self, draft_id: str) -> bool:
        """Delete a draft by ID."""
        with get_connection(self.db_path) as conn:
            cur = conn.execute("DELETE FROM drafts WHERE id = ?", (draft_id,))
            return cur.rowcount > 0

    # ------------------------------------------------------------------
    # Chat History & Counts
    # ------------------------------------------------------------------
    def add_chat_message(
        self,
        scope: str,
        role: str,
        content: str,
        email_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ChatMessageOut:
        """Persist a chat turn for the Email Agent."""
        msg_id = f"msg-{uuid.uuid4().hex[:10]}"
        now = utc_now_iso()
        with get_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO chat_messages (id, scope, email_id, role, content, metadata_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (msg_id, scope, email_id, role, content, json.dumps(metadata or {}), now),
            )
            row = conn.execute("SELECT * FROM chat_messages WHERE id = ?", (msg_id,)).fetchone()
            return _row_to_chat_message(row)

    def list_chat_messages(
        self, scope: Optional[str] = None, email_id: Optional[str] = None, limit: int = 50
    ) -> List[ChatMessageOut]:
        """List recent chat messages."""
        clauses: List[str] = []
        params: List[Any] = []
        if scope:
            clauses.append("scope = ?")
            params.append(scope)
        if email_id:
            clauses.append("email_id = ?")
            params.append(email_id)
        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(limit)
        with get_connection(self.db_path) as conn:
            rows = conn.execute(
                f"SELECT * FROM chat_messages {where_sql} ORDER BY created_at DESC LIMIT ?",
                tuple(params),
            ).fetchall()
            return [_row_to_chat_message(row) for row in reversed(rows)]

    def clear_chat_messages(self) -> None:
        """Clear chat history."""
        with get_connection(self.db_path) as conn:
            conn.execute("DELETE FROM chat_messages")

    def get_counts(self) -> Dict[str, int]:
        """Return counts for healthcheck."""
        with get_connection(self.db_path) as conn:
            email_count = conn.execute("SELECT COUNT(*) FROM emails").fetchone()[0]
            prompt_count = conn.execute("SELECT COUNT(*) FROM prompts").fetchone()[0]
            draft_count = conn.execute("SELECT COUNT(*) FROM drafts").fetchone()[0]
        return {
            "email_count": int(email_count),
            "prompt_count": int(prompt_count),
            "draft_count": int(draft_count),
        }
