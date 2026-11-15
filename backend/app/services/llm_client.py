"""LLM Gateway supporting OpenAI, Gemini, OpenAI-compatible APIs, and prompt-aware mock mode."""

import json
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.config import Settings
from app.models.schemas import ActionItem, EmailOut, PromptOut


class LLMServiceError(Exception):
    """Raised when an upstream LLM call fails or returns unusable output."""


def extract_json_from_text(raw: str) -> Any:
    """Parse JSON from raw LLM text, stripping optional markdown code fences."""
    cleaned = raw.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, re.IGNORECASE)
    if fence_match:
        cleaned = fence_match.group(1).strip()
    try:
        return json.loads(cleaned, strict=False)
    except json.JSONDecodeError:
        # Attempt to locate the first JSON object or array substring.
        obj_start = cleaned.find("{")
        arr_start = cleaned.find("[")
        candidates = [idx for idx in (obj_start, arr_start) if idx != -1]
        if candidates:
            start = min(candidates)
            for end in range(len(cleaned), start, -1):
                snippet = cleaned[start:end].strip()
                try:
                    return json.loads(snippet, strict=False)
                except json.JSONDecodeError:
                    continue
        raise LLMServiceError(f"LLM returned invalid JSON: {raw[:200]}")


def _parse_categories_from_prompt(prompt_text: str) -> List[str]:
    """Extract category names listed in the user's categorization prompt."""
    match = re.search(
        r"categorize(?:\s+emails)?\s+into\s*:\s*([^\n.]+)",
        prompt_text,
        re.IGNORECASE,
    )
    if match:
        raw_items = [part.strip(" .:-•*") for part in match.group(1).split(",")]
        categories = [item for item in raw_items if item]
        if categories:
            return categories
    return ["Important", "Newsletter", "Spam", "To-Do"]


def _match_category_alias(candidates: List[str], keywords: List[str], fallback: str) -> str:
    """Pick the first category from user-defined candidates matching any keyword."""
    for cat in candidates:
        low = cat.lower()
        if any(kw in low for kw in keywords):
            return cat
    return fallback


