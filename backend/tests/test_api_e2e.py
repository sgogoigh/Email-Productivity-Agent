"""Comprehensive unit and API end-to-end tests for the Email Productivity Agent backend."""

from pathlib import Path
from typing import Iterator

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    """Create an isolated FastAPI TestClient backed by a fresh temporary SQLite DB."""
    db_file = tmp_path / "test_email_agent.db"
    settings = Settings(
        database_path=str(db_file),
        database_url="",
        log_file_path=str(tmp_path / "test_backend.log"),
        llm_provider="mock",
        llm_api_key="",
        gemini_api_key="",
        openai_api_key="",
        llm_allow_mock_fallback=True,
    )
    app = create_app(custom_settings=settings)
    with TestClient(app) as test_client:
        yield test_client


def test_health_and_default_prompts_seeded(client: TestClient) -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert "X-Request-ID" in resp.headers
    assert "X-Response-Time-Ms" in resp.headers
    body = resp.json()
    assert body["status"] == "ok"
    assert body["db_status"] == "connected"
    assert body["db_dialect"] == "sqlite"
    assert body["db_latency_ms"] >= 0.0
    assert body["prompt_count"] == 3
    assert body["email_count"] == 0

    prompts_resp = client.get("/api/prompts")
    assert prompts_resp.status_code == 200
    keys = [p["key"] for p in prompts_resp.json()]
    assert keys == ["categorization", "action_item", "auto_reply"]


def test_load_mock_inbox_and_process_pipeline(client: TestClient) -> None:
    load_resp = client.post("/api/inbox/load-mock")
    assert load_resp.status_code == 200
    load_data = load_resp.json()
    assert load_data["loaded_count"] == 16
    assert all(e["category"] is None for e in load_data["emails"])

    proc_resp = client.post("/api/inbox/process")
    assert proc_resp.status_code == 200
    proc_data = proc_resp.json()
    assert proc_data["total_requested"] == 16
    assert proc_data["processed_count"] == 16
    assert proc_data["error_count"] == 0

    emails = client.get("/api/inbox/emails").json()
    categories = {e["category"] for e in emails}
    assert {"Newsletter", "Spam", "To-Do"}.issubset(categories)

    # Verify SOC2 email (email-003) extracted 2 structured action items with deadline
    soc2 = client.get("/api/inbox/emails/email-003").json()
    assert soc2["category"] == "To-Do"
    assert len(soc2["action_items"]) == 2
    assert "Wednesday" in soc2["action_items"][0]["deadline"]


def test_prompt_edits_change_agent_behavior(client: TestClient) -> None:
    client.post("/api/inbox/load-mock")
    client.post("/api/inbox/process")

    # Initially email-001 (meeting request) is To-Do
    before = client.get("/api/inbox/emails/email-001").json()
    assert before["category"] == "To-Do"

    # Update categorization prompt to add Meeting category and sender rule for Maya -> VIP
    new_cat_prompt = (
        "Categorize emails into: Important, Newsletter, Spam, To-Do, Meeting, VIP.\n"
        "Emails from maya.lin@acme-corp.io categorized as VIP."
    )
    upd = client.put("/api/prompts/categorization", json={"template": new_cat_prompt})
    assert upd.status_code == 200

    # Also customize action item prompt to prefix [ACTION] and ignore deadlines
    upd_act = client.put(
        "/api/prompts/action_item",
        json={"template": "Extract tasks and prefix each task with [ACTION] and ignore deadlines."},
    )
    assert upd_act.status_code == 200

    # Re-run ingestion pipeline
    reproc = client.post("/api/inbox/process")
    assert reproc.status_code == 200

    after_maya = client.get("/api/inbox/emails/email-001").json()
    assert after_maya["category"] == "VIP"

    after_elena = client.get("/api/inbox/emails/email-008").json()
    assert after_elena["category"] == "Meeting"

    after_soc2 = client.get("/api/inbox/emails/email-003").json()
    assert after_soc2["action_items"][0]["task"].startswith("[ACTION] ")
    assert after_soc2["action_items"][0]["deadline"] == "Omitted"

    # Custom prompt CRUD & reset
    created = client.post(
        "/api/prompts",
        json={
            "key": "tone_guide",
            "name": "Executive Tone Guide",
            "description": "Concise executive style",
            "template": "Keep replies under 4 sentences with clear next steps.",
        },
    )
    assert created.status_code == 201
    assert client.delete("/api/prompts/tone_guide").status_code == 204
    assert client.delete("/api/prompts/categorization").status_code == 400

    reset_resp = client.post("/api/prompts/reset")
    assert reset_resp.status_code == 200
    assert any(p["key"] == "categorization" and "To-Do" in p["template"] for p in reset_resp.json())


