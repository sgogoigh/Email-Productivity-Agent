# Email Productivity Agent

An intelligent, **prompt-driven Email Productivity Agent** with independent **FastAPI (`backend/`)** and **Next.js (`frontend/`)** services. Every LLM operation—email categorization, structured action-item extraction, conversational inbox Q&A, and thread-aware reply drafting—is dynamically guided by user-editable templates stored in the **Prompt Brain**.

> **Safety Invariant:** Drafts are strictly persisted in `status: "draft"` for human review. No email is ever sent automatically.

---

## Architecture & Documentation

- **Master Plan & E2E Checklist:** [docs/PLAN.md](docs/PLAN.md)
- **Backend Architecture & API Spec:** [backend/docs/BACKEND_DESIGN.md](backend/docs/BACKEND_DESIGN.md)
- **Frontend UI & State Spec:** [frontend/docs/FRONTEND_DESIGN.md](frontend/docs/FRONTEND_DESIGN.md)

```text
Email-Productivity-Agent/
├── docs/PLAN.md                  # Master integration plan, checklists & E2E scenarios
├── backend/                      # Standalone FastAPI + SQLite service
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── data/
│   │   ├── mock_inbox.json       # 16 realistic sample emails
│   │   └── default_prompts.json  # Core Prompt Brain templates
│   ├── app/                      # Modular FastAPI routers, services, repositories
│   └── tests/                    # Pytest unit & API E2E suite
└── frontend/                     # Standalone Next.js (TypeScript + Tailwind) UI
    ├── Dockerfile
    ├── package.json
    ├── src/                      # App Router workspace, components & typed API client
    └── tests/                    # Vitest + React Testing Library UI tests
```

---

## Setup Instructions

### Prerequisites
- **Python 3.12+**
- **Node.js 20+** and **npm**
- *(Optional)* **Docker** for independent container builds
- *(Optional)* An OpenAI, Gemini, or OpenAI-compatible API key (defaults to a deterministic **prompt-aware mock engine** so all features work immediately offline)

### 1. Backend Setup (`backend/`)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edit `backend/.env` if you want to connect a live LLM provider:
```env
LLM_PROVIDER=mock          # mock | openai | gemini | openai_compatible
LLM_API_KEY=               # Required for openai / gemini / openai_compatible
LLM_MODEL=                 # e.g. gpt-4o-mini or gemini-2.5-flash
LLM_ALLOW_MOCK_FALLBACK=true
```

### 2. Frontend Setup (`frontend/`)

```powershell
cd frontend
npm install
copy .env.example .env.local
```

Ensure `frontend/.env.local` points to your backend URL:
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

---

## How to Run the Backend & UI

### Local Development

**Terminal 1 — Start FastAPI Backend (`http://localhost:8000`):**
```powershell
cd backend
.\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
```

**Terminal 2 — Start Next.js UI (`http://localhost:3000`):**
```powershell
cd frontend
npm run dev
```

Open `http://localhost:3000` in your browser. Interactive FastAPI Swagger docs are available at `http://localhost:8000/docs`.

### Independent Docker Builds

Build and run each service separately:

```bash
# Backend container
docker build -t email-agent-backend ./backend
docker run -d -p 8000:8000 --name email-backend -e LLM_PROVIDER=mock email-agent-backend

# Frontend container
docker build -t email-agent-frontend --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 ./frontend
docker run -d -p 3000:3000 --name email-frontend email-agent-frontend
```

---

## How to Load the Mock Inbox

1. Open the web UI (`http://localhost:3000`).
2. Click **Load Mock Inbox** in the top header bar (calls `POST /api/inbox/load-mock`).
3. 16 realistic sample emails from `backend/data/mock_inbox.json` load into SQLite—covering **meeting requests**, **multi-message threads**, **task requests**, **project updates**, **newsletters**, and **spam/phishing messages**.
4. Click **Process Inbox** (calls `POST /api/inbox/process`) to run the stored **Categorization Prompt** and **Action Item Extraction Prompt** across all emails.
5. You can also ingest custom emails via **Import JSON** in the Inbox panel (`POST /api/inbox/upload`).

---

## How to Configure Prompts ("The Prompt Brain")

1. Switch to the **Prompt Brain** tab in the UI.
2. Edit any of the three core templates (seeded from `backend/data/default_prompts.json`):
   - **Categorization Prompt** — controls category names and classification rules (e.g., `Categorize emails into: Important, Newsletter, Spam, To-Do.`).
   - **Action Item Extraction Prompt** — controls JSON task/deadline extraction (`{ "task": "...", "deadline": "..." }`).
   - **Auto-Reply Draft Prompt** — controls reply tone and behavior (e.g., asking for an agenda on meeting requests).
3. Click **Save Prompt** (or create a custom prompt via **New Prompt**).
4. Click **Re-Process Inbox with Current Prompts** to see categories and action items update immediately according to your new prompt rules.

---

## Usage Examples

### 1. Categorize & Extract Deadlines
- Load the Mock Inbox and click **Process Inbox**.
- Select *"URGENT Action Required: Rotate Staging API Keys & Sign SOC2 Attestation"* to inspect its `To-Do` / `Urgent` badge and extracted JSON action items (`task` + `deadline`).

### 2. Email Agent Chat (Single Email & Entire Inbox)
- With an email selected, click quick prompts in **Email Agent Chat**:
  - *"Summarize this email"*
  - *"What tasks do I need to do?"*
  - *"Draft a reply based on my tone"* -> click **Save as Draft (Not Sent)** to move it into **Drafts Studio**.
- Switch the scope toggle to **Entire Inbox** and ask *"Show me all urgent emails"*.

### 3. Thread-Aware Auto-Reply & Draft Editing
- Open *"Re: Meeting Request: Q4 Product Roadmap Alignment"* (which includes a 2-message thread) and click **Generate Reply Draft**.
- Review the generated `Subject`, agenda-requesting `Body`, `Suggested Follow-Ups`, and `JSON Metadata` inside **Drafts Studio**, edit as desired, and click **Save Draft**.

---

## Running Tests

**Backend (`pytest`):**
```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -v
```

**Frontend (`vitest`, `tsc`, `eslint`, `next build`):**
```powershell
cd frontend
npm run typecheck
npm run lint
npm test
npm run build
```
