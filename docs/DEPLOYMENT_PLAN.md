# Live Production Deployment Plan — Email Productivity Agent

## 1. Purpose & Deployment Philosophy

This document defines the end-to-end plan for deploying the **Email Productivity Agent** into a live production environment. Because `backend/` (**FastAPI + Python 3.12**) and `frontend/` (**Next.js 15 standalone + React 19**) are decoupled services with independent `Dockerfile`s, they can be deployed either as containers (Google Cloud Run, Fly.io, AWS ECS, Railway) or mixed PaaS targets (Vercel for Next.js + Render/Railway for FastAPI).

> **Safety Invariant in Production:** All generated and edited replies persist strictly with `status: "draft"`. No outbound SMTP/email-sending integration exists or should be enabled without an explicit human send-confirmation workflow.

---

## 2. Live Production Topology

```mermaid
flowchart LR
    User["User Browser (Light / Dark UI)"] -->|HTTPS| FE["Frontend Service (Next.js 15 Standalone :3000)"]
    User -->|"REST JSON (CORS Protected)"| BE["Backend Service (FastAPI / Uvicorn :8000)"]
    FE -.->|"NEXT_PUBLIC_API_BASE_URL baked at build"| BE
    BE -->|"SQLAlchemy 2.x (sslmode=require)"| PG["Managed PostgreSQL 15+"]
    BE -->|"HTTPS API Key"| LLM["Gemini 2.5 Flash / OpenAI"]
    BE -->|"JSON Stdout Logs"| Logs["Cloud Log Drain (X-Request-ID + Latency)"]
```

### Key Architectural Constraints
1. **Build-Time API URL:** Next.js embeds `NEXT_PUBLIC_API_BASE_URL` during `npm run build` (`frontend/Dockerfile` `ARG NEXT_PUBLIC_API_BASE_URL`). Always set this build argument to the **live public HTTPS URL of the FastAPI backend** (for example `https://api.email-agent.example.com`) before building or deploying the frontend image.
2. **Exact Origin CORS:** FastAPI reads `CORS_ORIGINS` (comma-separated, **without trailing slashes**, e.g. `https://email-agent.example.com`). Mismatched scheme (`http` vs `https`) or trailing `/` will block browser API calls.
3. **Database Choice for Live Traffic:** Switch from local SQLite WAL (`sqlite:///data/email_agent.db`) to **Managed PostgreSQL** (`DATABASE_URL=postgresql+psycopg://...`) whenever running ephemeral container filesystems (Cloud Run, Render free/standard dynos) or multiple replicas.

---

## 3. Environment Variables & Secrets Matrix

### 3.1 Backend Runtime Variables (`backend/`)

| Variable | Required in Prod | Recommended Production Value | Notes |
| :--- | :--- | :--- | :--- |
| `PORT` | Yes | `8000` (or platform-injected `$PORT`) | `uvicorn` binds `0.0.0.0:${PORT}`. |
| `CORS_ORIGINS` | Yes | `https://app.example.com` | Comma-separated exact HTTPS frontend origins. |
| `DATABASE_URL` | **Yes (Cloud)** | `postgresql+psycopg://user:pass@host:5432/db?sslmode=require` | Overrides `DATABASE_PATH`; enables SQLAlchemy `QueuePool` (`pool_pre_ping=True`). |
| `DATABASE_PATH` | SQLite only | `/app/data/email_agent.db` | Used only if `DATABASE_URL` is unset (requires a persistent disk mounted at `/app/data`). |
| `LLM_PROVIDER` | Yes | `gemini` (or `openai` / `openai_compatible`) | Set explicitly in production; do not rely on `mock`. |
| `GEMINI_API_KEY` / `LLM_API_KEY` | **Yes (Secret)** | Store in platform Secret Manager | Auto-detected by `Settings.resolved_llm_provider`. Never commit `.env`. |
| `LLM_MODEL` | Recommended | `gemini-2.5-flash` (or `gpt-4o-mini`) | Explicit pinned model version avoids silent upstream shifts. |
| `LLM_TIMEOUT_SECONDS` | Optional | `45.0` | Allows complex multi-email inbox Q&A without premature timeouts. |
| `LLM_ALLOW_MOCK_FALLBACK` | Recommended | `false` in strict prod (`true` for demo resilience) | Prevents silent fallback to mock answers if real LLM credentials fail. |
| `LOG_LEVEL` | Optional | `INFO` | Emits JSON lines with `request_id`, `duration_ms`, tokens, and DB ping stats. |
| `LOG_FILE_PATH` | Optional | `/app/logs/backend.log` | Also logged to stdout for container log collectors. |

### 3.2 Frontend Variables (`frontend/`)