class PromptAwareMockEngine:
    """Deterministic engine that inspects stored user prompts so prompt edits change behavior."""

    @staticmethod
    def categorize(email: EmailOut, prompt_template: str) -> Dict[str, str]:
        categories = _parse_categories_from_prompt(prompt_template)
        prompt_low = prompt_template.lower()
        text = f"{email.subject}\n{email.body}\n{email.sender}\n{email.sender_email}".lower()

        # Check explicit sender/domain/keyword override rules authored in the prompt
        # Example: "Emails from maya.lin@acme-corp.io must be categorized as VIP"
        rule_matches = re.findall(
            r"from\s+([^\s,;]+)\s+(?:as|into|to|marked|categorized\s+as)\s+([A-Za-z0-9_-]+)",
            prompt_template,
            re.IGNORECASE,
        )
        for sender_pat, target_cat in rule_matches:
            if sender_pat.lower() in email.sender_email.lower() or sender_pat.lower() in email.sender.lower():
                canonical = next((c for c in categories if c.lower() == target_cat.lower()), target_cat)
                return {
                    "category": canonical,
                    "urgency": "high",
                    "reason": f"Matched custom sender rule for '{sender_pat}' in Categorization Prompt.",
                }

        spam_cat = _match_category_alias(categories, ["spam", "junk", "phish", "promo"], categories[-1])
        news_cat = _match_category_alias(categories, ["newsletter", "digest", "fyi", "update"], categories[0])
        todo_cat = _match_category_alias(categories, ["to-do", "todo", "action", "task", "meeting"], categories[0])
        important_cat = _match_category_alias(categories, ["important", "urgent", "vip", "priority", "exec"], categories[0])
        meeting_cat = next((c for c in categories if "meeting" in c.lower()), None)

        if any(w in text for w in ["gift card", "airdrop", "bank routing", "backlink", "80% discount", "account will be terminated", "credit card"]):
            return {
                "category": spam_cat,
                "urgency": "low",
                "reason": "Detected promotional/phishing indicators.",
            }

        if any(w in text for w in ["weekly", "issue #", "digest", "unsubscribe", "newsletter", "dispatch"]):
            return {
                "category": news_cat,
                "urgency": "low",
                "reason": "Detected recurring newsletter/digest format.",
            }

        is_meeting = any(w in text for w in ["meeting", "schedule a", "sync", "invitation:", "intro call", "20-minute call", "30-minute", "45-minute"])
        if is_meeting and meeting_cat:
            return {
                "category": meeting_cat,
                "urgency": "medium",
                "reason": "Matched explicit Meeting category in user prompt.",
            }

        has_direct_request = any(
            w in text
            for w in [
                "please ",
                "could you",
                "could we",
                "would you",
                "let me know",
                "confirm by",
                "complete two tasks",
                "review pr",
                "upload all",
                "update section",
                "investigate",
                "send us",
                "action required",
                "action needed",
            ]
        )
        is_urgent = any(w in text for w in ["urgent", "hard compliance deadline", "failing", "terminated", "40% of our eu"])

        # Honor custom prompt rule: e.g., if user asks to treat meetings as Important instead of To-Do
        if "meeting" in prompt_low and "important" in prompt_low and is_meeting:
            return {
                "category": important_cat,
                "urgency": "medium",
                "reason": "Classified meeting request as Important per Categorization Prompt.",
            }

        if is_urgent and not has_direct_request:
            return {
                "category": important_cat,
                "urgency": "high",
                "reason": "High-priority operational or executive communication.",
            }

        if has_direct_request:
            # If user prompt specifies urgent/critical direct requests belong to Important
            if is_urgent and "urgent" in prompt_low and "important" in prompt_low:
                return {
                    "category": important_cat,
                    "urgency": "high",
                    "reason": "Urgent direct request prioritized as Important per prompt.",
                }
            return {
                "category": todo_cat,
                "urgency": "high" if is_urgent else "medium",
                "reason": "Contains a direct request requiring user action.",
            }

        if "project update" in text or "deployed to production" in text or "status update" in text:
            return {
                "category": important_cat if "no action" not in text else news_cat,
                "urgency": "low",
                "reason": "Informational project status update.",
            }

        return {
            "category": important_cat,
            "urgency": "medium",
            "reason": "General workplace correspondence.",
        }

    @staticmethod
    def extract_action_items(email: EmailOut, prompt_template: str) -> List[ActionItem]:
        text = f"{email.subject}\n{email.body}"
        low = text.lower()
        prompt_low = prompt_template.lower()

        if any(w in low for w in ["gift card", "airdrop", "backlink", "account will be terminated", "unsubscribe", "issue #", "weekly digest", "no action needed", "no immediate action required"]):
            return []

        items: List[ActionItem] = []

        # Extract numbered tasks like "1. Rotate ..."
        numbered = re.findall(r"^\s*\d+\.\s+(.+)$", email.body, re.MULTILINE)
        deadline_match = re.search(
            r"\bby\s+((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|tomorrow|today)[^.,\n]*|\d{1,2}:\d{2}\s*(?:AM|PM)|EOD)\b",
            email.body,
            re.IGNORECASE,
        )
        before_match = re.search(
            r"\bbefore\s+((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|tomorrow|today)[^.,\n]*)",
            email.body,
            re.IGNORECASE,
        )
        default_deadline = (
            (deadline_match.group(1) if deadline_match else None)
            or (before_match.group(1) if before_match else None)
            or "Unspecified"
        ).strip()

        if numbered:
            for line in numbered:
                items.append(ActionItem(task=line.strip().rstrip("."), deadline=default_deadline))
        else:
            # Look for actionable sentences
            sentences = re.split(r"(?<=[.!?])\s+|\n+", email.body)
            for sent in sentences:
                s_clean = sent.strip()
                s_low = s_clean.lower()
                if len(s_clean) < 12:
                    continue
                if any(k in s_low for k in ["please ", "could you", "would you", "confirm by", "investigate", "review ", "upload ", "update section", "schedule a"]):
                    sent_deadline_match = re.search(
                        r"\b(?:by|before|this|next)\s+((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|tomorrow|today)[^.?,\n]*)",
                        s_clean,
                        re.IGNORECASE,
                    )
                    dl = sent_deadline_match.group(1).strip() if sent_deadline_match else default_deadline
                    task_text = re.sub(r"^(?:Hi|Hey|Dear)\s+\w+,\s*", "", s_clean).strip()
                    items.append(ActionItem(task=task_text, deadline=dl))

        # Deduplicate preserving order
        seen = set()
        unique_items: List[ActionItem] = []
        for item in items:
            key = item.task.lower()
            if key not in seen:
                seen.add(key)
                task_val = item.task
                if "prefix" in prompt_low and "[action]" in prompt_low and not task_val.startswith("[ACTION]"):
                    task_val = f"[ACTION] {task_val}"
                deadline_val = "Omitted" if "ignore deadline" in prompt_low else item.deadline
                unique_items.append(ActionItem(task=task_val, deadline=deadline_val))

        return unique_items[:5]

    @staticmethod
    def generate_draft(
        email: Optional[EmailOut],
        thread_emails: List[EmailOut],
        auto_reply_prompt: str,
        instruction: Optional[str],
        tone: str,
        recipient: Optional[str],
        subject_hint: Optional[str],
    ) -> Dict[str, Any]:
        prompt_low = auto_reply_prompt.lower()
        instr_low = (instruction or "").lower()

        if email is None:
            subject = subject_hint or "Follow-up & Next Steps"
            target = recipient or "Team"
            body = (
                f"Hi {target},\n\n"
                f"I am reaching out regarding {subject}."
                f"{' ' + instruction.strip() if instruction else ''}\n\n"
                f"Please let me know your thoughts and availability so we can align on next steps.\n\n"
                f"Best regards,\nAlex"
            )
            return {
                "subject": subject,
                "body": body,
                "suggested_followups": [
                    "Confirm recipient email address before sending.",
                    "Attach any supporting links or documents.",
                ],
            }

        subject = email.subject if email.subject.lower().startswith("re:") else f"Re: {email.subject}"
        combined_text = f"{email.subject}\n{email.body}".lower()
        is_meeting = any(w in combined_text for w in ["meeting", "sync", "invitation", "call", "schedule"])

        greeting = f"Hi {email.sender.split()[0]},"
        thread_note = ""
        if len(thread_emails) > 1:
            thread_note = f" Thank you for the follow-up across our {len(thread_emails)}-message thread."

        if is_meeting and "agenda" in prompt_low:
            core = (
                f"Thanks for reaching out about \"{email.subject}\".{thread_note}\n\n"
                f"I would be happy to connect. Before I lock in the calendar invite, could you please share a brief agenda and the key decisions or topics you would like us to cover?"
            )
            followups = [
                "Verify calendar availability for the proposed slot.",
                "Review agenda items once shared by the sender.",
            ]
        elif email.action_items:
            task_summary = "; ".join(item.task for item in email.action_items[:2])
            core = (
                f"Thanks for the note.{thread_note}\n\n"
                f"I have reviewed the request regarding: {task_summary}. "
                f"I am currently working through the details and will follow up with an update shortly."
            )
            followups = [f"Track completion: {item.task} (Due: {item.deadline})" for item in email.action_items[:3]]
        else:
            core = (
                f"Thank you for sending over \"{email.subject}\".{thread_note}\n\n"
                f"I appreciate the update and have noted the key points. Please let me know if there is anything specific you need from my end."
            )
            followups = ["Review email thread and confirm if additional stakeholders should be looped in."]

        if instruction and instruction.strip():
            core += f"\n\nAdditionally: {instruction.strip()}"

        if "concise" in tone.lower() or "short" in prompt_low or "brief" in instr_low:
            signoff = "Best,\nAlex"
        else:
            signoff = "Best regards,\nAlex Mercer"

        return {
            "subject": subject,
            "body": f"{greeting}\n\n{core}\n\n{signoff}",
            "suggested_followups": followups,
        }

    @staticmethod
    def chat(
        query: str,
        scope: str,
        email: Optional[EmailOut],
        thread_emails: List[EmailOut],
        all_emails: List[EmailOut],
        prompts: Dict[str, PromptOut],
        tone: Optional[str],
    ) -> Dict[str, Any]:
        q_low = query.lower()
        used_keys = [k for k in ("categorization", "action_item", "auto_reply") if k in prompts]

        if scope == "email" and email is not None:
            # Summarize email
            if any(w in q_low for w in ["summarize", "summary", "tldr", "what is this"]):
                actions_text = (
                    "\n".join(f"- {a.task} (Deadline: {a.deadline})" for a in email.action_items)
                    if email.action_items
                    else "- No explicit action items extracted."
                )
                first_lines = " ".join(line.strip() for line in email.body.splitlines() if line.strip())[:280]
                reply = (
                    f"**Summary of \"{email.subject}\"** (Category: `{email.category or 'Unprocessed'}`)\n\n"
                    f"- **From:** {email.sender} ({email.sender_email})\n"
                    f"- **Thread messages:** {len(thread_emails)}\n"
                    f"- **Core message:** {first_lines}{'...' if len(email.body) > 280 else ''}\n\n"
                    f"**Action Items (from Action Item Prompt):**\n{actions_text}"
                )
                return {
                    "content": reply,
                    "referenced_email_ids": [email.id],
                    "prompts_used": used_keys,
                    "suggested_draft": None,
                }

            # Tasks / action items
            if any(w in q_low for w in ["task", "action", "todo", "to-do", "need to do", "deadline"]):
                extracted = email.action_items or PromptAwareMockEngine.extract_action_items(
                    email, prompts.get("action_item").template if "action_item" in prompts else ""
                )
                if extracted:
                    lines = "\n".join(f"{i+1}. **{a.task}** — *Deadline:* {a.deadline}" for i, a in enumerate(extracted))
                    reply = f"Here are the tasks extracted from **{email.subject}** using your stored Action Item Prompt:\n\n{lines}"
                else:
                    reply = f"No actionable tasks were found in **{email.subject}** based on your Action Item Prompt."
                return {
                    "content": reply,
                    "referenced_email_ids": [email.id],
                    "prompts_used": ["action_item"] if "action_item" in prompts else used_keys,
                    "suggested_draft": None,
                }

            # Draft reply
            if any(w in q_low for w in ["draft", "reply", "respond", "write back"]):
                auto_prompt = prompts["auto_reply"].template if "auto_reply" in prompts else ""
                draft = PromptAwareMockEngine.generate_draft(
                    email=email,
                    thread_emails=thread_emails,
                    auto_reply_prompt=auto_prompt,
                    instruction=query,
                    tone=tone or "polite and professional",
                    recipient=email.sender_email,
                    subject_hint=None,
                )
                reply = (
                    f"I prepared a draft reply guided by your **Auto-Reply Draft Prompt** (stored as draft-only, not sent):\n\n"
                    f"**Subject:** {draft['subject']}\n\n{draft['body']}"
                )
                return {
                    "content": reply,
                    "referenced_email_ids": [email.id],
                    "prompts_used": ["auto_reply"] if "auto_reply" in prompts else used_keys,
                    "suggested_draft": draft,
                }

            # General single-email question
            reply = (
                f"Based on **{email.subject}** from **{email.sender}** "
                f"(Category: `{email.category or 'Unprocessed'}`):\n\n"
                f"The email discusses: {email.body.strip()[:350]}\n\n"
                f"You can ask me to summarize it, extract tasks, or draft a reply."
            )
            return {
                "content": reply,
                "referenced_email_ids": [email.id],
                "prompts_used": used_keys,
                "suggested_draft": None,
            }

        # Inbox-wide scope
        if any(w in q_low for w in ["urgent", "important", "priority", "critical"]):
            urgent_emails = [
                e
                for e in all_emails
                if (e.urgency == "high")
                or (e.category and e.category.lower() in {"important", "to-do", "urgent-exec", "vip"})
                or ("urgent" in e.subject.lower())
            ]
            if not urgent_emails:
                return {
                    "content": "No urgent or high-priority emails were found in the current inbox.",
                    "referenced_email_ids": [],
                    "prompts_used": used_keys,
                    "suggested_draft": None,
                }
            lines = "\n".join(
                f"- **[{e.category or 'Unprocessed'}]** {e.subject} — *{e.sender}* (`{e.timestamp}`)"
                for e in urgent_emails[:8]
            )
            return {
                "content": f"Found **{len(urgent_emails)}** urgent/priority emails in your inbox:\n\n{lines}",
                "referenced_email_ids": [e.id for e in urgent_emails[:8]],
                "prompts_used": used_keys,
                "suggested_draft": None,
            }

        if any(w in q_low for w in ["task", "todo", "to-do", "action", "need to do"]):
            with_tasks = [e for e in all_emails if e.action_items]
            if not with_tasks:
                return {
                    "content": "No action items are currently extracted. Run **Process Inbox** first or select an email to inspect tasks.",
                    "referenced_email_ids": [],
                    "prompts_used": used_keys,
                    "suggested_draft": None,
                }
            lines = []
            for e in with_tasks:
                for item in e.action_items:
                    lines.append(f"- **{item.task}** *(Due: {item.deadline})* — from *{e.sender}* (`{e.subject}`)")
            return {
                "content": f"Here are your **{len(lines)}** open tasks across the inbox:\n\n" + "\n".join(lines[:15]),
                "referenced_email_ids": [e.id for e in with_tasks],
                "prompts_used": ["action_item"] if "action_item" in prompts else used_keys,
                "suggested_draft": None,
            }

        if any(w in q_low for w in ["summarize", "summary", "overview", "inbox"]):
            by_cat: Dict[str, int] = {}
            for e in all_emails:
                cat = e.category or "Unprocessed"
                by_cat[cat] = by_cat.get(cat, 0) + 1
            breakdown = ", ".join(f"**{k}**: {v}" for k, v in by_cat.items())
            return {
                "content": f"Your inbox currently holds **{len(all_emails)}** emails ({breakdown}). Ask about urgent emails, open tasks, or select an email for a deep dive.",
                "referenced_email_ids": [e.id for e in all_emails[:5]],
                "prompts_used": used_keys,
                "suggested_draft": None,
            }

        return {
            "content": (
                f"Analyzed **{len(all_emails)}** inbox emails using your stored Prompt Brain templates. "
                f"Try asking: *\"Show me all urgent emails\"*, *\"What tasks do I need to do?\"*, or select an email to summarize or draft a reply."
            ),
            "referenced_email_ids": [],
            "prompts_used": used_keys,
            "suggested_draft": None,
        }


