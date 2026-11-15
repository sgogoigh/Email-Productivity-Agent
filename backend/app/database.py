"""SQLAlchemy 2.x database engine supporting SQLite (WAL mode) and PostgreSQL."""

import time
from pathlib import Path
from typing import Any, Dict

from sqlalchemy import (
    CheckConstraint,
    Column,
    Engine,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Table,
    Text,
    create_engine,
    event,
    inspect,
    text,
)

metadata = MetaData()

emails_table = Table(
    "emails",
    metadata,
    Column("id", Text, primary_key=True),
    Column("thread_id", Text, nullable=False),
    Column("sender", Text, nullable=False),
    Column("sender_email", Text, nullable=False),
    Column("recipient", Text, nullable=False),
    Column("subject", Text, nullable=False),
    Column("body", Text, nullable=False),
    Column("timestamp", Text, nullable=False),
    Column("is_read", Integer, nullable=False, default=0),
    Column("category", Text),
    Column("urgency", Text),
    Column("category_reason", Text),
    Column("action_items_json", Text, nullable=False, default="[]"),
    Column("processing_error", Text),
    Column("processed_at", Text),
    Index("idx_emails_thread_id", "thread_id"),
    Index("idx_emails_category", "category"),
    Index("idx_emails_timestamp", "timestamp"),
)

prompts_table = Table(
    "prompts",
    metadata,
    Column("key", Text, primary_key=True),
    Column("name", Text, nullable=False),
    Column("description", Text, nullable=False, default=""),
    Column("template", Text, nullable=False),
    Column("is_default", Integer, nullable=False, default=0),
    Column("updated_at", Text, nullable=False),
)

drafts_table = Table(
    "drafts",
    metadata,
    Column("id", Text, primary_key=True),
    Column("email_id", Text, ForeignKey("emails.id", ondelete="SET NULL"), nullable=True),
    Column("subject", Text, nullable=False),
    Column("body", Text, nullable=False),
    Column("suggested_followups_json", Text, nullable=False, default="[]"),
    Column("metadata_json", Text, nullable=False, default="{}"),
    Column("status", Text, nullable=False, default="draft"),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
    CheckConstraint("status = 'draft'", name="ck_drafts_status_draft_only"),
    Index("idx_drafts_email_id", "email_id"),
    Index("idx_drafts_updated_at", "updated_at"),
)

conversations_table = Table(
    "conversations",
    metadata,
    Column("id", Text, primary_key=True),
    Column("scope", Text, nullable=False),
    Column("email_id", Text, nullable=True),
    Column("title", Text, nullable=False, default=""),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
    CheckConstraint("scope IN ('email', 'inbox')", name="ck_conversations_scope"),
    Index("idx_conversations_email_id", "email_id"),
    Index("idx_conversations_updated_at", "updated_at"),
)

chat_messages_table = Table(
    "chat_messages",
    metadata,
    Column("id", Text, primary_key=True),
    Column("conversation_id", Text, nullable=False),
    Column("scope", Text, nullable=False),
    Column("email_id", Text, nullable=True),
    Column("role", Text, nullable=False),
    Column("content", Text, nullable=False),
    Column("latency_ms", Float, nullable=True),
    Column("llm_mode", Text, nullable=True),
    Column("model_name", Text, nullable=True),
    Column("quality_rating", Integer, nullable=True),
    Column("quality_notes", Text, nullable=True),
    Column("metadata_json", Text, nullable=False, default="{}"),
    Column("created_at", Text, nullable=False),
    CheckConstraint("scope IN ('email', 'inbox')", name="ck_chat_scope"),
    CheckConstraint("role IN ('user', 'assistant')", name="ck_chat_role"),
    Index("idx_chat_messages_conversation_id", "conversation_id"),
    Index("idx_chat_messages_email_id", "email_id"),
    Index("idx_chat_messages_created_at", "created_at"),
)