def test_email_and_inbox_agent_chat(client: TestClient) -> None:
    client.post("/api/inbox/load-mock")
    client.post("/api/inbox/process")

    # Single-email summarize
    sum_resp = client.post(
        "/api/agent/chat",
        json={"scope": "email", "email_id": "email-003", "query": "Summarize this email"},
    )
    assert sum_resp.status_code == 200
    assert "SOC2" in sum_resp.json()["assistant_message"]["content"]

    # Single-email tasks
    task_resp = client.post(
        "/api/agent/chat",
        json={"scope": "email", "email_id": "email-003", "query": "What tasks do I need to do?"},
    )
    assert task_resp.status_code == 200
    assert "Rotate" in task_resp.json()["assistant_message"]["content"]

    # Single-email draft reply
    reply_resp = client.post(
        "/api/agent/chat",
        json={
            "scope": "email",
            "email_id": "email-001",
            "query": "Draft a reply based on my tone",
            "tone": "concise",
        },
    )
    assert reply_resp.status_code == 200
    assert reply_resp.json()["suggested_draft"] is not None
    assert "agenda" in reply_resp.json()["suggested_draft"]["body"].lower()

    # Inbox-wide urgent query
    urgent_resp = client.post(
        "/api/agent/chat",
        json={"scope": "inbox", "query": "Show me all urgent emails"},
    )
    assert urgent_resp.status_code == 200
    assert "email-003" in urgent_resp.json()["referenced_email_ids"] or "email-010" in urgent_resp.json()["referenced_email_ids"]

    # Validation checks
    bad_scope = client.post("/api/agent/chat", json={"scope": "email", "query": "Hi"})
    assert bad_scope.status_code == 400

    history = client.get("/api/agent/history").json()
    assert len(history) == 8  # 4 user + 4 assistant turns


def test_draft_generation_thread_context_and_crud(client: TestClient) -> None:
    client.post("/api/inbox/load-mock")
    client.post("/api/inbox/process")

    # Generate auto-reply for thread follow-up email-002 (thread-q4-roadmap has 2 emails)
    gen_resp = client.post(
        "/api/drafts/generate",
        json={"email_id": "email-002", "tone": "polite and professional"},
    )
    assert gen_resp.status_code == 201
    draft = gen_resp.json()
    assert draft["status"] == "draft"
    assert draft["subject"].startswith("Re:")
    assert "agenda" in draft["body"].lower()
    assert draft["metadata"]["thread_email_count"] == 2
    assert len(draft["suggested_followups"]) >= 1

    # Edit and save draft
    draft_id = draft["id"]
    upd_resp = client.put(
        f"/api/drafts/{draft_id}",
        json={"subject": "Re: Updated Q4 Roadmap Sync", "body": "Hi Maya, please share the agenda."},
    )
    assert upd_resp.status_code == 200
    assert upd_resp.json()["status"] == "draft"
    assert upd_resp.json()["subject"] == "Re: Updated Q4 Roadmap Sync"

    # Manual new draft creation
    new_resp = client.post(
        "/api/drafts",
        json={"subject": "Status Update", "body": "Draft body for review."},
    )
    assert new_resp.status_code == 201
    assert len(client.get("/api/drafts").json()) == 2

    assert client.delete(f"/api/drafts/{draft_id}").status_code == 204


def test_upload_custom_emails_and_filters(client: TestClient) -> None:
    upload_resp = client.post(
        "/api/inbox/upload?replace=true",
        json=[
            {
                "id": "custom-1",
                "sender": "Alice",
                "sender_email": "alice@example.com",
                "subject": "Please review budget spreadsheet",
                "body": "Please approve the Q1 budget sheet by Friday.",
                "timestamp": "2026-11-15T12:00:00Z",
            }
        ],
    )
    assert upload_resp.status_code == 200
    assert upload_resp.json()["loaded_count"] == 1

    client.post("/api/inbox/process")
    filtered = client.get("/api/inbox/emails", params={"search": "budget"}).json()
    assert len(filtered) == 1
    assert filtered[0]["id"] == "custom-1"


