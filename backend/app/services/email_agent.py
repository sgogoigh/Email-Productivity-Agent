"""Orchestration service for ingestion pipeline, Email Agent chat, and draft generation."""

from typing import Dict, List, Optional

import httpx

from app.models.schemas import (
    AgentChatRequest,
    AgentChatResponse,
    DraftGenerateRequest,
    DraftOut,
    EmailOut,
    ProcessInboxResponse,
)
from app.repositories.store import EmailStore
from app.services.llm_client import LLMGateway, LLMServiceError


class EmailAgentService:
    """High-level coordinator uniting Prompt Brain storage, SQLite state, and LLM calls."""

    def __init__(self, store: EmailStore, llm: LLMGateway) -> None:
        self.store = store
        self.llm = llm

    async def process_inbox(
        self, email_ids: Optional[List[str]] = None
    ) -> ProcessInboxResponse:
        """Execute ingestion pipeline: load -> categorize -> extract actions -> persist."""
        prompts = self.store.get_prompt_map()
        cat_prompt = prompts.get("categorization")
        act_prompt = prompts.get("action_item")

        cat_template = cat_prompt.template if cat_prompt else "Categorize into Important, Newsletter, Spam, To-Do."
        act_template = act_prompt.template if act_prompt else 'Extract tasks in JSON: {"task": "...", "deadline": "..."}.'

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
            try:
                category, urgency, reason = await self.llm.categorize_email(email, cat_template)
                actions = await self.llm.extract_action_items(email, act_template)
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

        return ProcessInboxResponse(
            total_requested=len(targets),
            processed_count=processed_count,
            error_count=error_count,
            prompts_used={
                "categorization": cat_template,
                "action_item": act_template,
            },
            emails=updated,
        )

    async def chat(self, request: AgentChatRequest) -> AgentChatResponse:
        """Handle single-email or inbox-wide chat turn using stored prompts."""
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

        user_msg = self.store.add_chat_message(
            scope=request.scope,
            role="user",
            content=request.query,
            email_id=request.email_id,
        )

        error_text: Optional[str] = None
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
            assistant_content = result["content"]
            referenced_ids = result.get("referenced_email_ids") or []
            prompts_used = result.get("prompts_used") or list(prompts.keys())
            suggested_draft = result.get("suggested_draft")
        except (LLMServiceError, httpx.HTTPError, ValueError) as exc:
            error_text = str(exc)
            assistant_content = (
                "I could not complete the request because the LLM provider returned an error. "
                f"Details: {exc}. Please check your LLM settings or retry."
            )
            referenced_ids = [request.email_id] if request.email_id else []
            prompts_used = list(prompts.keys())
            suggested_draft = None

        assistant_msg = self.store.add_chat_message(
            scope=request.scope,
            role="assistant",
            content=assistant_content,
            email_id=request.email_id,
            metadata={
                "referenced_email_ids": referenced_ids,
                "prompts_used": prompts_used,
                "suggested_draft": suggested_draft,
                "error": error_text,
            },
        )

        return AgentChatResponse(
            user_message=user_msg,
            assistant_message=assistant_msg,
            suggested_draft=suggested_draft,
            referenced_email_ids=referenced_ids,
            prompts_used=prompts_used,
            error=error_text,
        )

    async def generate_draft(self, request: DraftGenerateRequest) -> DraftOut:
        """Generate and store a reply or new draft safely (never sent)."""
        prompts = self.store.get_prompt_map()
        auto_prompt = (
            prompts["auto_reply"].template
            if "auto_reply" in prompts
            else "Draft a polite, concise reply."
        )

        target_email: Optional[EmailOut] = None
        thread_emails: List[EmailOut] = []
        if request.email_id:
            detail = self.store.get_email_detail(request.email_id)
            if not detail:
                raise KeyError(f"Email '{request.email_id}' not found")
            target_email = self.store.get_email(request.email_id)
            thread_emails = detail.thread_emails

        generated = await self.llm.generate_draft(
            email=target_email,
            thread_emails=thread_emails,
            auto_reply_prompt=auto_prompt,
            instruction=request.instruction,
            tone=request.tone,
            recipient=request.recipient,
            subject_hint=request.subject_hint,
        )

        metadata: Dict[str, object] = {
            "prompt_used": auto_prompt,
            "tone": request.tone,
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
