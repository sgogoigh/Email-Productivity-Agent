"""SQLite database connection and schema initialization."""

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    sender_email TEXT NOT NULL,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    category TEXT,
    urgency TEXT,
    category_reason TEXT,
    action_items_json TEXT NOT NULL DEFAULT '[]',
    processing_error TEXT,
    processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_emails_thread_id ON emails(thread_id);
CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category);
CREATE INDEX IF NOT EXISTS idx_emails_timestamp ON emails(timestamp DESC);

CREATE TABLE IF NOT EXISTS prompts (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    template TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY,
    email_id TEXT,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    suggested_followups_json TEXT NOT NULL DEFAULT '[]',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_drafts_email_id ON drafts(email_id);
CREATE INDEX IF NOT EXISTS idx_drafts_updated_at ON drafts(updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL CHECK (scope IN ('email', 'inbox')),
    email_id TEXT,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at ASC);
"""


def init_database(db_path: Path) -> None:
    """Create parent directories and initialize all SQLite tables if absent."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.executescript(SCHEMA_SQL)
        conn.commit()


@contextmanager
def get_connection(db_path: Path) -> Iterator[sqlite3.Connection]:
    """Yield a configured SQLite connection with row access by column name."""
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
