# Email Productivity Agent — Master Implementation & Integration Plan

## 1. Overview

This repository implements an intelligent, prompt-driven **Email Productivity Agent** in a split-service architecture designed for independent deployment:

- **`backend/`**: FastAPI + SQLite + modular LLM provider service (Python)
- **`frontend/`**: Next.js (App Router, TypeScript, Tailwind CSS) web UI
- **`docs/`**: System-wide architecture, API integration contract, implementation checklists, and end-to-end test scenarios

All LLM operations (categorization, action-item extraction, inbox/email chat, and draft generation) are dynamically driven by user-editable prompts stored in the **Prompt Brain** database. Drafts are **never** sent automatically; they are persisted strictly in `draft` state for human review.

---

## 2. Repository Structure

```text
Email-Productivity-Agent/
├── README.md                         # Root setup, run, Docker, prompt config & usage guide
├── .gitignore
├── docs/
│   └── PLAN.md                       # Master plan, integration contracts, checklists & scenarios
├── backend/
│   ├── Dockerfile                    # Standalone FastAPI container image
│   ├── .dockerignore
│   ├── .env.example
│   ├── requirements.txt
│   ├── docs/
│   │   └── BACKEND_DESIGN.md         # Backend architecture, DB schema, LLM & pipeline specs
│   ├── data/
│   │   ├── mock_inbox.json           # 16 realistic mock emails across all required categories
│   │   └── default_prompts.json      # Default Prompt Brain templates
│   ├── app/
│   │   ├── main.py                   # FastAPI entrypoint, CORS, lifespan, error handlers
│   │   ├── config.py                 # Environment settings (LLM provider, DB path, CORS)
│   │   ├── database.py               # SQLite connection & schema initialization
│   │   ├── models/                   # Pydantic request/response & domain schemas
│   │   ├── repositories/             # Persistence layer (emails, prompts, drafts, chat)
│   │   ├── services/                 # Ingestion pipeline, LLM client, agent & draft services
│   │   └── routers/                  # REST API endpoints (/health, /inbox, /prompts, /agent, /drafts)
│   └── tests/                        # Pytest unit, integration, and API E2E tests
└── frontend/
    ├── Dockerfile                    # Standalone Next.js multi-stage container image
    ├── .dockerignore
    ├── .env.example
    ├── package.json
    ├── docs/
    │   └── FRONTEND_DESIGN.md        # UI architecture, state flow, components & UX checklist
    ├── src/
    │   ├── app/                      # Next.js App Router pages & layout
    │   ├── components/               # InboxViewer, PromptBrainPanel, EmailAgentChat, DraftEditor
    │   ├── lib/                      # Typed API client & helpers
    │   └── types/                    # Shared TypeScript interfaces matching backend schemas
    └── tests/                        # Component / Playwright or integration tests
```

---

## 3. System Integration & Data Flow

```text
+-------------------+       REST / JSON (CORS)       +------------------------+
|   Next.js UI      | <----------------------------> |   FastAPI Backend      |
|  (frontend/)      |   NEXT_PUBLIC_API_BASE_URL     |     (backend/)         |
+-------------------+                                +-----------+------------+
                                                                 |
                         +---------------------------------------+---------------------------------------+
                         |                                       |                                       |
                         v                                       v                                       v
               +-------------------+                   +-------------------+                   +-------------------+
               |  SQLite Database  |                   |  Ingestion &      |                   |  LLM Gateway      |
               |  - emails         |                   |  Agent Services   |                   |  - OpenAI /       |
               |  - prompts        |                   |  - Categorizer    |                   |    Gemini /       |
               |  - action_items   |                   |  - ActionExtract  |                   |    OpenAI-Compat  |
               |  - drafts         |                   |  - Chat Agent     |                   |  - Deterministic  |
               |  - chat_history   |                   |  - Draft Agent    |                   |    Mock Fallback  |
               +-------------------+                   +-------------------+                   +-------------------+
```

### Core Integration Contracts (Frontend <-> Backend)

