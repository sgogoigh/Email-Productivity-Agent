"use client";

import { useEffect, useState } from "react";
import {
  Brain,
  Check,
  ListChecks,
  Plus,
  Reply,
  RotateCcw,
  Save,
  Sparkles,
  Tags,
  Trash2,
  Undo2,
  Wand2,
} from "lucide-react";
import type { PromptConfig } from "@/types";

interface PromptBrainPanelProps {
  prompts: PromptConfig[];
  busy: boolean;
  onSavePrompt: (key: string, template: string, name?: string) => Promise<void>;
  onCreatePrompt: (payload: {
    key: string;
    name: string;
    description: string;
    template: string;
  }) => Promise<void>;
  onDeletePrompt: (key: string) => Promise<void>;
  onResetPrompts: () => Promise<void>;
  onProcessInbox: () => Promise<void>;
}

function getPromptIcon(key: string) {
  if (key.includes("categor")) {
    return <Tags className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />;
  }
  if (key.includes("action")) {
    return <ListChecks className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
  }
  if (key.includes("reply") || key.includes("draft")) {
    return <Reply className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
  }
  return <Wand2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />;
}

export function PromptBrainPanel({
  prompts,
  busy,
  onSavePrompt,
  onCreatePrompt,
  onDeletePrompt,
  onResetPrompts,
  onProcessInbox,
}: PromptBrainPanelProps) {
  const [draftTemplates, setDraftTemplates] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTemplate, setNewTemplate] = useState("");

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const p of prompts) {
      next[p.key] = p.template;
    }
    setDraftTemplates(next);
  }, [prompts]);

  const handleSave = async (key: string) => {
    const template = draftTemplates[key] ?? "";
    if (template.trim().length < 5) return;
    await onSavePrompt(key, template);
    setSavedKey(key);
    setTimeout(() => setSavedKey((curr) => (curr === key ? null : curr)), 2500);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newName.trim() || newTemplate.trim().length < 5) {
      return;
    }
    await onCreatePrompt({
      key: newKey.trim().toLowerCase().replace(/\s+/g, "_"),
      name: newName.trim(),
      description: newDescription.trim(),
      template: newTemplate.trim(),
    });
    setNewKey("");
    setNewName("");
    setNewDescription("");
    setNewTemplate("");
    setShowNewForm(false);
  };

  return (
    <section className="space-y-5">
      {/* Hero Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50/90 via-white to-violet-50/70 p-5 shadow-sm dark:border-indigo-900/60 dark:from-indigo-950/50 dark:via-slate-900 dark:to-violet-950/40">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-500/25">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
              Prompt Brain (&ldquo;The Agent Brain&rdquo;)
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Edit the instruction templates below to reshape how emails are categorized,
              how action-item JSON is extracted, and how auto-replies are drafted.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowNewForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Plus className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            New Prompt
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onResetPrompts()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            Reset Defaults
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onProcessInbox()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-indigo-500/20 transition hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Re-Process Inbox with Current Prompts
          </button>
        </div>
      </div>

      {showNewForm && (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="space-y-4 rounded-2xl border border-indigo-200/80 bg-white p-5 shadow-sm dark:border-indigo-900/60 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Create Custom Prompt
            </h3>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
              Stored in Prompt Brain DB
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Prompt Key (slug, e.g. <code>tone_guide</code>)
              </label>
              <input
                type="text"
                required
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="tone_guide"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-950"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Display Name
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Executive Tone Guide"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-950"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Description
            </label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Optional summary of when this prompt applies"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-950"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Prompt Template
            </label>
            <textarea
              rows={3}
              required
              minLength={5}
              value={newTemplate}
              onChange={(e) => setNewTemplate(e.target.value)}
              placeholder="Write instructions for the LLM..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-950"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              Create Prompt
            </button>
          </div>
        </form>
      )}

      {/* Prompt Cards Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {prompts.map((prompt) => {
          const currentVal = draftTemplates[prompt.key] ?? prompt.template;
          const isDirty = currentVal !== prompt.template;
          return (
            <div
              key={prompt.key}
              className={`flex flex-col justify-between rounded-2xl border bg-white/95 p-5 shadow-sm transition dark:bg-slate-900/90 ${
                isDirty
                  ? "border-amber-300 ring-2 ring-amber-500/15 dark:border-amber-500/70"
                  : "border-slate-200/80 ring-1 ring-slate-900/[0.03] dark:border-slate-800 dark:ring-white/[0.04]"
              }`}
            >
              <div>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                      {getPromptIcon(prompt.key)}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {prompt.name}
                        </h3>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {prompt.key}
                        </span>
                        {prompt.is_default && (
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
                            Core
                          </span>
                        )}
                      </div>
                      {prompt.description && (
                        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                          {prompt.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <textarea
                  aria-label={`${prompt.name} template`}
                  rows={5}
                  value={currentVal}
                  onChange={(e) =>
                    setDraftTemplates((prev) => ({
                      ...prev,
                      [prompt.key]: e.target.value,
                    }))
                  }
                  className="sleek-scroll w-full rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 font-mono text-xs leading-relaxed text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:bg-slate-950"
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                  <span className="tabular-nums">{currentVal.length} chars</span>
                  <span>&middot;</span>
                  <span>Updated {new Date(prompt.updated_at).toLocaleDateString()}</span>
                  {isDirty && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800/70">
                      Unsaved edits
                    </span>
                  )}
                  {savedKey === prompt.key && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <Check className="h-3 w-3" />
                      Saved
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isDirty && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setDraftTemplates((prev) => ({
                          ...prev,
                          [prompt.key]: prompt.template,
                        }))
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <Undo2 className="h-3 w-3" />
                      Revert
                    </button>
                  )}
                  {!prompt.is_default && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onDeletePrompt(prompt.key)}
                      aria-label={`Delete ${prompt.name}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/70 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900/60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || !isDirty}
                    onClick={() => void handleSave(prompt.key)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-indigo-600 dark:hover:bg-indigo-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save Prompt
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
