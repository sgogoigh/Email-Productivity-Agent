# Backend Architecture & Design (`backend/`)

## 1. Purpose

The `backend/` service is a standalone **FastAPI** application responsible for:
1. Loading and persisting inbox emails (Mock Inbox JSON or uploaded JSON) in SQLite.
2. Managing **Prompt Brain** templates (Categorization, Action Item Extraction, Auto-Reply Draft, plus user-created custom prompts).
3. Orchestrating the **Email Ingestion Pipeline** (`load -> categorize -> extract action items -> persist`).
4. Powering the **Email Processing Agent** (single-email & inbox-wide Q&A, summarization, tone-aware replies).
5. Powering the **Draft Generation Agent** (creating, editing, and saving email drafts safely without ever sending).

---

## 2. Database Schema (SQLite)

Persisted in `data/email_agent.db` (configurable via `DATABASE_PATH`):

- **`emails`**:
  - `id` (TEXT PK), `thread_id` (TEXT), `sender` (TEXT), `sender_email` (TEXT), `recipient` (TEXT), `subject` (TEXT), `body` (TEXT), `timestamp` (TEXT ISO-8601), `is_read` (INTEGER), `category` (TEXT nullable), `urgency` (TEXT nullable), `action_items_json` (TEXT JSON array of `{"task": str, "deadline": str}`), `processing_error` (TEXT nullable), `processed_at` (TEXT nullable)
- **`prompts`**:
  - `key` (TEXT PK — e.g., `categorization`, `action_item`, `auto_reply`, or user slug), `name` (TEXT), `description` (TEXT), `template` (TEXT), `is_default` (INTEGER), `updated_at` (TEXT)
- **`drafts`**:
  - `id` (TEXT PK), `email_id` (TEXT nullable FK -> `emails.id`), `subject` (TEXT), `body` (TEXT), `suggested_followups_json` (TEXT JSON array of strings), `metadata_json` (TEXT JSON object with `category`, `action_items`, `prompt_used`), `status` (TEXT default `'draft'` — enforced `'draft'` only), `created_at` (TEXT), `updated_at` (TEXT)
- **`chat_messages`**:
  - `id` (TEXT PK), `scope` (TEXT `'email'` | `'inbox'`), `email_id` (TEXT nullable), `role` (TEXT `'user'` | `'assistant'`), `content` (TEXT), `metadata_json` (TEXT), `created_at` (TEXT)

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