| Domain | Endpoint | Method | Purpose |
| :--- | :--- | :--- | :--- |
| Health | `/api/health` | `GET` | Service status, DB connectivity, active LLM mode |
| Inbox | `/api/inbox/load-mock` | `POST` | Load/reset mock inbox (16 emails) into SQLite |
| Inbox | `/api/inbox/upload` | `POST` | Ingest custom JSON array of emails |
| Inbox | `/api/inbox/emails` | `GET` | List emails with optional `category`, `search`, `processed` filters |
| Inbox | `/api/inbox/emails/{id}` | `GET` | Full email detail, thread context, extracted actions, linked drafts |
| Ingestion | `/api/inbox/process` | `POST` | Run Prompt Brain pipeline (categorize + extract actions + optional auto-draft) across all or selected email IDs |
| Prompts | `/api/prompts` | `GET` | List all stored Prompt Brain configurations |
| Prompts | `/api/prompts` | `POST` | Create a new custom prompt template |
| Prompts | `/api/prompts/{key}` | `PUT` | Update an existing prompt template (`categorization`, `action_item`, `auto_reply`, or custom) |
| Prompts | `/api/prompts/reset` | `POST` | Restore default prompt templates |
| Agent Chat | `/api/agent/chat` | `POST` | Chat with Email Agent (scoped to `email_id` or full `inbox`), strictly injecting stored prompts |
| Agent Chat | `/api/agent/history` | `GET` | Retrieve recent chat turns |
| Drafts | `/api/drafts` | `GET` | List all saved drafts |
| Drafts | `/api/drafts/generate` | `POST` | Generate a reply or new email draft using Auto-Reply Prompt + thread context |
| Drafts | `/api/drafts` | `POST` | Save a manually composed draft |
| Drafts | `/api/drafts/{id}` | `PUT` | Edit subject, body, suggested follow-ups, or metadata of an existing draft |
| Drafts | `/api/drafts/{id}` | `DELETE` | Delete a draft |

---

## 4. Phased Implementation Checklist

### Phase 0: Planning & Repo Foundation
- [x] Master architecture & integration plan (`docs/PLAN.md`)
- [x] Backend design spec (`backend/docs/BACKEND_DESIGN.md`)
- [x] Frontend design spec (`frontend/docs/FRONTEND_DESIGN.md`)
- [x] Verify root `.gitignore` covers Python venv, Node `node_modules`, `.next`, SQLite DBs, `.env`

### Phase 1: Backend Core, Assets & Prompt Brain (`backend/`)
- [x] Create Python virtual environment and install dependencies (`fastapi`, `uvicorn`, `pydantic-settings`, `httpx`, `pytest`, etc.)
- [x] Author `data/mock_inbox.json` (16 emails: meeting requests, newsletters, spam, task requests, project updates, multi-message thread)
- [x] Author `data/default_prompts.json` (Categorization, Action Item Extraction, Auto-Reply Draft)
- [x] Implement SQLite repository layer (`emails`, `prompts`, `drafts`, `chat_messages`)
- [x] Implement LLM Gateway with:
  - [x] Configurable real LLM provider (OpenAI / Gemini / OpenAI-compatible base URL, plus auto-detection of `GEMINI_API_KEY` / `OPENAI_API_KEY`)
  - [x] Graceful error handling (timeouts, rate limits, malformed JSON recovery)
  - [x] Deterministic prompt-aware mock engine when no API key is configured (so local/CI E2E tests and prompt-mutation demos work offline too)
- [x] Implement Ingestion Pipeline (`load -> categorize -> extract action items -> save state`)
- [x] Implement Agent Chat Service & Draft Generation Service (`status="draft"`, never auto-sends)
- [x] Add `backend/Dockerfile` *(note: Docker Desktop daemon was offline during local run; container build ready to run via `docker build`)*

