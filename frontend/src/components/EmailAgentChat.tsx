"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  Clock,
  Copy,
  FilePlus2,
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User,
} from "lucide-react";
import type { ChatMessage, EmailItem, SuggestedDraft } from "@/types";
import { MarkdownContent } from "./MarkdownContent";

interface EmailAgentChatProps {
  selectedEmail: EmailItem | null;
  messages: ChatMessage[];
  activeConversationId: string | null;
  busy: boolean;
  onSendChat: (payload: {
    query: string;
    scope: "email" | "inbox";
    email_id?: string | null;
    conversation_id?: string | null;
    tone?: string;
  }) => Promise<void>;
  onNewConversation: () => void;
  onRateMessage: (messageId: string, rating: 1 | -1) => Promise<void>;
  onSaveSuggestedDraft: (
    draft: SuggestedDraft,
    emailId: string | null,
  ) => Promise<void>;
  onClearHistory: () => Promise<void>;
}

const QUICK_EMAIL_PROMPTS = [
  "Summarize this email",
  "What tasks do I need to do?",
  "Draft a reply based on my tone",
];

const QUICK_INBOX_PROMPTS = [
  "Show me all urgent emails",
  "What tasks do I need to do?",
  "Summarize my inbox",
];

export function EmailAgentChat({
  selectedEmail,
  messages,
  activeConversationId,
  busy,
  onSendChat,
  onNewConversation,
  onRateMessage,
  onSaveSuggestedDraft,
  onClearHistory,
}: EmailAgentChatProps) {
  const [scope, setScope] = useState<"email" | "inbox">("email");
  const [tone, setTone] = useState("polite and professional");
  const [query, setQuery] = useState("");
  const [copiedConv, setCopiedConv] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const effectiveScope: "email" | "inbox" =
    scope === "email" && selectedEmail ? "email" : "inbox";
  const quickChips =
    effectiveScope === "email" ? QUICK_EMAIL_PROMPTS : QUICK_INBOX_PROMPTS;

  const visibleMessages = activeConversationId
    ? messages.filter((m) => m.conversation_id === activeConversationId)
    : messages;

  useEffect(() => {
    if (typeof scrollEndRef.current?.scrollIntoView === "function") {
      scrollEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [visibleMessages.length, busy]);

  const submitQuery = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setQuery("");
    await onSendChat({
      query: trimmed,
      scope: effectiveScope,
      email_id: effectiveScope === "email" ? selectedEmail?.id ?? null : null,
      conversation_id: activeConversationId,
      tone,
    });
  };

  const handleCopyConvId = async () => {
    if (!activeConversationId) return;
    try {
      await navigator.clipboard.writeText(activeConversationId);
      setCopiedConv(true);
      setTimeout(() => setCopiedConv(false), 1800);
    } catch {
      // Ignore if clipboard unavailable
    }
  };

  return (
    <section className="flex h-full min-h-[600px] lg:max-h-[820px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm ring-1 ring-slate-900/[0.03]">
      {/* Copilot Header */}
      <div className="space-y-3 border-b border-slate-100 bg-gradient-to-b from-indigo-50/50 to-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-500/25">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Email Agent Copilot
              </h2>
              <p className="text-[11px] text-slate-500">
                Context-aware Q&amp;A · Logged per turn
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={onNewConversation}
              title="Start a fresh conversation ID"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <MessageSquarePlus className="h-3 w-3 text-indigo-600" />
              New
            </button>
            {messages.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onClearHistory()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Scope & Tone Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-xl bg-slate-100/90 p-1 text-xs">
            <button
              type="button"
              disabled={!selectedEmail}
              onClick={() => setScope("email")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                effectiveScope === "email"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900 disabled:opacity-40"
              }`}
            >
              Selected Email
            </button>
            <button
              type="button"
              onClick={() => setScope("inbox")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                effectiveScope === "inbox"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Entire Inbox
            </button>
          </div>

          <select
            aria-label="Reply tone"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="polite and professional">Tone: Polite &amp; Professional</option>
            <option value="concise">Tone: Concise</option>
            <option value="friendly">Tone: Friendly</option>
            <option value="executive">Tone: Executive</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-1.5 text-[11px] text-slate-500">
          <p className="min-w-0 truncate">
            Context:{" "}
            {effectiveScope === "email" && selectedEmail ? (
              <span className="font-semibold text-indigo-700">
                {selectedEmail.id} &middot; {selectedEmail.subject}
              </span>
            ) : (
              <span className="font-semibold text-slate-700">
                All loaded inbox emails
              </span>
            )}
          </p>
          {activeConversationId && (
            <button
              type="button"
              onClick={() => void handleCopyConvId()}
              title="Copy conversation ID"
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600 ring-1 ring-slate-200 hover:text-indigo-700"
            >
              <span>{activeConversationId}</span>
              {copiedConv ? (
                <Check className="h-2.5 w-2.5 text-emerald-600" />
              ) : (
                <Copy className="h-2.5 w-2.5 text-slate-400" />
              )}
            </button>
          )}
        </div>

        {/* Quick Prompt Chips */}
        <div className="flex flex-wrap gap-1.5">
          {quickChips.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={busy}
              onClick={() => void submitQuery(chip)}
              className="inline-flex items-center gap-1 rounded-full border border-indigo-200/80 bg-indigo-50/70 px-2.5 py-1 text-[11px] font-medium text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100/80 disabled:opacity-50"
            >
              <Sparkles className="h-2.5 w-2.5" />
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Transcript */}
      <div className="sleek-scroll flex-1 space-y-3.5 overflow-y-auto bg-slate-50/40 p-4">
        {visibleMessages.length === 0 ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-4 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
              <Bot className="h-5 w-5" />
            </div>
            <p className="text-xs font-semibold text-slate-700">
              Ready to assist with your inbox
            </p>
            <p className="mt-1 max-w-[260px] text-[11px] leading-relaxed text-slate-500">
              Click a quick prompt above or ask a question about the selected email or
              entire inbox.
            </p>
          </div>
        ) : (
          visibleMessages.map((msg) => {
            const isUser = msg.role === "user";
            const suggested = msg.metadata?.suggested_draft as SuggestedDraft | undefined;
            const promptsUsed = (msg.metadata?.prompts_used as string[] | undefined) ?? [];

            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200/70">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                )}
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
                    isUser
                      ? "rounded-tr-sm bg-gradient-to-br from-slate-900 to-slate-800 text-white"
                      : "rounded-tl-sm border border-slate-200/90 bg-white text-slate-800"
                  }`}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <MarkdownContent content={msg.content} />
                  )}

                  {!isUser && suggested && (
                    <div className="mt-3 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3">
                      <p className="text-[11px] font-semibold text-emerald-900">
                        Draft Ready: {suggested.subject}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[11px] text-emerald-800/80">
                        {suggested.body}
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void onSaveSuggestedDraft(suggested, msg.email_id ?? null)
                        }
                        className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <FilePlus2 className="h-3.5 w-3.5" />
                        Save as Draft (Not Sent)
                      </button>
                    </div>
                  )}

                  {!isUser && (
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {msg.latency_ms != null && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-slate-600 ring-1 ring-slate-200/80">
                            <Clock className="h-2.5 w-2.5 text-slate-400" />
                            {msg.latency_ms.toFixed(0)} ms
                          </span>
                        )}
                        {promptsUsed.map((pk) => (
                          <span
                            key={pk}
                            className="rounded-md bg-indigo-50/70 px-1.5 py-0.5 font-mono text-[10px] text-indigo-700 ring-1 ring-indigo-100"
                          >
                            {pk}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={busy}
                          aria-label="Rate response helpful"
                          onClick={() => void onRateMessage(msg.id, 1)}
                          className={`rounded-md p-1 transition ${
                            msg.quality_rating === 1
                              ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"
                              : "text-slate-400 hover:bg-slate-100 hover:text-emerald-700"
                          }`}
                        >
                          <ThumbsUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label="Rate response unhelpful"
                          onClick={() => void onRateMessage(msg.id, -1)}
                          className={`rounded-md p-1 transition ${
                            msg.quality_rating === -1
                              ? "bg-rose-100 text-rose-700 ring-1 ring-rose-200"
                              : "text-slate-400 hover:bg-slate-100 hover:text-rose-700"
                          }`}
                        >
                          <ThumbsDown className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {isUser && (
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700">
                    <User className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            </div>
            <span className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm">
              Analyzing with Prompt Brain...
            </span>
          </div>
        )}
        <div ref={scrollEndRef} />
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitQuery(query);
        }}
        className="flex items-center gap-2 border-t border-slate-100 bg-white p-3.5"
      >
        <input
          type="text"
          aria-label="Ask Email Agent"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask about this email or your entire inbox..."
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-xs text-slate-900 transition placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          aria-label="Send chat message"
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-700 hover:to-violet-700 disabled:opacity-45"
        >
          <Send className="h-3.5 w-3.5" />
          Ask
        </button>
      </form>
    </section>
  );
}