| Variable | Phase | Recommended Production Value | Notes |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_API_BASE_URL` | **Build-Time & Runtime** | `https://api.example.com` | Must be passed at build time (`--build-arg` / Vercel Build Env). |
| `PORT` | Runtime | `3000` (or platform-injected `$PORT`) | Standalone `server.js` listens on `HOSTNAME:PORT`. |
| `HOSTNAME` | Runtime | `0.0.0.0` | Required inside Docker containers. |
| `NODE_ENV` | Runtime | `production` | Set cleanly in `frontend/Dockerfile`. |

---

## 4. Database Provisioning & Schema Lifecycle

1. **Provision Managed PostgreSQL 15+:**
   - Recommended providers: **Neon**, **Supabase**, **Cloud SQL**, **Render Postgres**, or **Railway Postgres**.
   - Ensure TLS (`?sslmode=require`) is enabled on the connection string.
2. **Automatic Schema Bootstrapping (`init_db` & `migrate_schema`):**
   - On FastAPI startup (`app/main.py` lifespan), SQLAlchemy 2.x executes idempotent `metadata.create_all(engine)` plus column migrations and seeds `default_prompts.json` if `prompts` is empty.
   - Verify database readiness immediately via `GET /api/observability/db-status` (`status: "connected"`, `dialect: "postgresql"`, `db_latency_ms`).
3. **Backups & Retention:**
   - Enable automated daily PITR backups on PostgreSQL.
   - Periodically prune or archive old `llm_execution_logs` rows if execution volume exceeds 500k records.
4. **SQLite Fallback Rules (Single-VM / Hobby Deploy only):**
   - If deploying without PostgreSQL, attach a persistent SSD volume at `/app/data`, keep instance count at **1**, and keep `workers=1` so SQLite WAL handles concurrent reads cleanly.

---

## 5. Independent Container Build & Run Guide

### 5.1 Build Backend Image (`backend/Dockerfile`)

```bash
docker build -t email-agent-backend:v1 ./backend

docker run -d \
  --name email-agent-backend \
  -p 8000:8000 \
  -e PORT=8000 \
  -e CORS_ORIGINS="https://app.example.com" \
  -e DATABASE_URL="postgresql+psycopg://USER:PASS@HOST:5432/email_agent?sslmode=require" \
  -e LLM_PROVIDER="gemini" \
  -e GEMINI_API_KEY="YOUR_SECRET_KEY" \
  -e LLM_MODEL="gemini-2.5-flash" \
  -e LLM_ALLOW_MOCK_FALLBACK="false" \
  -e LOG_LEVEL="INFO" \
  email-agent-backend:v1
```

Container `HEALTHCHECK` automatically probes `GET http://localhost:${PORT}/api/health`.

### 5.2 Build Frontend Image (`frontend/Dockerfile`)

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_BASE_URL="https://api.example.com" \
  -t email-agent-frontend:v1 \
  ./frontend

docker run -d \
  --name email-agent-frontend \
  -p 3000:3000 \
  -e PORT=3000 \
  -e HOSTNAME=0.0.0.0 \
  email-agent-frontend:v1
```

`frontend/Dockerfile` builds Next.js with `output: "standalone"` and runs as unprivileged user `nextjs:nodejs` (`uid 1001`).

---

## 6. Cloud Platform Deployment Blueprints

### Option A: Serverless Containers (Google Cloud Run + Managed Postgres)

**1. Deploy Backend (`Cloud Run`):**
```bash
gcloud builds submit ./backend --tag REGION-docker.pkg.dev/PROJECT/email-agent/backend:v1

gcloud run deploy email-agent-backend \
  --image REGION-docker.pkg.dev/PROJECT/email-agent/backend:v1 \
  --platform managed \
  --region REGION \
  --allow-unauthenticated \
  --port 8000 \
  --set-env-vars "CORS_ORIGINS=https://FRONTEND_URL,LLM_PROVIDER=gemini,LLM_MODEL=gemini-2.5-flash,LLM_ALLOW_MOCK_FALLBACK=false" \
  --set-secrets "DATABASE_URL=EMAIL_AGENT_DB_URL:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest"
```

**2. Deploy Frontend (`Cloud Run`):**
*(Capture the HTTPS `BACKEND_URL` emitted by step 1 before building the frontend image.)*
```bash
gcloud builds submit ./frontend \
  --config - <<'EOF'
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '--build-arg'
      - 'NEXT_PUBLIC_API_BASE_URL=https://BACKEND_URL'
      - '-t'
      - 'REGION-docker.pkg.dev/PROJECT/email-agent/frontend:v1'
      - './frontend'
images:
  - 'REGION-docker.pkg.dev/PROJECT/email-agent/frontend:v1'
EOF

gcloud run deploy email-agent-frontend \
  --image REGION-docker.pkg.dev/PROJECT/email-agent/frontend:v1 \
  --platform managed \
  --region REGION \
  --allow-unauthenticated \
  --port 3000
