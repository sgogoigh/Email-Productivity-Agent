"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  Database,
  FileEdit,
  Inbox,
  Loader2,
  MailCheck,
  Sparkles,
  X,
} from "lucide-react";
import { DraftsStudio } from "@/components/DraftsStudio";
import { EmailAgentChat } from "@/components/EmailAgentChat";
import { InboxViewer } from "@/components/InboxViewer";
import { PromptBrainPanel } from "@/components/PromptBrainPanel";
import { api } from "@/lib/api";
import type {
  ChatMessage,
  DraftItem,
  EmailDetail,
  EmailItem,
  HealthStatus,
  PromptConfig,
  SuggestedDraft,
} from "@/types";

type ActiveTab = "inbox" | "prompts" | "drafts";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("inbox");
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<EmailDetail | null>(null);
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const [categoryFilter, setCategoryFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const notifyStatus = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => setStatusBanner((prev) => (prev === msg ? null : prev)), 4000);
  };

  const refreshDetail = useCallback(async (emailId: string | null) => {
    if (!emailId) {
      setSelectedDetail(null);
      return;
    }
    try {
      const detail = await api.getEmailDetail(emailId);
      setSelectedDetail(detail);
    } catch {
      setSelectedDetail(null);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const [h, ems, prs, drs, msgs] = await Promise.all([
      api.getHealth(),
      api.listEmails(),
      api.listPrompts(),
      api.listDrafts(),
      api.getChatHistory(),
    ]);
    setHealth(h);
    setEmails(ems);
    setPrompts(prs);
    setDrafts(drs);
    setChatMessages(msgs);

    setSelectedEmailId((prev) => {
      if (prev && ems.some((e) => e.id === prev)) return prev;
      return ems[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await refreshAll();
      } catch (err) {
        if (active) {
          setErrorBanner(
            err instanceof Error
              ? `Backend connection error: ${err.message}`
              : "Failed to connect to FastAPI backend.",
          );
        }
      } finally {
        if (active) setInitialLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshAll]);

  useEffect(() => {
    void refreshDetail(selectedEmailId);
  }, [selectedEmailId, refreshDetail]);

  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErrorBanner(null);
    try {
      await fn();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleLoadMockInbox = () =>
    runAction(async () => {
      const res = await api.loadMockInbox();
      await refreshAll();
      if (res.emails[0]) {
        setSelectedEmailId(res.emails[0].id);
        await refreshDetail(res.emails[0].id);
      }
      notifyStatus(`Loaded ${res.loaded_count} mock emails into inbox.`);
    });

  const handleProcessInbox = () =>
    runAction(async () => {
      const res = await api.processInbox();
      await refreshAll();
      await refreshDetail(selectedEmailId);
      setActiveTab("inbox");
      if (res.error_count > 0) {
        setErrorBanner(
          `Processed ${res.processed_count}/${res.total_requested} emails (${res.error_count} failed LLM calls).`,
        );
      } else {
        notifyStatus(
          `Processed ${res.processed_count} emails using your stored Prompt Brain.`,
        );
      }
    });

  const handleUploadJson = (rawJson: string) =>
    runAction(async () => {
      const parsed = JSON.parse(rawJson) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("Uploaded JSON must be an array of email objects.");
      }
      const res = await api.uploadEmails(parsed, false);
      await refreshAll();
      notifyStatus(`Ingested ${res.loaded_count} custom emails.`);
    });

  const handleSavePrompt = (key: string, template: string, name?: string) =>
    runAction(async () => {
      await api.updatePrompt(key, { template, name });
      setPrompts(await api.listPrompts());
      notifyStatus(`Saved prompt '${key}'. Click Process Inbox to re-run pipeline.`);
    });

  const handleCreatePrompt = (payload: {
    key: string;
    name: string;
    description: string;
    template: string;
  }) =>
    runAction(async () => {
      await api.createPrompt(payload);
      setPrompts(await api.listPrompts());
      notifyStatus(`Created custom prompt '${payload.name}'.`);
    });

  const handleDeletePrompt = (key: string) =>
    runAction(async () => {
      await api.deletePrompt(key);
      setPrompts(await api.listPrompts());
      notifyStatus(`Deleted prompt '${key}'.`);
    });

  const handleResetPrompts = () =>
    runAction(async () => {
      const reset = await api.resetPrompts();
      setPrompts(reset);
      notifyStatus("Restored default Prompt Brain templates.");
    });

  const handleSendChat = (payload: {
    query: string;
    scope: "email" | "inbox";
    email_id?: string | null;
    tone?: string;
  }) =>
    runAction(async () => {
      const resp = await api.sendChat(payload);
      setChatMessages((prev) => [...prev, resp.user_message, resp.assistant_message]);
      if (resp.error) {
        setErrorBanner(`Agent encountered an LLM error: ${resp.error}`);
      }
    });

  const handleSaveSuggestedDraft = (
    draft: SuggestedDraft,
    emailId: string | null,
  ) =>
    runAction(async () => {
      const created = await api.createDraft({
        email_id: emailId,
        subject: draft.subject,
        body: draft.body,
        suggested_followups: draft.suggested_followups ?? [],
        metadata: { source: "email_agent_chat" },
      });
      setDrafts(await api.listDrafts());
      setSelectedDraftId(created.id);
      setActiveTab("drafts");
      notifyStatus("Saved reply safely as a draft (not sent).");
    });

  const handleClearChat = () =>
    runAction(async () => {
      await api.clearChatHistory();
      setChatMessages([]);
    });

  const handleGenerateReplyDraft = (emailId: string) =>
    runAction(async () => {
      const created = await api.generateDraft({
        email_id: emailId,
        tone: "polite and professional",
      });
      setDrafts(await api.listDrafts());
      setSelectedDraftId(created.id);
      setActiveTab("drafts");
      notifyStatus("Generated thread-aware auto-reply draft for review.");
    });

  const handleGenerateDraft = (payload: {
    email_id?: string | null;
    instruction?: string;
    tone?: string;
    recipient?: string;
    subject_hint?: string;
  }) =>
    runAction(async () => {
      const created = await api.generateDraft(payload);
      setDrafts(await api.listDrafts());
      setSelectedDraftId(created.id);
      notifyStatus("Generated new draft (saved in draft mode only).");
    });

  const handleCreateManualDraft = (payload: {
    subject: string;
    body: string;
    email_id?: string | null;
    suggested_followups?: string[];
  }) =>
    runAction(async () => {
      const created = await api.createDraft(payload);
      setDrafts(await api.listDrafts());
      setSelectedDraftId(created.id);
      notifyStatus("Created blank draft.");
    });

  const handleUpdateDraft = (
    draftId: string,
    payload: { subject: string; body: string; suggested_followups: string[] },
  ) =>
    runAction(async () => {
      await api.updateDraft(draftId, payload);
      setDrafts(await api.listDrafts());
      notifyStatus("Draft changes saved.");
    });

  const handleDeleteDraft = (draftId: string) =>
    runAction(async () => {
      await api.deleteDraft(draftId);
      const next = await api.listDrafts();
      setDrafts(next);
      setSelectedDraftId(next[0]?.id ?? null);
      notifyStatus("Draft deleted.");
    });

  const selectedEmail = emails.find((e) => e.id === selectedEmailId) ?? null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Navigation & Controls */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <MailCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900">
                Email Productivity Agent
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span>Prompt-Driven Inbox Intelligence</span>
                {health && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-medium text-slate-700">
                    LLM: {health.llm_mode}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleLoadMockInbox()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Database className="h-3.5 w-3.5 text-slate-500" />
              Load Mock Inbox
            </button>
            <button
              type="button"
              disabled={busy || emails.length === 0}
              onClick={() => void handleProcessInbox()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Process Inbox
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="mx-auto flex max-w-[1440px] gap-1 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setActiveTab("inbox")}
            className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === "inbox"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <Inbox className="h-3.5 w-3.5" />
            Inbox &amp; Agent ({emails.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("prompts")}
            className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === "prompts"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <Brain className="h-3.5 w-3.5" />
            Prompt Brain ({prompts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("drafts")}
            className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === "drafts"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <FileEdit className="h-3.5 w-3.5" />
            Drafts Studio ({drafts.length})
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[1440px] space-y-4 px-4 py-5 sm:px-6">
        {errorBanner && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              aria-label="Dismiss error"
              className="rounded p-1 hover:bg-rose-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {statusBanner && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{statusBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              aria-label="Dismiss notification"
              className="rounded p-1 hover:bg-emerald-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {initialLoading ? (
          <div className="flex min-h-[320px] items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
            <span>Connecting to Email Productivity Agent backend...</span>
          </div>
        ) : activeTab === "inbox" ? (
          <div className="grid gap-4 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <InboxViewer
                emails={emails}
                selectedEmailId={selectedEmailId}
                selectedDetail={selectedDetail}
                categoryFilter={categoryFilter}
                searchQuery={searchQuery}
                busy={busy}
                onSelectEmail={setSelectedEmailId}
                onCategoryFilterChange={setCategoryFilter}
                onSearchChange={setSearchQuery}
                onGenerateReplyDraft={handleGenerateReplyDraft}
                onUploadJson={handleUploadJson}
              />
            </div>
            <div className="xl:col-span-4">
              <EmailAgentChat
                selectedEmail={selectedEmail}
                messages={chatMessages}
                busy={busy}
                onSendChat={handleSendChat}
                onSaveSuggestedDraft={handleSaveSuggestedDraft}
                onClearHistory={handleClearChat}
              />
            </div>
          </div>
        ) : activeTab === "prompts" ? (
          <PromptBrainPanel
            prompts={prompts}
            busy={busy}
            onSavePrompt={handleSavePrompt}
            onCreatePrompt={handleCreatePrompt}
            onDeletePrompt={handleDeletePrompt}
            onResetPrompts={handleResetPrompts}
            onProcessInbox={handleProcessInbox}
          />
        ) : (
          <DraftsStudio
            drafts={drafts}
            emails={emails}
            selectedDraftId={selectedDraftId}
            busy={busy}
            onSelectDraft={setSelectedDraftId}
            onGenerateDraft={handleGenerateDraft}
            onCreateManualDraft={handleCreateManualDraft}
            onUpdateDraft={handleUpdateDraft}
            onDeleteDraft={handleDeleteDraft}
          />
        )}
      </main>
    </div>
  );
}
