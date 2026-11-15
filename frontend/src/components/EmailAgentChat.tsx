"use client";

import { useState } from "react";
import { Bot, FilePlus2, Send, Trash2, User } from "lucide-react";
import type { ChatMessage, EmailItem, SuggestedDraft } from "@/types";

interface EmailAgentChatProps {
  selectedEmail: EmailItem | null;
  messages: ChatMessage[];
  busy: boolean;
  onSendChat: (payload: {
    query: string;
    scope: "email" | "inbox";
    email_id?: string | null;
    tone?: string;
  }) => Promise<void>;
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
  busy,
  onSendChat,
  onSaveSuggestedDraft,
  onClearHistory,
}: EmailAgentChatProps) {
  const [scope, setScope] = useState<"email" | "inbox">("email");
  const [tone, setTone] = useState("polite and professional");
  const [query, setQuery] = useState("");

  const effectiveScope: "email" | "inbox" =
    scope === "email" && selectedEmail ? "email" : "inbox";
  const quickChips =
    effectiveScope === "email" ? QUICK_EMAIL_PROMPTS : QUICK_INBOX_PROMPTS;

  const submitQuery = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setQuery("");
    await onSendChat({
      query: trimmed,
      scope: effectiveScope,
      email_id: effectiveScope === "email" ? selectedEmail?.id ?? null : null,
      tone,
    });
  };

  return (
    <section className="flex h-full min-h-[540px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-3 border-b border-slate-200 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-600 p-1.5 text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Email Agent Chat</h2>
              <p className="text-[11px] text-slate-500">
                Uses your stored Prompt Brain instructions
              </p>
            </div>
          </div>

          {messages.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onClearHistory()}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-50"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>

        {/* Scope & Tone Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
            <button
              type="button"
              disabled={!selectedEmail}
              onClick={() => setScope("email")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                effectiveScope === "email"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 disabled:opacity-40"
              }`}
            >
              Selected Email
            </button>
            <button
              type="button"
              onClick={() => setScope("inbox")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                effectiveScope === "inbox"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600"
              }`}
            >
              Entire Inbox
            </button>
          </div>

          <select
            aria-label="Reply tone"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="polite and professional">Tone: Polite &amp; Professional</option>
            <option value="concise">Tone: Concise</option>
            <option value="friendly">Tone: Friendly</option>
            <option value="executive">Tone: Executive</option>
          </select>
        </div>

        <p className="truncate text-[11px] text-slate-500">
          Context:{" "}
          {effectiveScope === "email" && selectedEmail ? (
            <span className="font-medium text-indigo-700">{selectedEmail.subject}</span>
          ) : (
            <span className="font-medium text-slate-700">All loaded inbox emails</span>
          )}
        </p>

        <div className="flex flex-wrap gap-1.5">
          {quickChips.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={busy}
              onClick={() => void submitQuery(chip)}
              className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Transcript */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center text-xs text-slate-400">
            <Bot className="mb-2 h-8 w-8 text-slate-300" />
            <p>Ask the Email Agent to summarize, extract tasks, find urgent emails, or draft a reply.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === "user";
            const suggested = msg.metadata?.suggested_draft as SuggestedDraft | undefined;
            const promptsUsed = (msg.metadata?.prompts_used as string[] | undefined) ?? [];

            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    isUser
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-slate-50 text-slate-800"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {!isUser && promptsUsed.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {promptsUsed.map((pk) => (
                        <span
                          key={pk}
                          className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 ring-1 ring-slate-200"
                        >
                          prompt:{pk}
                        </span>
                      ))}
                    </div>
                  )}

                  {!isUser && suggested && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void onSaveSuggestedDraft(suggested, msg.email_id ?? null)
                      }
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <FilePlus2 className="h-3.5 w-3.5" />
                      Save as Draft (Not Sent)
                    </button>
                  )}
                </div>
                {isUser && (
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitQuery(query);
        }}
        className="flex items-center gap-2 border-t border-slate-200 p-3"
      >
        <input
          type="text"
          aria-label="Ask Email Agent"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask about this email or your entire inbox..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          aria-label="Send chat message"
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          Ask
        </button>
      </form>
    </section>
  );
}