class LLMGateway:
    """Routes LLM requests to configured external provider or prompt-aware mock engine."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def _should_use_mock(self) -> bool:
        provider = self.settings.resolved_llm_provider
        if provider == "mock":
            return True
        if not self.settings.resolved_llm_api_key:
            if self.settings.llm_allow_mock_fallback:
                return True
            raise LLMServiceError(
                f"LLM provider '{provider}' is configured without an API key."
            )
        return False

    def active_provider_and_model(self) -> Tuple[str, str]:
        """Return active provider and resolved model name for telemetry."""
        if self._should_use_mock():
            return "mock", "prompt-aware-mock-v1"
        provider = self.settings.resolved_llm_provider
        if provider == "gemini":
            return provider, (self.settings.llm_model.strip() or "gemini-2.5-flash")
        return provider, (self.settings.llm_model.strip() or "gpt-4o-mini")

    async def _call_chat_completion_with_usage(
        self, system_prompt: str, user_prompt: str, expect_json: bool = False
    ) -> Tuple[str, Dict[str, Any]]:
        provider = self.settings.resolved_llm_provider
        api_key = self.settings.resolved_llm_api_key
        timeout = self.settings.llm_timeout_seconds

        if provider in {"openai", "openai_compatible"}:
            base_url = (
                self.settings.llm_base_url.rstrip("/")
                if self.settings.llm_base_url.strip()
                else "https://api.openai.com/v1"
            )
            model = self.settings.llm_model.strip() or "gpt-4o-mini"
            payload: Dict[str, Any] = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.2,
            }
            if expect_json:
                payload["response_format"] = {"type": "json_object"}
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(f"{base_url}/chat/completions", json=payload, headers=headers)
                if resp.status_code >= 400:
                    raise LLMServiceError(f"Upstream LLM HTTP {resp.status_code}: {resp.text[:250]}")
                data = resp.json()
                usage_raw = data.get("usage") or {}
                in_tok = int(usage_raw.get("prompt_tokens") or 0)
                out_tok = int(usage_raw.get("completion_tokens") or 0)
                tot_tok = int(usage_raw.get("total_tokens") or (in_tok + out_tok))
                return data["choices"][0]["message"]["content"], {
                    "provider": provider,
                    "model": str(data.get("model") or model),
                    "input_tokens": in_tok,
                    "output_tokens": out_tok,
                    "total_tokens": tot_tok,
                }

        if provider == "gemini":
            model = self.settings.llm_model.strip() or "gemini-2.5-flash"
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                f"?key={api_key}"
            )
            payload = {
                "systemInstruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2048},
            }
            if expect_json:
                payload["generationConfig"]["responseMimeType"] = "application/json"
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code >= 400:
                    raise LLMServiceError(f"Gemini HTTP {resp.status_code}: {resp.text[:250]}")
                data = resp.json()
                usage_meta = data.get("usageMetadata") or {}
                in_tok = int(usage_meta.get("promptTokenCount") or 0)
                out_tok = int(usage_meta.get("candidatesTokenCount") or 0)
                tot_tok = int(usage_meta.get("totalTokenCount") or (in_tok + out_tok))
                return data["candidates"][0]["content"]["parts"][0]["text"], {
                    "provider": provider,
                    "model": str(data.get("modelVersion") or model),
                    "input_tokens": in_tok,
                    "output_tokens": out_tok,
                    "total_tokens": tot_tok,
                }

        raise LLMServiceError(f"Unsupported LLM provider: {provider}")

    async def _call_chat_completion(
        self, system_prompt: str, user_prompt: str, expect_json: bool = False
    ) -> str:
        text, _ = await self._call_chat_completion_with_usage(
            system_prompt, user_prompt, expect_json=expect_json
        )
        return text

    async def categorize_email(
        self, email: EmailOut, prompt_template: str
    ) -> Tuple[str, str, str, Dict[str, Any]]:
        """Run stored categorization prompt on a single email with usage metadata."""
        if self._should_use_mock():
            res = PromptAwareMockEngine.categorize(email, prompt_template)
            return res["category"], res["urgency"], res["reason"], {
                "provider": "mock",
                "model": "prompt-aware-mock-v1",
                "input_tokens": max(1, len(email.body) // 4),
                "output_tokens": 24,
                "total_tokens": max(1, len(email.body) // 4) + 24,
                "parse_valid": True,
            }

        system = (
            "You are an email categorization assistant. Strictly follow the user's "
            "Categorization Prompt and return valid JSON with keys: category, urgency, reason."
        )
        user = (
            f"USER CATEGORIZATION PROMPT:\n{prompt_template}\n\n"
            f"EMAIL:\nFrom: {email.sender} <{email.sender_email}>\n"
            f"Subject: {email.subject}\nTimestamp: {email.timestamp}\nBody:\n{email.body}"
        )
        raw, usage = await self._call_chat_completion_with_usage(system, user, expect_json=True)
        parsed = extract_json_from_text(raw)
        usage["parse_valid"] = True
        return (
            str(parsed.get("category") or "Important"),
            str(parsed.get("urgency") or "medium"),
            str(parsed.get("reason") or "Classified by LLM"),
            usage,
        )

    async def extract_action_items(
        self, email: EmailOut, prompt_template: str
    ) -> Tuple[List[ActionItem], Dict[str, Any]]:
        """Run stored action-item extraction prompt on a single email with usage metadata."""
        if self._should_use_mock():
            items = PromptAwareMockEngine.extract_action_items(email, prompt_template)
            return items, {
                "provider": "mock",
                "model": "prompt-aware-mock-v1",
                "input_tokens": max(1, len(email.body) // 4),
                "output_tokens": 16 + len(items) * 12,
                "total_tokens": max(1, len(email.body) // 4) + 16 + len(items) * 12,
                "parse_valid": True,
            }

        system = (
            "You are an action-item extraction assistant. Strictly follow the user's "
            "Action Item Prompt and respond in JSON with an array of {task, deadline} objects "
            "(or {tasks: [...]})."
        )
        user = (
            f"USER ACTION ITEM PROMPT:\n{prompt_template}\n\n"
            f"EMAIL:\nFrom: {email.sender} <{email.sender_email}>\n"
            f"Subject: {email.subject}\nBody:\n{email.body}"
        )
        raw, usage = await self._call_chat_completion_with_usage(system, user, expect_json=True)
        parsed = extract_json_from_text(raw)
        usage["parse_valid"] = True
        if isinstance(parsed, dict):
            if "tasks" in parsed and isinstance(parsed["tasks"], list):
                parsed = parsed["tasks"]
            elif "task" in parsed:
                parsed = [parsed]
            else:
                parsed = []
        if not isinstance(parsed, list):
            return [], usage
        items: List[ActionItem] = []
        for entry in parsed:
            if isinstance(entry, dict) and entry.get("task"):
                items.append(
                    ActionItem(
                        task=str(entry["task"]),
                        deadline=str(entry.get("deadline") or "Unspecified"),
                    )
                )
        return items, usage

    async def generate_draft(
        self,
        email: Optional[EmailOut],
        thread_emails: List[EmailOut],
        auto_reply_prompt: str,
        instruction: Optional[str] = None,
        tone: str = "polite and professional",
        recipient: Optional[str] = None,
        subject_hint: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate a safe draft (never sent) using the stored Auto-Reply prompt and thread."""
        if self._should_use_mock():
            res = PromptAwareMockEngine.generate_draft(
                email=email,
                thread_emails=thread_emails,
                auto_reply_prompt=auto_reply_prompt,
                instruction=instruction,
                tone=tone,
                recipient=recipient,
                subject_hint=subject_hint,
            )
            res["_usage"] = {
                "provider": "mock",
                "model": "prompt-aware-mock-v1",
                "input_tokens": max(1, len(auto_reply_prompt) // 4),
                "output_tokens": max(1, len(res["body"]) // 4),
                "total_tokens": max(1, len(auto_reply_prompt) // 4) + max(1, len(res["body"]) // 4),
                "parse_valid": True,
            }
            return res

        thread_text = "\n\n---\n\n".join(
            f"From: {e.sender} <{e.sender_email}> | {e.timestamp}\nSubject: {e.subject}\n{e.body}"
            for e in thread_emails
        )
        system = (
            "You are an Email Draft Generation Agent. Strictly follow the user's Auto-Reply Draft "
            "Prompt. Return JSON with keys: subject (string), body (string), suggested_followups (array of strings)."
        )
        user = (
            f"USER AUTO-REPLY PROMPT:\n{auto_reply_prompt}\n\n"
            f"DESIRED TONE: {tone}\n"
            f"EXTRA INSTRUCTION: {instruction or 'None'}\n"
            f"RECIPIENT HINT: {recipient or (email.sender_email if email else 'Unspecified')}\n"
            f"SUBJECT HINT: {subject_hint or (email.subject if email else 'None')}\n\n"
            f"EMAIL THREAD CONTEXT:\n{thread_text or 'New outbound email (no prior thread).'}"
        )
        raw, usage = await self._call_chat_completion_with_usage(system, user, expect_json=True)
        parsed = extract_json_from_text(raw)
        usage["parse_valid"] = True
        return {
            "subject": str(parsed.get("subject") or subject_hint or "Re: Follow-up"),
            "body": str(parsed.get("body") or ""),
            "suggested_followups": [str(x) for x in (parsed.get("suggested_followups") or [])],
            "_usage": usage,
        }

    async def chat_with_agent(
        self,
        query: str,
        scope: str,
        email: Optional[EmailOut],
        thread_emails: List[EmailOut],
        all_emails: List[EmailOut],
        prompts: Dict[str, PromptOut],
        tone: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Execute a chat turn combining user query, email/inbox context, and stored prompts."""
        if self._should_use_mock():
            res = PromptAwareMockEngine.chat(
                query=query,
                scope=scope,
                email=email,
                thread_emails=thread_emails,
                all_emails=all_emails,
                prompts=prompts,
                tone=tone,
            )
            res["_usage"] = {
                "provider": "mock",
                "model": "prompt-aware-mock-v1",
                "input_tokens": max(1, len(query) // 4),
                "output_tokens": max(1, len(res["content"]) // 4),
                "total_tokens": max(1, len(query) // 4) + max(1, len(res["content"]) // 4),
                "parse_valid": True,
            }
            return res

        prompt_bundle = "\n\n".join(
            f"[{p.key}] {p.name}:\n{p.template}" for p in prompts.values()
        )
        if scope == "email" and email is not None:
            context_block = "\n\n---\n\n".join(
                f"ID: {e.id}\nFrom: {e.sender} <{e.sender_email}>\nSubject: {e.subject}\nCategory: {e.category}\nBody:\n{e.body}"
                for e in (thread_emails or [email])
            )
        else:
            context_block = "\n".join(
                f"- ID={e.id} | Category={e.category or 'Unprocessed'} | Urgency={e.urgency or 'unknown'} | From={e.sender} | Subject={e.subject} | Tasks={len(e.action_items)}"
                for e in all_emails
            )

        system = (
            "You are an intelligent Email Productivity Agent. Always respect the user's stored "
            "Prompt Brain instructions. Return valid JSON with keys: content (markdown string), "
            "referenced_email_ids (array of strings), prompts_used (array of prompt keys), "
            "suggested_draft (null unless user explicitly asks to draft/write a reply, in which case "
            "an object with subject, body, suggested_followups)."
        )
        user = (
            f"STORED PROMPTS:\n{prompt_bundle}\n\n"
            f"SCOPE: {scope}\nTONE: {tone or 'default'}\n"
            f"CONTEXT:\n{context_block}\n\n"
            f"USER QUERY:\n{query}"
        )
        raw, usage = await self._call_chat_completion_with_usage(system, user, expect_json=True)
        parse_valid = True
        try:
            parsed = extract_json_from_text(raw)
        except LLMServiceError:
            parse_valid = False
            parsed = {
                "content": raw.strip(),
                "referenced_email_ids": [email.id] if email else [],
                "prompts_used": list(prompts.keys()),
                "suggested_draft": None,
            }

        usage["parse_valid"] = parse_valid
        raw_draft = parsed.get("suggested_draft")
        normalized_draft = (
            raw_draft
            if isinstance(raw_draft, dict) and raw_draft.get("subject") and raw_draft.get("body")
            else None
        )
        return {
            "content": str(parsed.get("content") or ""),
            "referenced_email_ids": [str(x) for x in (parsed.get("referenced_email_ids") or [])],
            "prompts_used": [str(x) for x in (parsed.get("prompts_used") or list(prompts.keys()))],
            "suggested_draft": normalized_draft,
            "_usage": usage,
        }
