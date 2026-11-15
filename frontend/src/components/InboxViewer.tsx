"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckSquare,
  Clock,
  FileEdit,
  Inbox,
  Mail,
  Search,
  Upload,
} from "lucide-react";
import type { EmailDetail, EmailItem } from "@/types";
import { CategoryBadge } from "./CategoryBadge";

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

  const categories = useMemo(() => {
    const dynamic = new Set<string>(["All"]);
    let hasUnprocessed = false;
    for (const email of emails) {
      if (email.category) {
        dynamic.add(email.category);
      } else {
        hasUnprocessed = true;
      }
    }
    if (hasUnprocessed) dynamic.add("Unprocessed");
    return Array.from(dynamic);
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

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {/* Email List Column */}
      <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-5">
        <div className="space-y-3 border-b border-slate-200 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Inbox className="h-4 w-4 text-indigo-600" />
              <span>Inbox ({filteredEmails.length})</span>
            </div>
            <button
              type="button"
              onClick={() => setShowUpload((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              <Upload className="h-3 w-3" />
              Import JSON
            </button>
          </div>

          {showUpload && (
            <form
              onSubmit={(e) => void handleUploadSubmit(e)}
              className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5"
            >
              <textarea
                rows={4}
                value={uploadText}
                onChange={(e) => setUploadText(e.target.value)}
                placeholder='Paste JSON array: [{"sender":"...","sender_email":"...","subject":"...","body":"...","timestamp":"2026-11-15T12:00:00Z"}]'
                className="w-full rounded border border-slate-300 bg-white p-2 font-mono text-[11px] focus:border-indigo-500 focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Ingest JSON
                </button>
              </div>
            </form>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              aria-label="Search inbox"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search sender, subject, or body..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => {
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onCategoryFilterChange(cat)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    active
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-h-[680px] divide-y divide-slate-100 overflow-y-auto">
          {filteredEmails.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <Mail className="mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">No emails loaded</p>
              <p className="mt-1 text-xs text-slate-500">
                Click <strong>Load Mock Inbox</strong> in the top bar or import a JSON array.
              </p>
            </div>
          ) : (
            filteredEmails.map((email) => {
              const selected = email.id === selectedEmailId;
              return (
                <button
                  key={email.id}
                  type="button"
                  onClick={() => onSelectEmail(email.id)}
                  className={`w-full px-4 py-3 text-left transition hover:bg-slate-50 ${
                    selected ? "border-l-4 border-l-indigo-600 bg-indigo-50/40" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-slate-900">
                      {email.sender}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {new Date(email.timestamp).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs font-medium text-slate-800">
                    {email.subject}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
                    <CategoryBadge category={email.category} urgency={email.urgency} />
                    {email.action_items.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        <CheckSquare className="h-3 w-3" />
                        {email.action_items.length} task
                        {email.action_items.length > 1 ? "s" : ""}
                      </span>
                    )}
                    {email.processing_error && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-600">
                        <AlertTriangle className="h-3 w-3" />
                        LLM Error
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Selected Email Reader Column */}
      <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-7">
        {!selectedDetail ? (
          <div className="flex h-full min-h-[420px] flex-col items-center justify-center p-8 text-center">
            <Mail className="mb-3 h-10 w-10 text-slate-300" />
            <h3 className="text-sm font-semibold text-slate-800">Select an email to inspect</h3>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              View thread context, extracted JSON action items, and generate safe auto-reply
              drafts driven by your Prompt Brain.
            </p>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CategoryBadge
                    category={selectedDetail.category}
                    urgency={selectedDetail.urgency}
                  />
                  <h2 className="text-base font-semibold text-slate-900">
                    {selectedDetail.subject}
                  </h2>
                  <p className="text-xs text-slate-600">
                    From <span className="font-medium text-slate-900">{selectedDetail.sender}</span>{" "}
                    &lt;{selectedDetail.sender_email}&gt; &rarr; {selectedDetail.recipient}
                  </p>
                  <p className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="h-3 w-3" />
                    {new Date(selectedDetail.timestamp).toLocaleString()}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onGenerateReplyDraft(selectedDetail.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <FileEdit className="h-3.5 w-3.5" />
                  Generate Reply Draft
                </button>
              </div>

              {selectedDetail.category_reason && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Classification reason:</span>{" "}
                  {selectedDetail.category_reason}
                </p>
              )}

              {selectedDetail.processing_error && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{selectedDetail.processing_error}</span>
                </div>
              )}
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* Thread history if multi-message */}
              {selectedDetail.thread_emails.length > 1 && (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                  <p className="mb-2 text-xs font-semibold text-indigo-900">
                    Thread Context ({selectedDetail.thread_emails.length} messages)
                  </p>
                  <div className="space-y-2">
                    {selectedDetail.thread_emails.map((msg) => (
                      <div
                        key={msg.id}
                        className={`rounded-md border p-2.5 text-xs ${
                          msg.id === selectedDetail.id
                            ? "border-indigo-300 bg-white"
                            : "border-slate-200 bg-white/70"
                        }`}
                      >
                        <div className="flex justify-between font-medium text-slate-700">
                          <span>{msg.sender}</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(msg.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-slate-600">{msg.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Primary email body */}
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {selectedDetail.body}
              </div>

              {/* Action Items */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                    <CheckSquare className="h-3.5 w-3.5 text-amber-600" />
                    Extracted Action Items ({selectedDetail.action_items.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowRawActionJson((prev) => !prev)}
                    className="text-[11px] font-medium text-indigo-600 hover:underline"
                  >
                    {showRawActionJson ? "Hide JSON" : "View JSON"}
                  </button>
                </div>

                {showRawActionJson ? (
                  <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] text-emerald-300">
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
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-slate-800">{item.task}</span>
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
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