def test_llm_error_handling_is_graceful(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify upstream LLM failures never crash ingestion, chat, or draft endpoints."""
    settings = Settings(
        database_path=str(tmp_path / "err.db"),
        database_url="",
        log_file_path=str(tmp_path / "err_backend.log"),
        llm_provider="openai",
        llm_api_key="sk-invalid-test",
        llm_allow_mock_fallback=False,
    )
    app = create_app(custom_settings=settings)

    async def failing_post(*args, **kwargs):
        raise httpx.ConnectError("Simulated upstream outage")

    monkeypatch.setattr(httpx.AsyncClient, "post", failing_post)

    with TestClient(app) as err_client:
        err_client.post("/api/inbox/load-mock")

        proc_resp = err_client.post("/api/inbox/process", json={"email_ids": ["email-001"]})
        assert proc_resp.status_code == 200
        proc_data = proc_resp.json()
        assert proc_data["error_count"] == 1
        assert "LLM processing error" in proc_data["emails"][0]["processing_error"]

        chat_resp = err_client.post(
            "/api/agent/chat",
            json={"scope": "email", "email_id": "email-001", "query": "Summarize this email"},
        )
        assert chat_resp.status_code == 200
        assert chat_resp.json()["error"] is not None
        assert "error" in chat_resp.json()["assistant_message"]["content"].lower()

        draft_resp = err_client.post(
            "/api/drafts/generate",
            json={"email_id": "email-001"},
        )
        assert draft_resp.status_code == 502


def test_observability_db_status_conversations_timing_and_quality(client: TestClient) -> None:
    """Verify DB connectivity probe, unique conversation_id logging, timing, and quality ratings."""
    client.post("/api/inbox/load-mock")
    proc = client.post("/api/inbox/process", json={"email_ids": ["email-001", "email-003"]}).json()
    assert proc["duration_ms"] >= 0.0

    # Start a conversation on email-003 and continue with the returned conversation_id
    turn1 = client.post(
        "/api/agent/chat",
        json={"scope": "email", "email_id": "email-003", "query": "Summarize this email"},
    ).json()
    conv_id = turn1["conversation_id"]
    assert conv_id.startswith("conv-")
    assert turn1["latency_ms"] >= 0.0

    turn2 = client.post(
        "/api/agent/chat",
        json={
            "scope": "email",
            "email_id": "email-003",
            "conversation_id": conv_id,
            "query": "What tasks do I need to do?",
        },
    ).json()
    assert turn2["conversation_id"] == conv_id

    # Rate turn1 positively and turn2 negatively
    fb1 = client.post(
        f"/api/observability/messages/{turn1['assistant_message']['id']}/feedback",
        json={"rating": 1, "notes": "Accurate summary"},
    )
    assert fb1.status_code == 200
    assert fb1.json()["quality_rating"] == 1

    fb2 = client.post(
        f"/api/observability/messages/{turn2['assistant_message']['id']}/feedback",
        json={"rating": -1, "notes": "Missed formatting preference"},
    )
    assert fb2.status_code == 200

    # Verify DB status endpoint
    db_status = client.get("/api/observability/db-status").json()
    assert db_status["status"] == "connected"
    assert db_status["dialect"] == "sqlite"
    assert db_status["wal_mode"].lower() == "wal"
    assert db_status["table_counts"]["emails"] == 16
    assert db_status["table_counts"]["conversations"] == 1
    assert db_status["table_counts"]["chat_messages"] == 4
    assert db_status["table_counts"]["llm_execution_logs"] >= 6

    # Verify conversation list & filter by conversation_id / email_id
    convs = client.get("/api/observability/conversations", params={"email_id": "email-003"}).json()
    assert len(convs) == 1
    assert convs[0]["id"] == conv_id
    assert convs[0]["message_count"] == 4
    assert convs[0]["positive_ratings"] == 1
    assert convs[0]["negative_ratings"] == 1

    logs = client.get("/api/observability/logs", params={"conversation_id": conv_id}).json()
    assert len(logs) == 2
    assert all(l["email_id"] == "email-003" and l["prompt_hash"] for l in logs)

    metrics = client.get("/api/observability/metrics").json()
    assert metrics["total_calls"] >= 6
    assert metrics["rated_messages"] == 2
    assert metrics["approval_rate_pct"] == 50.0
    assert any(op["operation"] == "chat" for op in metrics["by_operation"])