llm_execution_logs_table = Table(
    "llm_execution_logs",
    metadata,
    Column("id", Text, primary_key=True),
    Column("request_id", Text, nullable=True),
    Column("operation", Text, nullable=False),
    Column("conversation_id", Text, nullable=True),
    Column("email_id", Text, nullable=True),
    Column("prompt_key", Text, nullable=True),
    Column("prompt_hash", Text, nullable=True),
    Column("provider", Text, nullable=False),
    Column("model", Text, nullable=False),
    Column("started_at", Text, nullable=False),
    Column("completed_at", Text, nullable=False),
    Column("latency_ms", Float, nullable=False),
    Column("input_tokens", Integer, nullable=False, default=0),
    Column("output_tokens", Integer, nullable=False, default=0),
    Column("total_tokens", Integer, nullable=False, default=0),
    Column("parse_valid", Integer, nullable=False, default=1),
    Column("status", Text, nullable=False),
    Column("error_message", Text, nullable=True),
    Column("output_preview", Text, nullable=True),
    Index("idx_llm_logs_operation", "operation"),
    Index("idx_llm_logs_conversation_id", "conversation_id"),
    Index("idx_llm_logs_email_id", "email_id"),
    Index("idx_llm_logs_started_at", "started_at"),
)


def create_db_engine(database_url: str) -> Engine:
    """Create a configured SQLAlchemy Engine for SQLite WAL or PostgreSQL."""
    is_sqlite = database_url.startswith("sqlite")
    if is_sqlite:
        raw_path = database_url.replace("sqlite:///", "", 1)
        if raw_path and raw_path != ":memory:":
            Path(raw_path).parent.mkdir(parents=True, exist_ok=True)
        engine = create_engine(
            database_url,
            connect_args={"check_same_thread": False, "timeout": 15},
            future=True,
        )

        @event.listens_for(engine, "connect")
        def _configure_sqlite_pragmas(dbapi_connection: Any, _record: Any) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys = ON;")
            cursor.execute("PRAGMA journal_mode = WAL;")
            cursor.execute("PRAGMA synchronous = NORMAL;")
            cursor.execute("PRAGMA busy_timeout = 5000;")
            cursor.close()

        return engine

    return create_engine(
        database_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        future=True,
    )


def _migrate_sqlite_chat_columns(engine: Engine) -> None:
    """Add new observability columns when upgrading an existing SQLite DB file."""
    inspector = inspect(engine)
    if "chat_messages" not in inspector.get_table_names():
        return
    existing_cols = {col["name"] for col in inspector.get_columns("chat_messages")}
    migrations = [
        ("conversation_id", "TEXT NOT NULL DEFAULT 'conv-legacy'"),
        ("latency_ms", "REAL"),
        ("llm_mode", "TEXT"),
        ("model_name", "TEXT"),
        ("quality_rating", "INTEGER"),
        ("quality_notes", "TEXT"),
    ]
    with engine.begin() as conn:
        for col_name, col_def in migrations:
            if col_name not in existing_cols:
                conn.execute(text(f"ALTER TABLE chat_messages ADD COLUMN {col_name} {col_def}"))


def init_database(engine: Engine) -> None:
    """Create all tables and apply lightweight backward-compatible migrations."""
    _migrate_sqlite_chat_columns(engine)
    metadata.create_all(engine)


def ping_database(engine: Engine) -> Dict[str, Any]:
    """Verify live database connectivity, measure ping latency, and inspect engine state."""
    start = time.perf_counter()
    dialect = engine.dialect.name
    wal_mode: str | None = None
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        if dialect == "sqlite":
            wal_mode = str(conn.execute(text("PRAGMA journal_mode")).scalar() or "")
    latency_ms = round((time.perf_counter() - start) * 1000.0, 2)

    pool_info: Dict[str, Any] = {"pool_class": engine.pool.__class__.__name__}
    if hasattr(engine.pool, "size"):
        try:
            pool_info["pool_size"] = engine.pool.size()
            pool_info["checked_out"] = engine.pool.checkedout()
        except Exception:
            pass

    return {
        "status": "connected",
        "dialect": dialect,
        "wal_mode": wal_mode,
        "db_latency_ms": latency_ms,
        "pool": pool_info,
    }
