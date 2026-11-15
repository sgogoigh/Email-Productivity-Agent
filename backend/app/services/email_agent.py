"""Orchestration service with timing, quality telemetry, and conversation logging."""

import logging
import time
from typing import Any, Dict, List, Optional

import httpx

from app.logging_config import request_id_ctx
from app.models.schemas import (
    AgentChatRequest,
    AgentChatResponse,
    DraftGenerateRequest,
    DraftOut,
    EmailOut,
    ProcessInboxResponse,
)
from app.repositories.store import EmailStore, compute_prompt_hash, utc_now_iso
from app.services.llm_client import LLMGateway, LLMServiceError

logger = logging.getLogger("email_agent")


class EmailAgentService:
    """High-level coordinator uniting Prompt Brain storage, DB telemetry, and LLM calls."""

    def __init__(self, store: EmailStore, llm: LLMGateway) -> None:
        self.store = store
        self.llm = llm

    def _log_telemetry(
        self,
        *,
        operation: str,
        conversation_id: Optional[str],
        email_id: Optional[str],
        prompt_key: Optional[str],
        prompt_hash: Optional[str],
        started_at: str,
        elapsed_ms: float,
        usage: Optional[Dict[str, Any]],
        status: str,
        error_message: Optional[str] = None,
        output_preview: Optional[str] = None,
    ) -> None:
        default_provider, default_model = self.llm.active_provider_and_model()
        u = usage or {}
        provider = str(u.get("provider") or default_provider)
        model = str(u.get("model") or default_model)
        completed_at = utc_now_iso()
        record = self.store.record_llm_log(
            request_id=request_id_ctx.get(),
            operation=operation,
            conversation_id=conversation_id,
            email_id=email_id,
            prompt_key=prompt_key,
            prompt_hash=prompt_hash,
            provider=provider,
            model=model,
            started_at=started_at,
            completed_at=completed_at,
            latency_ms=elapsed_ms,
            input_tokens=int(u.get("input_tokens") or 0),
            output_tokens=int(u.get("output_tokens") or 0),
            total_tokens=int(u.get("total_tokens") or 0),
            parse_valid=bool(u.get("parse_valid", status == "success")),
            status=status,
            error_message=error_message,
            output_preview=output_preview,
        )
        logger.info(
            "llm_execution",
            extra={
                "extra_fields": {
                    "log_id": record.id,
                    "operation": operation,
                    "conversation_id": conversation_id,
                    "email_id": email_id,
                    "prompt_key": prompt_key,
                    "prompt_hash": prompt_hash,
                    "provider": provider,
                    "model": model,
                    "latency_ms": round(elapsed_ms, 2),
                    "total_tokens": record.total_tokens,
                    "status": status,
                    "error": error_message,
                }
            },
        )

    async def process_inbox(
        self, email_ids: Optional[List[str]] = None
    ) -> ProcessInboxResponse:
        """Execute ingestion pipeline: load -> categorize -> extract actions -> persist."""
        batch_t0 = time.perf_counter()
        prompts = self.store.get_prompt_map()
        cat_prompt = prompts.get("categorization")
        act_prompt = prompts.get("action_item")

        cat_template = (
            cat_prompt.template
            if cat_prompt
            else "Categorize into Important, Newsletter, Spam, To-Do."
        )
        act_template = (
            act_prompt.template
            if act_prompt
            else 'Extract tasks in JSON: {"task": "...", "deadline": "..."}.'
        )
        cat_hash = compute_prompt_hash(cat_template)
        act_hash = compute_prompt_hash(act_template)

        all_emails = self.store.list_emails()
        if email_ids:
            id_set = set(email_ids)
            targets = [e for e in all_emails if e.id in id_set]
        else:
            targets = all_emails

        processed_count = 0
        error_count = 0
        updated: List[EmailOut] = []

        for email in targets:
            cat_started = utc_now_iso()
            cat_t0 = time.perf_counter()
            try:
                category, urgency, reason, cat_usage = await self.llm.categorize_email(
                    email, cat_template
                )
                self._log_telemetry(
                    operation="categorize",
                    conversation_id=None,
                    email_id=email.id,
                    prompt_key="categorization",
                    prompt_hash=cat_hash,
                    started_at=cat_started,
                    elapsed_ms=(time.perf_counter() - cat_t0) * 1000.0,
                    usage=cat_usage,
                    status="success",
                    output_preview=f"{category} ({urgency}): {reason}",
                )

                act_started = utc_now_iso()
                act_t0 = time.perf_counter()
                actions, act_usage = await self.llm.extract_action_items(
                    email, act_template
                )
                self._log_telemetry(
                    operation="extract_actions",
                    conversation_id=None,
                    email_id=email.id,
                    prompt_key="action_item",
                    prompt_hash=act_hash,
                    started_at=act_started,
                    elapsed_ms=(time.perf_counter() - act_t0) * 1000.0,
                    usage=act_usage,
                    status="success",
                    output_preview=f"{len(actions)} action(s) extracted",
                )

                saved = self.store.save_email_processing(
                    email_id=email.id,
                    category=category,
                    urgency=urgency,
                    category_reason=reason,
                    action_items=actions,
                    processing_error=None,
                )
                if saved:
                    updated.append(saved)
                    processed_count += 1
            except (LLMServiceError, httpx.HTTPError, ValueError) as exc:
                error_count += 1
                self._log_telemetry(
                    operation="categorize",
                    conversation_id=None,
                    email_id=email.id,
                    prompt_key="categorization",
                    prompt_hash=cat_hash,
                    started_at=cat_started,
                    elapsed_ms=(time.perf_counter() - cat_t0) * 1000.0,
                    usage=None,
                    status="error",
                    error_message=str(exc),
                )
                saved = self.store.save_email_processing(
                    email_id=email.id,
                    category=email.category,
                    urgency=email.urgency,
                    category_reason=email.category_reason,
                    action_items=email.action_items,
                    processing_error=f"LLM processing error: {exc}",
                )
                if saved:
                    updated.append(saved)

        batch_ms = round((time.perf_counter() - batch_t0) * 1000.0, 2)
        return ProcessInboxResponse(
            total_requested=len(targets),
            processed_count=processed_count,
            error_count=error_count,
            duration_ms=batch_ms,
            prompts_used={
                "categorization": cat_template,
                "action_item": act_template,
            },
            emails=updated,
        )

    async def chat(self, request: AgentChatRequest) -> AgentChatResponse:
        """Handle single-email or inbox-wide chat turn with unique conversation_id & timing."""
        prompts = self.store.get_prompt_map()
        all_emails = self.store.list_emails()

        target_email: Optional[EmailOut] = None
        thread_emails: List[EmailOut] = []
        if request.scope == "email":
            if not request.email_id:
                raise ValueError("email_id is required when scope='email'")
            detail = self.store.get_email_detail(request.email_id)
            if not detail:
                raise KeyError(f"Email '{request.email_id}' not found")
            target_email = self.store.get_email(request.email_id)
            thread_emails = detail.thread_emails

        title_hint = (
            f"{target_email.subject}"
            if target_email
            else f"Inbox: {request.query[:60]}"
        )
        conversation_id = self.store.ensure_conversation(
            conversation_id=request.conversation_id,
            scope=request.scope,
            email_id=request.email_id,
            title_hint=title_hint,
        )

        user_msg = self.store.add_chat_message(
            conversation_id=conversation_id,
            scope=request.scope,
            role="user",
            content=request.query,
            email_id=request.email_id,
        )

        started_at = utc_now_iso()
        t0 = time.perf_counter()
        error_text: Optional[str] = None
        provider, model = self.llm.active_provider_and_model()
        prompt_bundle_hash = compute_prompt_hash(
            "\n".join(p.template for p in prompts.values())
        )

        try:
            result = await self.llm.chat_with_agent(
                query=request.query,
                scope=request.scope,
                email=target_email,
                thread_emails=thread_emails,
                all_emails=all_emails,
                prompts=prompts,
                tone=request.tone,
            )
            elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
            usage = result.get("_usage") or {}
            provider = str(usage.get("provider") or provider)
            model = str(usage.get("model") or model)
            assistant_content = result["content"]
            referenced_ids = result.get("referenced_email_ids") or []
            prompts_used = result.get("prompts_used") or list(prompts.keys())
            suggested_draft = result.get("suggested_draft")

            self._log_telemetry(
                operation="chat",
                conversation_id=conversation_id,
                email_id=request.email_id,
                prompt_key=",".join(prompts_used[:3]) or "chat",
                prompt_hash=prompt_bundle_hash,
                started_at=started_at,
                elapsed_ms=elapsed_ms,
                usage=usage,
                status="success",
                output_preview=assistant_content[:200],
            )
        except (LLMServiceError, httpx.HTTPError, ValueError) as exc:
            elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
            error_text = str(exc)
            assistant_content = (
                "I could not complete the request because the LLM provider returned an error. "
                f"Details: {exc}. Please check your LLM settings or retry."
            )
            referenced_ids = [request.email_id] if request.email_id else []
            prompts_used = list(prompts.keys())
            suggested_draft = None

            self._log_telemetry(
                operation="chat",
                conversation_id=conversation_id,
                email_id=request.email_id,
                prompt_key="chat",
                prompt_hash=prompt_bundle_hash,
                started_at=started_at,
                elapsed_ms=elapsed_ms,
                usage=None,
                status="error",
                error_message=error_text,
            )

        assistant_msg = self.store.add_chat_message(
            conversation_id=conversation_id,
            scope=request.scope,
            role="assistant",
            content=assistant_content,
            email_id=request.email_id,
            latency_ms=elapsed_ms,
            llm_mode=provider,
            model_name=model,
            metadata={
                "referenced_email_ids": referenced_ids,
                "prompts_used": prompts_used,
                "suggested_draft": suggested_draft,
                "error": error_text,
            },
        )

        return AgentChatResponse(
            conversation_id=conversation_id,
            user_message=user_msg,
            assistant_message=assistant_msg,
            suggested_draft=suggested_draft,
            referenced_email_ids=referenced_ids,
            prompts_used=prompts_used,
            latency_ms=elapsed_ms,
            error=error_text,
        )

    async def generate_draft(self, request: DraftGenerateRequest) -> DraftOut:
        """Generate and store a reply or new draft safely (never sent) with timing telemetry."""
        prompts = self.store.get_prompt_map()
        auto_prompt = (
            prompts["auto_reply"].template
            if "auto_reply" in prompts
            else "Draft a polite, concise reply."
        )
        auto_hash = compute_prompt_hash(auto_prompt)

        target_email: Optional[EmailOut] = None
        thread_emails: List[EmailOut] = []
        if request.email_id:
            detail = self.store.get_email_detail(request.email_id)
            if not detail:
                raise KeyError(f"Email '{request.email_id}' not found")
            target_email = self.store.get_email(request.email_id)
            thread_emails = detail.thread_emails

        started_at = utc_now_iso()
        t0 = time.perf_counter()
        try:
            generated = await self.llm.generate_draft(
                email=target_email,
                thread_emails=thread_emails,
                auto_reply_prompt=auto_prompt,
                instruction=request.instruction,
                tone=request.tone,
                recipient=request.recipient,
                subject_hint=request.subject_hint,
            )
            elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
            usage = generated.get("_usage") or {}
            self._log_telemetry(
                operation="generate_draft",
                conversation_id=None,
                email_id=request.email_id,
                prompt_key="auto_reply",
                prompt_hash=auto_hash,
                started_at=started_at,
                elapsed_ms=elapsed_ms,
                usage=usage,
                status="success",
                output_preview=generated.get("subject"),
            )
        except (LLMServiceError, httpx.HTTPError, ValueError) as exc:
            self._log_telemetry(
                operation="generate_draft",
                conversation_id=None,
                email_id=request.email_id,
                prompt_key="auto_reply",
                prompt_hash=auto_hash,
                started_at=started_at,
                elapsed_ms=(time.perf_counter() - t0) * 1000.0,
                usage=None,
                status="error",
                error_message=str(exc),
            )
            raise

        metadata: Dict[str, Any] = {
            "prompt_used": auto_prompt,
            "prompt_hash": auto_hash,
            "tone": request.tone,
            "generation_latency_ms": elapsed_ms,
            "thread_email_count": len(thread_emails),
            "category": target_email.category if target_email else None,
            "action_items": (
                [item.model_dump() for item in target_email.action_items]
                if target_email
                else []
            ),
            "recipient": request.recipient or (target_email.sender_email if target_email else None),
        }

        return self.store.create_draft(
            subject=generated["subject"],
            body=generated["body"],
            email_id=request.email_id,
            suggested_followups=generated.get("suggested_followups") or [],
            metadata=metadata,
        )
