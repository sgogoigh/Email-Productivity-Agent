# Backend Architecture & Design (`backend/`)

## 1. Purpose

The `backend/` service is a standalone **FastAPI** application responsible for:
1. Loading and persisting inbox emails (Mock Inbox JSON or uploaded JSON) in SQLite.
2. Managing **Prompt Brain** templates (Categorization, Action Item Extraction, Auto-Reply Draft, plus user-created custom prompts).
3. Orchestrating the **Email Ingestion Pipeline** (`load -> categorize -> extract action items -> persist`).
4. Powering the **Email Processing Agent** (single-email & inbox-wide Q&A, summarization, tone-aware replies).
5. Powering the **Draft Generation Agent** (creating, editing, and saving email drafts safely without ever sending).

---

## 2. Database Connectivity & Schema (SQLAlchemy 2.x: SQLite WAL + PostgreSQL)

The backend uses **SQLAlchemy 2.x** configured via `DATABASE_URL`:
- **Default (`sqlite:///data/email_agent.db`)**: Enables `PRAGMA journal_mode=WAL`, `PRAGMA synchronous=NORMAL`, `PRAGMA busy_timeout=5000`, and `PRAGMA foreign_keys=ON` for safe concurrent reads/writes with zero external setup.
- **PostgreSQL (`postgresql+psycopg://...`)**: Uses SQLAlchemy connection pooling (`pool_pre_ping=True`, `pool_size`, `max_overflow`) for multi-container production deployments.
- **Connectivity Probe**: `GET /api/health` and `GET /api/observability/db-status` execute `SELECT 1`, returning live status, dialect, WAL/pool metadata, `db_latency_ms`, and per-table row counts.

### Tables

- **`emails`**:
  - `id` (TEXT PK), `thread_id` (TEXT), `sender` (TEXT), `sender_email` (TEXT), `recipient` (TEXT), `subject` (TEXT), `body` (TEXT), `timestamp` (TEXT ISO-8601), `is_read` (INTEGER), `category` (TEXT nullable), `urgency` (TEXT nullable), `action_items_json` (TEXT JSON array of `{"task": str, "deadline": str}`), `processing_error` (TEXT nullable), `processed_at` (TEXT nullable)
- **`prompts`**:
  - `key` (TEXT PK — e.g., `categorization`, `action_item`, `auto_reply`, or user slug), `name` (TEXT), `description` (TEXT), `template` (TEXT), `is_default` (INTEGER), `updated_at` (TEXT)
- **`drafts`**:
  - `id` (TEXT PK), `email_id` (TEXT nullable FK -> `emails.id`), `subject` (TEXT), `body` (TEXT), `suggested_followups_json` (TEXT JSON array of strings), `metadata_json` (TEXT JSON object with `category`, `action_items`, `prompt_used`), `status` (TEXT default `'draft'` — enforced `'draft'` only), `created_at` (TEXT), `updated_at` (TEXT)
- **`conversations`**:
  - `id` (TEXT PK — unique `conversation_id`, e.g. `conv-...`), `scope` (TEXT `'email'` | `'inbox'`), `email_id` (TEXT nullable), `title` (TEXT), `created_at` (TEXT), `updated_at` (TEXT)
- **`chat_messages`**:
  - `id` (TEXT PK), `conversation_id` (TEXT FK -> `conversations.id`), `scope` (TEXT `'email'` | `'inbox'`), `email_id` (TEXT nullable), `role` (TEXT `'user'` | `'assistant'`), `content` (TEXT), `latency_ms` (REAL nullable), `llm_mode` (TEXT nullable), `model_name` (TEXT nullable), `quality_rating` (INTEGER nullable: `1` or `-1`), `quality_notes` (TEXT nullable), `metadata_json` (TEXT), `created_at` (TEXT)
- **`llm_execution_logs`**:
  - `id` (TEXT PK), `request_id` (TEXT nullable), `operation` (TEXT `'categorize'` | `'extract_actions'` | `'chat'` | `'generate_draft'`), `conversation_id` (TEXT nullable), `email_id` (TEXT nullable), `prompt_key` (TEXT nullable), `prompt_hash` (TEXT nullable), `provider` (TEXT), `model` (TEXT), `started_at` (TEXT), `completed_at` (TEXT), `latency_ms` (REAL), `input_tokens` (INTEGER), `output_tokens` (INTEGER), `total_tokens` (INTEGER), `parse_valid` (INTEGER), `status` (TEXT `'success'` | `'error'`), `error_message` (TEXT nullable), `output_preview` (TEXT nullable)

---

## 2A. Structured Logging & Quality Timing

- **HTTP Middleware**: Attaches `X-Request-ID` to every response and emits structured JSON logs (`timestamp`, `level`, `request_id`, `method`, `path`, `status_code`, `duration_ms`) to stdout and rotating file `logs/backend.log`.
- **LLM Call Instrumentation**: Every LLM call measures `time.perf_counter()` duration (`latency_ms`), captures token usage (`usageMetadata` for Gemini / `usage` for OpenAI), hashes the active Prompt Brain template (`prompt_hash`), records JSON parse validity (`parse_valid`), and persists an audit row into `llm_execution_logs`.

---

## 3. LLM Integration & Prompt-Driven Guarantees

### Prompt Injection Contract
Every LLM invocation fetches the active prompt from the `prompts` table at runtime:
- **Categorization**: Uses `prompts["categorization"].template` + email metadata/body. Expects structured JSON `{"category": "...", "urgency": "high|medium|low", "reason": "..."}`.
- **Action Item Extraction**: Uses `prompts["action_item"].template` + email body. Expects JSON list or object `[{"task": "...", "deadline": "..."}]` (normalized to list).
- **Email Agent Chat**: Injects relevant stored prompts (`categorization`, `action_item`, `auto_reply`, plus any custom prompt referenced) alongside either the selected email or summarized inbox index, plus the user's query.
- **Draft Generation**: Uses `prompts["auto_reply"].template` + original email thread context (all emails sharing `thread_id` ordered chronologically) + optional user tone/instruction.

### Provider Modes (`LLM_PROVIDER`)
1. **`openai`** / **`openai_compatible`**: Calls Chat Completions API via `httpx` (works with OpenAI, Groq, OpenRouter, Ollama, vLLM).
2. **`gemini`**: Calls Google Gemini `generateContent` REST API via `httpx`.
3. **`mock`** (or automatic fallback when `LLM_ALLOW_MOCK_FALLBACK=true` and no API key is set): Uses a **prompt-sensitive rule + template interpreter** that parses category names and directive clauses directly from the stored user prompts so changing prompts in the Prompt Brain produces real, observable behavioral differences even offline.

### Error Handling & Safety
- All external LLM calls enforce configurable timeouts and retry once on transient HTTP 429/5xx.
- JSON responses are parsed defensively (stripping markdown code fences, validating with Pydantic).
- If an LLM call fails during batch ingestion, that email records `processing_error` and the pipeline continues without crashing the request.
- No SMTP client or external email-send capability exists in the codebase; drafts are strictly saved with `status="draft"`.

---

## 4. Deployment (`backend/Dockerfile`)

- Base image: `python:3.12-slim`
- Exposes port `8000`
- Runs `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Healthcheck on `GET /api/health`
- Environment variables:
  - `PORT=8000`
  - `DATABASE_PATH=/app/data/email_agent.db`
  - `CORS_ORIGINS=http://localhost:3000`
  - `LLM_PROVIDER=mock` (`openai` | `gemini` | `openai_compatible` | `mock`)
  - `LLM_API_KEY=`
  - `LLM_MODEL=`
  - `LLM_BASE_URL=`
