"use client";

import { useEffect, useState } from "react";
import { FileEdit, Plus, Save, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
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
      body: newInstruction.trim() || "Hi,\n\n[Write your draft here]\n\nBest regards,\nAlex",
      email_id: newEmailRef || null,
      suggested_followups: [],
    });
    setShowNewComposer(false);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-600 p-2 text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Drafts Studio — Safe Storage Mode
            </h2>
            <p className="text-xs text-slate-600">
              All generated replies and new emails default strictly to{" "}
              <code className="font-semibold text-emerald-800">status: &quot;draft&quot;</code>{" "}
              for human review and are never sent automatically.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowNewComposer((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          <Plus className="h-3.5 w-3.5" />
          New Draft
        </button>
      </div>

      {showNewComposer && (
        <form
          onSubmit={(e) => void handleAiGenerateNew(e)}
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="text-sm font-semibold text-slate-900">
            Generate AI Draft or Blank Draft
          </h3>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Reply to Email (Optional)
              </label>
              <select
                value={newEmailRef}
                onChange={(e) => setNewEmailRef(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs focus:border-indigo-500 focus:outline-none"
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
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Recipient
              </label>
              <input
                type="text"
                value={newRecipient}
                onChange={(e) => setNewRecipient(e.target.value)}
                placeholder="maya.lin@acme-corp.io"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Subject Hint
              </label>
              <input
                type="text"
                value={newSubjectHint}
                onChange={(e) => setNewSubjectHint(e.target.value)}
                placeholder="Q4 Cloud Budget Alignment"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Instructions / Key Points
            </label>
            <textarea
              rows={2}
              value={newInstruction}
              onChange={(e) => setNewInstruction(e.target.value)}
              placeholder="e.g., Ask for an agenda and propose Thursday 2 PM..."
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewComposer(false)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCreateBlank()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Create Blank Draft
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate with Auto-Reply Prompt
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Saved Drafts List */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-4">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Saved Drafts ({drafts.length})
            </h3>
          </div>
          <div className="max-h-[540px] divide-y divide-slate-100 overflow-y-auto">
            {drafts.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No drafts saved yet. Generate a reply from any email or click{" "}
                <strong>New Draft</strong>.
              </div>
            ) : (
              drafts.map((draft) => {
                const isSelected = activeDraft?.id === draft.id;
                return (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => onSelectDraft(draft.id)}
                    className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${
                      isSelected ? "border-l-4 border-l-emerald-600 bg-emerald-50/40" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                        {draft.status}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(draft.updated_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-900">
                      {draft.subject}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">{draft.body}</p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Draft Editor */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-8">
          {!activeDraft ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center text-center text-xs text-slate-400">
              <FileEdit className="mb-2 h-8 w-8 text-slate-300" />
              <p>Select a draft to review, edit, and save.</p>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSaveChanges(e)} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold uppercase text-emerald-800">
                    Status: {activeDraft.status}
                  </span>
                  {activeDraft.email_id && (
                    <span className="font-mono text-[11px] text-slate-500">
                      Linked Email: {activeDraft.email_id}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {savedFlag && (
                    <span className="text-xs font-medium text-emerald-600">Draft saved</span>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDeleteDraft(activeDraft.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save Draft
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Subject
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Email Body
                </label>
                <textarea
                  rows={10}
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-3 text-sm leading-relaxed text-slate-800 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Suggested Follow-Ups (one per line)
                </label>
                <textarea
                  rows={3}
                  value={followupsText}
                  onChange={(e) => setFollowupsText(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-xs text-slate-700 focus:border-indigo-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold text-slate-700">
                  JSON Metadata (Category / Action Items / Prompt Context)
                </p>
                <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-sky-300">
                  {JSON.stringify(
                    { status: activeDraft.status, ...activeDraft.metadata },
                    null,
                    2,
                  )}
                </pre>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
