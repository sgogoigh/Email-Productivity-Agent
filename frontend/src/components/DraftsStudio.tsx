"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  FileEdit,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { DraftItem, EmailItem } from "@/types";

interface DraftsStudioProps {
  drafts: DraftItem[];
  emails: EmailItem[];
  selectedDraftId: string | null;
  busy: boolean;
  onSelectDraft: (id: string) => void;
  onGenerateDraft: (payload: {
    email_id?: string | null;
    instruction?: string;
    tone?: string;
    recipient?: string;
    subject_hint?: string;
  }) => Promise<void>;
  onCreateManualDraft: (payload: {
    subject: string;
    body: string;
    email_id?: string | null;
    suggested_followups?: string[];
  }) => Promise<void>;
  onUpdateDraft: (
    draftId: string,
    payload: {
      subject: string;
      body: string;
      suggested_followups: string[];
    },
  ) => Promise<void>;
  onDeleteDraft: (draftId: string) => Promise<void>;
}

export function DraftsStudio({
  drafts,
  emails,
  selectedDraftId,
  busy,
  onSelectDraft,
  onGenerateDraft,
  onCreateManualDraft,
  onUpdateDraft,
  onDeleteDraft,
}: DraftsStudioProps) {
  const activeDraft =
    drafts.find((d) => d.id === selectedDraftId) ?? drafts[0] ?? null;

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [followupsText, setFollowupsText] = useState("");
  const [savedFlag, setSavedFlag] = useState(false);
  const [copiedBody, setCopiedBody] = useState(false);

  const [showNewComposer, setShowNewComposer] = useState(false);
  const [newRecipient, setNewRecipient] = useState("");
  const [newSubjectHint, setNewSubjectHint] = useState("");
  const [newInstruction, setNewInstruction] = useState("");
  const [newEmailRef, setNewEmailRef] = useState<string>("");

  useEffect(() => {
    if (activeDraft) {
      setSubject(activeDraft.subject);
      setBody(activeDraft.body);
      setFollowupsText(activeDraft.suggested_followups.join("\n"));
    } else {
      setSubject("");
      setBody("");
      setFollowupsText("");
    }
  }, [activeDraft]);

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDraft) return;
    const followups = followupsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    await onUpdateDraft(activeDraft.id, {
      subject: subject.trim(),
      body,
      suggested_followups: followups,
    });
    setSavedFlag(true);
    setTimeout(() => setSavedFlag(false), 2500);
  };

  const handleCopyDraft = async () => {
    if (!activeDraft) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopiedBody(true);
      setTimeout(() => setCopiedBody(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleAiGenerateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    await onGenerateDraft({
      email_id: newEmailRef || null,
      recipient: newRecipient.trim() || undefined,
      subject_hint: newSubjectHint.trim() || undefined,
      instruction: newInstruction.trim() || undefined,
      tone: "polite and professional",
    });
    setNewRecipient("");
    setNewSubjectHint("");
    setNewInstruction("");
    setNewEmailRef("");
    setShowNewComposer(false);
  };

  const handleCreateBlank = async () => {
    await onCreateManualDraft({
      subject: newSubjectHint.trim() || "New Email Draft",
      body:
        newInstruction.trim() ||
        "Hi,\n\n[Write your draft here]\n\nBest regards,\nAlex",
      email_id: newEmailRef || null,
      suggested_followups: [],
    });
    setShowNewComposer(false);
  };

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <section className="space-y-5">
      {/* Safe Storage Hero Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/90 via-white to-teal-50/70 p-5 shadow-sm dark:border-emerald-900/60 dark:from-emerald-950/45 dark:via-slate-900 dark:to-teal-950/40">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-500/20">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
              Drafts Studio — Safe Storage Mode
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              All generated replies and composed emails strictly persist as{" "}
              <code className="rounded bg-emerald-100/80 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                status: &quot;draft&quot;
              </code>{" "}
              for human review and are never transmitted automatically.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowNewComposer((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          <Plus className="h-3.5 w-3.5" />
          New Draft
        </button>
      </div>

      {showNewComposer && (
        <form
          onSubmit={(e) => void handleAiGenerateNew(e)}
          className="space-y-4 rounded-2xl border border-indigo-200/80 bg-white p-5 shadow-sm dark:border-indigo-900/60 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Generate AI Draft or Blank Draft
            </h3>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
              Saved locally as draft
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Reply to Email (Optional)
              </label>
              <select
                value={newEmailRef}
                onChange={(e) => setNewEmailRef(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">Standalone New Email</option>
                {emails.map((em) => (
                  <option key={em.id} value={em.id}>
                    {em.sender}: {em.subject}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Recipient
              </label>
              <input
                type="text"
                value={newRecipient}
                onChange={(e) => setNewRecipient(e.target.value)}
                placeholder="maya.lin@acme-corp.io"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Subject Hint
              </label>
              <input
                type="text"
                value={newSubjectHint}
                onChange={(e) => setNewSubjectHint(e.target.value)}
                placeholder="Q4 Cloud Budget Alignment"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Instructions / Key Points
            </label>
            <textarea
              rows={2}
              value={newInstruction}
              onChange={(e) => setNewInstruction(e.target.value)}
              placeholder="e.g., Ask for an agenda and propose Thursday 2 PM..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-xs text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewComposer(false)}
              className="rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCreateBlank()}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Create Blank Draft
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate with Auto-Reply Prompt
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Saved Drafts List */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm ring-1 ring-slate-900/[0.03] dark:border-slate-800 dark:bg-slate-900/90 dark:ring-white/[0.04] lg:col-span-4">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Saved Drafts
            </h3>
            <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {drafts.length}
            </span>
          </div>
          <div className="sleek-scroll max-h-[600px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800/80">
            {drafts.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                  <FileEdit className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  No drafts saved yet
                </p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Generate a reply from any email or click <strong>New Draft</strong>.
                </p>
              </div>
            ) : (
              drafts.map((draft) => {
                const isSelected = activeDraft?.id === draft.id;
                return (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => onSelectDraft(draft.id)}
                    className={`relative w-full px-4 py-3.5 text-left transition ${
                      isSelected
                        ? "bg-gradient-to-r from-emerald-50/85 via-emerald-50/35 to-white dark:from-emerald-950/60 dark:via-emerald-950/25 dark:to-slate-900"
                        : "hover:bg-slate-50/90 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    {isSelected && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-emerald-600 dark:bg-emerald-400"
                      />
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {draft.status}
                      </span>
                      <span className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                        {new Date(draft.updated_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {draft.subject}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {draft.body}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Draft Editor */}
        <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm ring-1 ring-slate-900/[0.03] dark:border-slate-800 dark:bg-slate-900/90 dark:ring-white/[0.04] lg:col-span-8">
          {!activeDraft ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/70 dark:text-emerald-400">
                <FileEdit className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Select a draft to review and refine
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Edit subject lines, body copy, and follow-up checklists safely before copying.
              </p>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSaveChanges(e)} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold uppercase text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Status: {activeDraft.status}
                  </span>
                  {activeDraft.email_id && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      Linked Email: {activeDraft.email_id}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {savedFlag && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                      Draft saved
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleCopyDraft()}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {copiedBody ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                    )}
                    {copiedBody ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDeleteDraft(activeDraft.id)}
                    className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/70 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900/60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save Draft
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Subject
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:bg-slate-950"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Email Body
                  </label>
                  <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                    {wordCount} words
                  </span>
                </div>
                <textarea
                  rows={10}
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="sleek-scroll w-full rounded-xl border border-slate-200 bg-slate-50/40 p-3.5 text-sm leading-relaxed text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:bg-slate-950"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Suggested Follow-Ups (one per line)
                </label>
                <textarea
                  rows={3}
                  value={followupsText}
                  onChange={(e) => setFollowupsText(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-700 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-200 dark:focus:bg-slate-950"
                />
              </div>

              <details className="group rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                <summary className="cursor-pointer select-none text-xs font-semibold text-slate-700 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-300">
                  JSON Metadata (Category / Action Items / Prompt Context)
                </summary>
                <pre className="sleek-scroll mt-2.5 max-h-48 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px] text-sky-300">
                  {JSON.stringify(
                    { status: activeDraft.status, ...activeDraft.metadata },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