```

**3. Finalize CORS Origin:**
Update `CORS_ORIGINS` on `email-agent-backend` to match the final custom domain or `.run.app` origin of `email-agent-frontend`.

### Option B: Hybrid PaaS (Vercel Frontend + Render/Railway Backend + Managed Postgres)
1. **Database:** Create a managed PostgreSQL instance on Neon / Render / Railway and copy its TLS connection string (`postgresql+psycopg://...`).
2. **Backend (Render Web Service or Railway Service):**
   - Root directory: `backend`
   - Runtime: Docker (`backend/Dockerfile`) or Python (`pip install -r requirements.txt && uvicorn app.main:app --host 0.0.0.0 --port $PORT`)
   - Configure secret env vars (`DATABASE_URL`, `GEMINI_API_KEY`, `LLM_PROVIDER`, `CORS_ORIGINS`).
3. **Frontend (Vercel):**
   - Root directory: `frontend`
   - Framework Preset: `Next.js` (`npm run build`)
   - Environment Variable: `NEXT_PUBLIC_API_BASE_URL=https://your-backend-service.onrender.com` (available during **Build**).

---

## 7. Pre-Deploy Verification & Live Smoke Checklist

### 7.1 Pre-Deploy Gate (CI / Local)
- [ ] Backend unit & E2E tests pass: `cd backend && .venv/Scripts/python -m pytest -v` (or `pytest -v` on Linux/CI)
- [ ] Frontend typecheck & lint pass: `cd frontend && npm run typecheck && npm run lint`
- [ ] Frontend Vitest suite passes: `cd frontend && npm test`
- [ ] Frontend standalone production build succeeds with target `NEXT_PUBLIC_API_BASE_URL`: `cd frontend && npm run build`
- [ ] Secret scan clean: confirm `.env`, `*.db`, and `backend/logs/` are not committed to Git.

### 7.2 Post-Deploy Live Smoke Verification
Execute against the live HTTPS endpoints immediately after cutover:

1. **Backend Health & DB Connectivity:**
   - `GET https://<backend>/api/health` -> HTTP `200`, `status: "ok"`, `db_status: "connected"`, `db_dialect: "postgresql"`, `llm_mode: "gemini"`, headers `X-Request-ID` & `X-Response-Time-Ms` present.
   - `GET https://<backend>/api/observability/db-status` -> HTTP `200`, `db_latency_ms` low (< 50 ms within region).
2. **Frontend Availability & CORS Integration:**
   - Open `https://<frontend>` in browser -> HTTP `200`, Light/Dark mode toggle works, header displays live `LLM: gemini` and `DB: postgresql (connected)`.
   - Confirm browser DevTools Console/Network shows zero CORS errors.
3. **Core Prompt-Driven Flow:**
   - Click **Load Mock Inbox** -> 16 emails persist in PostgreSQL.
   - Click **Process Inbox** -> Categories & action items populate; confirm new records in **Observability & DB** (`categorize`, `extract_actions` with latency and tokens).
   - Send a chat prompt in **Email Agent Copilot** -> verify formatted Markdown rendering, active `conversation_id`, response latency badge, and click thumbs-up (`POST /api/observability/messages/{id}/feedback`).
   - Click **Generate Reply Draft** -> verify draft saves strictly as `status: "draft"` in **Drafts Studio**.

---

## 8. Monitoring, Alerts & Rollback

### 8.1 Production Observability Signals
- **Built-in Dashboard (`Observability & DB` tab & `/api/observability/*`):** Track `success_rate_pct`, `parse_valid_rate_pct`, `avg_latency_ms`, `p95_latency_ms`, `total_tokens`, and user `approval_rate_pct`.
- **Platform Alerts (Recommended Thresholds):**
  - **Availability:** Alert if `GET /api/health` fails 2 consecutive probes or returns `status: "degraded"` (`db_status != "connected"`).
  - **Latency:** Alert if backend `p95` API latency exceeds `15,000 ms` on `/api/agent/chat` or `/api/inbox/process`.
  - **LLM Reliability:** Alert if `error_count` spikes (`success_rate_pct < 95%`) or `parse_valid_rate_pct < 90%`.

### 8.2 Rollback Procedure
1. **Frontend Rollback:** Re-point traffic to previous Vercel deployment or previous Cloud Run revision (`gcloud run services update-traffic email-agent-frontend --to-revisions=PREVIOUS=100`).
2. **Backend Rollback:** Route traffic back to the prior container image digest (`v(N-1)`). Schema updates in `database.py` are additive (`ADD COLUMN IF NOT EXISTS` style), so previous backend versions remain backward-compatible with new columns.
3. **Database Rollback (if data corruption occurred):** Restore PostgreSQL from the latest pre-release PITR snapshot before re-enabling write traffic.