### Phase 2: Frontend Application (`frontend/`)
- [x] Initialize Next.js (TypeScript + Tailwind CSS) in `frontend/`
- [x] Build typed API client (`src/lib/api.ts`) with clear error states
- [x] Build **Inbox Viewer** (Load Mock Inbox button, Run Ingestion Pipeline button, category filter chips, search, email list showing Sender / Subject / Timestamp / Category tags, detail drawer/pane with extracted JSON action items)
- [x] Build **Prompt Brain Panel** (View, create, edit, save, reset prompts for Categorization, Action Item Extraction, Auto-Reply Draft)
- [x] Build **Email Agent Chat** (Scope toggle: Selected Email vs. Entire Inbox; quick prompts like *"Summarize this email"*, *"What tasks do I need to do?"*, *"Draft a reply based on my tone"*, *"Show me all urgent emails"*; button to convert reply suggestion directly into a Draft)
- [x] Build **Drafts Studio** (Generate new draft, generate reply with thread context, edit Subject/Body/Follow-ups, inspect JSON metadata, save draft, explicit "Safe Storage Mode — Never Auto-Sent" badge)
- [x] Add `frontend/Dockerfile` (standalone Next.js build; `next build` standalone verified locally)

### Phase 3: Documentation & Verification
- [x] Write comprehensive root `README.md` (setup, running backend & UI, loading Mock Inbox, configuring prompts, usage examples, Docker deployment)
- [x] Backend unit & API integration tests (`pytest` — 7/7 passed)
- [x] Frontend typecheck, lint, unit/component tests (`vitest` — 3/3 passed), and production `next build`
- [x] Live End-to-End verification against running FastAPI + Gemini API + Next.js servers (`E2E-1` through `E2E-8` verified)

---

## 5. End-to-End Verification Scenarios

| ID | Scenario | Steps | Expected Outcome |
| :--- | :--- | :--- | :--- |
| **E2E-1** | **Load Mock Inbox & Inspect** | Click **Load Mock Inbox** in UI (or `POST /api/inbox/load-mock`). | 16 emails appear with sender, subject, timestamp; unprocessed state clearly shown. |
| **E2E-2** | **Run Ingestion Pipeline** | Click **Process Inbox** (`POST /api/inbox/process`). | Every email receives a category tag (`Important`, `Newsletter`, `Spam`, `To-Do`) and JSON action items (`task`, `deadline`) persisted in SQLite. |
| **E2E-3** | **Prompt Brain Customization Changes Behavior** | Edit Categorization Prompt (e.g., add category `Urgent-Exec` or change To-Do rule) -> Save -> Re-run Process Inbox. | Stored prompt updates in DB and subsequent categorization/extraction outputs reflect the modified prompt instructions. |
| **E2E-4** | **Email-Scoped Agent Chat** | Select a meeting-request or task-request email -> Ask *"Summarize this email"* and *"What tasks do I need to do?"*. | Agent uses email text + stored prompts and returns accurate summary & task list. |
| **E2E-5** | **Inbox-Wide Agent Chat** | Switch chat scope to **Entire Inbox** -> Ask *"Show me all urgent emails"*. | Agent filters/analyzes inbox using stored prompts and lists urgent/important emails with references. |
| **E2E-6** | **Auto-Reply Draft & Thread Context** | Select a meeting request email -> Click **Generate Reply Draft** (or ask Agent to draft a reply). | Draft includes `Subject` (`Re: ...`), polite `Body` asking for an agenda (per Auto-Reply prompt), optional follow-ups, and JSON metadata; stored with `status: "draft"`. |
| **E2E-7** | **Create, Edit & Save New Draft** | Open **New Draft**, generate or write Subject/Body, edit text, click **Save Draft**, reload page. | Draft persists across reloads in SQLite; zero emails are ever sent. |
| **E2E-8** | **LLM Error Resilience** | Simulate invalid API key / upstream LLM timeout during ingestion or chat. | Backend returns structured non-crashing error payload; UI displays graceful retryable alert without losing existing state. |
| **E2E-9** | **Independent Docker Builds** | Build `backend/Dockerfile` and `frontend/Dockerfile` separately. | Both containers start cleanly, pass healthcheck, and communicate via `NEXT_PUBLIC_API_BASE_URL`. |
