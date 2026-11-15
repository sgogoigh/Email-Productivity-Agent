"use client";

import { useEffect, useState } from "react";
import { Brain, Plus, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
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
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-indigo-600 p-2 text-white">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Prompt Brain (&ldquo;The Agent Brain&rdquo;)
            </h2>
            <p className="text-sm text-slate-600">
              All categorization, action-item extraction, chat responses, and draft replies are
              guided dynamically by the stored prompts below.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowNewForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            New Prompt
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onResetPrompts()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Defaults
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onProcessInbox()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Re-Process Inbox with Current Prompts
          </button>
        </div>
      </div>

      {showNewForm && (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="text-sm font-semibold text-slate-900">Create Custom Prompt</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Prompt Key (slug, e.g. <code>tone_guide</code>)
              </label>
              <input
                type="text"
                required
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="tone_guide"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Display Name
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Executive Tone Guide"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Description
            </label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Optional summary of when this prompt applies"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Prompt Template
            </label>
            <textarea
              rows={3}
              required
              minLength={5}
              value={newTemplate}
              onChange={(e) => setNewTemplate(e.target.value)}
              placeholder="Write instructions for the LLM..."
              className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Create Prompt
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4 lg:grid-cols-1">
        {prompts.map((prompt) => {
          const currentVal = draftTemplates[prompt.key] ?? prompt.template;
          const isDirty = currentVal !== prompt.template;
          return (
            <div
              key={prompt.key}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{prompt.name}</h3>
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                      {prompt.key}
                    </span>
                    {prompt.is_default && (
                      <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-indigo-700">
                        Core
                      </span>
                    )}
                  </div>
                  {prompt.description && (
                    <p className="mt-0.5 text-xs text-slate-500">{prompt.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {savedKey === prompt.key && (
                    <span className="text-xs font-medium text-emerald-600">Saved</span>
                  )}
                  {!prompt.is_default && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onDeletePrompt(prompt.key)}
                      aria-label={`Delete ${prompt.name}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || !isDirty}
                    onClick={() => void handleSave(prompt.key)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save Prompt
                  </button>
                </div>
              </div>

              <textarea
                aria-label={`${prompt.name} template`}
                rows={4}
                value={currentVal}
                onChange={(e) =>
                  setDraftTemplates((prev) => ({ ...prev, [prompt.key]: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 bg-slate-50/50 p-3 font-mono text-xs leading-relaxed text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>Last updated: {new Date(prompt.updated_at).toLocaleString()}</span>
                {isDirty && <span className="font-medium text-amber-600">Unsaved changes</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
