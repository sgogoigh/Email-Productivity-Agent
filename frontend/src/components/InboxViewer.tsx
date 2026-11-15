"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckSquare,
  Clock,
  Copy,
  FileEdit,
  FileJson,
  Inbox,
  Mail,
  MessageSquareText,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type { EmailDetail, EmailItem } from "@/types";
import { CategoryBadge } from "./CategoryBadge";
import { MarkdownContent } from "./MarkdownContent";

interface InboxViewerProps {
  emails: EmailItem[];
  selectedEmailId: string | null;
  selectedDetail: EmailDetail | null;
  categoryFilter: string;
  searchQuery: string;
  busy: boolean;
  onSelectEmail: (id: string) => void;
  onCategoryFilterChange: (cat: string) => void;
  onSearchChange: (q: string) => void;
  onGenerateReplyDraft: (emailId: string) => Promise<void>;
  onUploadJson: (rawJson: string) => Promise<void>;
}

const AVATAR_TONES = [
  "bg-indigo-100 text-indigo-700 ring-indigo-200/70",
  "bg-emerald-100 text-emerald-700 ring-emerald-200/70",
  "bg-amber-100 text-amber-800 ring-amber-200/70",
  "bg-sky-100 text-sky-700 ring-sky-200/70",
  "bg-rose-100 text-rose-700 ring-rose-200/70",
  "bg-violet-100 text-violet-700 ring-violet-200/70",
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getAvatarTone(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

export function InboxViewer({
  emails,
  selectedEmailId,
  selectedDetail,
  categoryFilter,
  searchQuery,
  busy,
  onSelectEmail,
  onCategoryFilterChange,
  onSearchChange,
  onGenerateReplyDraft,
  onUploadJson,
}: InboxViewerProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [showRawActionJson, setShowRawActionJson] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const { categories, categoryCounts } = useMemo(() => {
    const counts: Record<string, number> = { All: emails.length };
    const dynamic = new Set<string>(["All"]);
    let unprocessedCount = 0;
    for (const email of emails) {
      if (email.category) {
        dynamic.add(email.category);
        counts[email.category] = (counts[email.category] ?? 0) + 1;
      } else {
        unprocessedCount += 1;
      }
    }
    if (unprocessedCount > 0) {
      dynamic.add("Unprocessed");
      counts.Unprocessed = unprocessedCount;
    }
    return { categories: Array.from(dynamic), categoryCounts: counts };
  }, [emails]);

  const filteredEmails = useMemo(() => {
    return emails.filter((email) => {
      if (categoryFilter !== "All") {
        if (categoryFilter === "Unprocessed" && email.category !== null) return false;
        if (
          categoryFilter !== "Unprocessed" &&
          (email.category ?? "").toLowerCase() !== categoryFilter.toLowerCase()
        ) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${email.sender} ${email.sender_email} ${email.subject} ${email.body}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [emails, categoryFilter, searchQuery]);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadText.trim()) return;
    await onUploadJson(uploadText);
    setUploadText("");
    setShowUpload(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setUploadText(text);
  };

  const handleCopyActionJson = async () => {
    if (!selectedDetail) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(selectedDetail.action_items, null, 2),
      );
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      // Clipboard API may be unavailable in non-HTTPS test environments
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {/* Email List Column */}
      <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm ring-1 ring-slate-900/[0.03] lg:col-span-5">
        <div className="space-y-3 border-b border-slate-100 bg-slate-50/50 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Inbox className="h-4 w-4" />
              </span>
              <span>Inbox</span>
              <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700">
                {filteredEmails.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowUpload((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <Upload className="h-3 w-3 text-slate-500" />
              Import JSON
            </button>
          </div>

          {showUpload && (
            <form
              onSubmit={(e) => void handleUploadSubmit(e)}
              className="space-y-2.5 rounded-xl border border-indigo-100 bg-white p-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                  <FileJson className="h-3.5 w-3.5 text-indigo-600" />
                  Paste JSON or select a .json file
                </span>
                <label className="cursor-pointer text-[11px] font-semibold text-indigo-600 hover:underline">
                  Choose file
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => void handleFileChange(e)}
                    className="hidden"
                  />
                </label>
              </div>
              <textarea
                rows={4}
                value={uploadText}
                onChange={(e) => setUploadText(e.target.value)}
                placeholder='[{"sender":"...","sender_email":"...","subject":"...","body":"...","timestamp":"2026-11-15T12:00:00Z"}]'
                className="w-full rounded-lg border border-slate-200 bg-slate-50/70 p-2 font-mono text-[11px] text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !uploadText.trim()}
                  className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  Ingest JSON
                </button>
              </div>
            </form>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              aria-label="Search inbox"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search sender, subject, or keywords..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-xs text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => {
              const active = categoryFilter === cat;
              const count = categoryCounts[cat] ?? 0;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onCategoryFilterChange(cat)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                    active
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-white text-slate-600 ring-1 ring-slate-200/90 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span>{cat}</span>
                  <span
                    className={`text-[10px] tabular-nums ${
                      active ? "text-slate-300" : "text-slate-400"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="sleek-scroll max-h-[680px] divide-y divide-slate-100 overflow-y-auto">
          {filteredEmails.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Mail className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700">
                {emails.length === 0 ? "Your inbox is empty" : "No matching emails"}
              </p>
              <p className="mt-1 max-w-[230px] text-xs text-slate-500">
                {emails.length === 0 ? (
                  <>
                    Click <strong>Load Mock Inbox</strong> above or import custom JSON emails.
                  </>
                ) : (
                  "Try clearing the search query or switching the category pill."
                )}
              </p>
            </div>
          ) : (
            filteredEmails.map((email) => {
              const selected = email.id === selectedEmailId;
              const snippet = email.body.replace(/\s+/g, " ").trim();
              return (
                <button
                  key={email.id}
                  type="button"
                  onClick={() => onSelectEmail(email.id)}
                  className={`group relative w-full px-4 py-3.5 text-left transition ${
                    selected
                      ? "bg-gradient-to-r from-indigo-50/90 via-indigo-50/40 to-white"
                      : "hover:bg-slate-50/90"
                  }`}
                >
                  {selected && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-indigo-600"
                    />
                  )}
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1 ${getAvatarTone(
                        email.sender_email || email.sender,
                      )}`}
                    >
                      {getInitials(email.sender)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {!email.is_read && (
                            <span
                              title="Unread"
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600"
                            />
                          )}
                          <span className="truncate text-xs font-semibold text-slate-900">
                            {email.sender}
                          </span>
                        </div>
                        <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                          {new Date(email.timestamp).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>

                      <p
                        className={`mt-0.5 truncate text-xs ${
                          selected
                            ? "font-semibold text-indigo-950"
                            : "font-medium text-slate-800"
                        }`}
                      >
                        {email.subject}
                      </p>

                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {snippet}
                      </p>

                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5">
                        <CategoryBadge
                          category={email.category}
                          urgency={email.urgency}
                        />
                        <div className="flex items-center gap-1.5">
                          {email.action_items.length > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200/80">
                              <CheckSquare className="h-3 w-3 text-amber-600" />
                              {email.action_items.length} task
                              {email.action_items.length > 1 ? "s" : ""}
                            </span>
                          )}
                          {email.processing_error && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-200">
                              <AlertTriangle className="h-3 w-3" />
                              LLM Error
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Selected Email Reader Column */}
      <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm ring-1 ring-slate-900/[0.03] lg:col-span-7">
        {!selectedDetail ? (
          <div className="flex h-full min-h-[460px] flex-col items-center justify-center p-10 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
              <Mail className="h-7 w-7" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">
              Select an email to inspect
            </h3>
            <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">
              Review multi-message threads, inspect extracted JSON action items, and
              generate safe auto-reply drafts powered by your Prompt Brain.
            </p>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            {/* Email Reader Header */}
            <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50/70 to-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CategoryBadge
                      category={selectedDetail.category}
                      urgency={selectedDetail.urgency}
                    />
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                      {selectedDetail.id}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold leading-snug tracking-tight text-slate-900">
                    {selectedDetail.subject}
                  </h2>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onGenerateReplyDraft(selectedDetail.id)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-indigo-500/20 transition hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50"
                >
                  <FileEdit className="h-3.5 w-3.5" />
                  Generate Reply Draft
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 ${getAvatarTone(
                      selectedDetail.sender_email || selectedDetail.sender,
                    )}`}
                  >
                    {getInitials(selectedDetail.sender)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      {selectedDetail.sender}{" "}
                      <span className="font-normal text-slate-500">
                        &lt;{selectedDetail.sender_email}&gt;
                      </span>
                    </p>
                    <p className="truncate text-[11px] text-slate-500">
                      To: <span className="text-slate-700">{selectedDetail.recipient}</span>
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-slate-400">
                  <Clock className="h-3 w-3" />
                  {new Date(selectedDetail.timestamp).toLocaleString()}
                </span>
              </div>

              {selectedDetail.category_reason && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-indigo-100/90 bg-indigo-50/50 px-3.5 py-2.5 text-xs text-slate-700">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <span className="font-semibold text-indigo-950">
                      Prompt Brain Rationale:
                    </span>
                    <MarkdownContent compact content={selectedDetail.category_reason} />
                  </div>
                </div>
              )}

              {selectedDetail.processing_error && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{selectedDetail.processing_error}</span>
                </div>
              )}
            </div>

            <div className="sleek-scroll flex-1 space-y-5 overflow-y-auto p-5">
              {/* Thread history if multi-message */}
              {selectedDetail.thread_emails.length > 1 && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/35 p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-indigo-950">
                    <MessageSquareText className="h-4 w-4 text-indigo-600" />
                    <span>
                      Conversation Thread ({selectedDetail.thread_emails.length} messages)
                    </span>
                  </div>
                  <div className="relative space-y-3 pl-4 before:absolute before:bottom-2 before:left-1.5 before:top-2 before:w-0.5 before:rounded-full before:bg-indigo-200/80">
                    {selectedDetail.thread_emails.map((msg) => {
                      const isCurrent = msg.id === selectedDetail.id;
                      return (
                        <div
                          key={msg.id}
                          className={`relative rounded-xl border p-3 text-xs transition ${
                            isCurrent
                              ? "border-indigo-300 bg-white shadow-sm"
                              : "border-slate-200/80 bg-white/75"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`absolute -left-[15px] top-4 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                              isCurrent ? "bg-indigo-600" : "bg-indigo-300"
                            }`}
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-slate-800">
                              {msg.sender}
                              {isCurrent && (
                                <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                                  Selected
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] tabular-nums text-slate-400">
                              {new Date(msg.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-slate-600">
                            {msg.body}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Primary email body */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 text-[13.5px] leading-7 text-slate-800 whitespace-pre-wrap">
                {selectedDetail.body}
              </div>

              {/* Action Items */}
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                    <CheckSquare className="h-3.5 w-3.5 text-amber-600" />
                    Extracted Action Items ({selectedDetail.action_items.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    {selectedDetail.action_items.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleCopyActionJson()}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                      >
                        {copiedJson ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {copiedJson ? "Copied" : "Copy JSON"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowRawActionJson((prev) => !prev)}
                      className="rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-600 ring-1 ring-slate-200 hover:bg-indigo-50"
                    >
                      {showRawActionJson ? "Checklist View" : "View JSON"}
                    </button>
                  </div>
                </div>

                {showRawActionJson ? (
                  <pre className="sleek-scroll overflow-x-auto rounded-xl bg-slate-900 p-3.5 text-[11px] text-emerald-300">
                    {JSON.stringify(selectedDetail.action_items, null, 2)}
                  </pre>
                ) : selectedDetail.action_items.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    {selectedDetail.processed_at
                      ? "No actionable tasks extracted for this email."
                      : "Run Process Inbox to extract action items using your Action Item Prompt."}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {selectedDetail.action_items.map((item, idx) => (
                      <li
                        key={`${item.task}-${idx}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-xs shadow-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-800">
                            {idx + 1}
                          </span>
                          <span className="font-medium text-slate-800">{item.task}</span>
                        </div>
                        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                          Deadline: {item.deadline}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
