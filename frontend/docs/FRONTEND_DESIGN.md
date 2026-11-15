# Frontend Architecture & Design (`frontend/`)

## 1. Purpose

The `frontend/` service is a standalone **Next.js (App Router + TypeScript + Tailwind CSS)** web application providing an intuitive workspace for:
1. **Inbox Viewer & Ingestion Controls** — Load Mock Inbox, upload custom JSON, trigger Prompt Brain ingestion, filter by category/search, inspect email bodies, threads, and extracted action items.
2. **Prompt Brain Configuration Panel** — View, create, edit, save, and reset the agent's guiding prompts (`Categorization`, `Action Item Extraction`, `Auto-Reply Draft`, and custom prompts).
3. **Email Agent Chat** — Conversational assistant scoped to either the selected email or the entire inbox, with one-click prompt chips and "Save as Draft" conversion for generated replies.
4. **Drafts Studio** — Compose new drafts, generate thread-aware replies, edit Subject/Body/Suggested Follow-ups, inspect JSON metadata (`category`, `action_items`), and persist safely as drafts (never auto-sent).

---

## 2. Layout & UX Architecture

A clean 3-column / tabbed responsive productivity workspace:

- **Top Header Bar**:
  - App title, active LLM mode badge (`Mock Engine` / `OpenAI` / `Gemini`), and live **DB Status** badge (`Connected` + dialect)
  - **Load Mock Inbox** button
  - **Process Inbox** (Ingestion Pipeline) button with progress/result feedback
  - Primary navigation tabs: **Inbox & Agent**, **Prompt Brain**, **Drafts Studio**, **Observability & DB**
- **Left Pane (Inbox List)**:
  - Search bar + Category filter pills (`All`, `Important`, `To-Do`, `Newsletter`, `Spam`, plus any custom categories produced by edited prompts)
  - Email cards displaying **Sender**, **Subject**, **Timestamp**, **Category tag badge**, and **Action-item count badge**
- **Center Pane (Email Reader + Action Items)**:
  - Full sender/recipient/timestamp metadata, thread history (if part of a multi-message thread), formatted body
  - Extracted **Action Items** table/cards (`task`, `deadline`)
  - Quick CTA: **Generate Auto-Reply Draft**
- **Right Pane (Email Agent Chat & Quality Feedback)**:
  - Unique `conversation_id` session tracker with **New Conversation** button and conversation selector
  - Scope selector: `Selected Email` vs `Entire Inbox`
  - Quick prompt pills:
    - *"Summarize this email"*
    - *"What tasks do I need to do?"*
    - *"Draft a reply based on my tone"*
    - *"Show me all urgent emails"*
  - Chat transcript displaying response timing (`ms`), `conversation_id` / `email_id` tags, **Thumbs Up / Thumbs Down** quality feedback controls, and **Save Reply as Draft** button when the assistant outputs a draft/reply
- **Observability & DB Tab (`ObservabilityPanel`)**:
  - Database connectivity diagnostics (`status`, `dialect`, `db_latency_ms`, WAL/pool details, table counts)
  - Timing & quality KPIs (`avg` & `p95` latency, success rate, total tokens, feedback approval rate, breakdown by operation)
  - Filterable **Conversations** & **LLM Execution Logs** tables keyed by `conversation_id`, `email_id`, `prompt_hash`, `latency_ms`, and `status`

---

## 3. State Management & Error Handling

- **Typed API Client (`src/lib/api.ts`)**: Wraps `fetch` against `NEXT_PUBLIC_API_BASE_URL` (defaulting to `http://localhost:8000` in local dev).
- **Synchronized Workspace State**:
  - Updating a prompt in Prompt Brain immediately persists to backend and marks processed state as ready for re-ingestion.
  - Running ingestion refreshes both the email list and selected email detail.
  - Saving or generating a draft updates the Drafts Studio count and links the draft to the source email.
- **Graceful Error Banners**:
  - Non-blocking dismissible alerts if the backend is unreachable or an LLM call returns an error, preserving any unsaved editor input.

---

## 4. Deployment (`frontend/Dockerfile`)

- Multi-stage Node 20 Alpine Dockerfile (`deps` -> `builder` -> `runner`) using `output: "standalone"` in `next.config.*`
- Exposes port `3000`
- Build/runtime environment variable:
  - `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`
