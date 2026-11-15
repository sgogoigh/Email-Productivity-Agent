import type {
  AgentChatResponse,
  ChatMessage,
  ConversationSummary,
  DatabaseStatus,
  DraftItem,
  EmailDetail,
  EmailItem,
  HealthStatus,
  LLMExecutionLog,
  ObservabilityMetrics,
  ProcessInboxResponse,
  PromptConfig,
} from "@/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload?.detail) detail = payload.detail;
    } catch {
      // Ignore JSON parse failures on non-JSON error payloads
    }
    throw new Error(detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  getHealth: () => apiFetch<HealthStatus>("/api/health"),

  loadMockInbox: () =>
    apiFetch<{ loaded_count: number; emails: EmailItem[] }>(
      "/api/inbox/load-mock",
      { method: "POST" },
    ),

  uploadEmails: (emails: unknown[], replace = false) =>
    apiFetch<{ loaded_count: number; emails: EmailItem[] }>(
      `/api/inbox/upload?replace=${replace}`,
      { method: "POST", body: JSON.stringify(emails) },
    ),

  listEmails: (params?: { category?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.category && params.category !== "All") {
      query.set("category", params.category);
    }
    if (params?.search?.trim()) {
      query.set("search", params.search.trim());
    }
    const qs = query.toString();
    return apiFetch<EmailItem[]>(`/api/inbox/emails${qs ? `?${qs}` : ""}`);
  },

  getEmailDetail: (emailId: string) =>
    apiFetch<EmailDetail>(`/api/inbox/emails/${encodeURIComponent(emailId)}`),

  processInbox: (emailIds?: string[]) =>
    apiFetch<ProcessInboxResponse>("/api/inbox/process", {
      method: "POST",
      body: JSON.stringify(emailIds ? { email_ids: emailIds } : {}),
    }),

  listPrompts: () => apiFetch<PromptConfig[]>("/api/prompts"),

  createPrompt: (payload: {
    key: string;
    name: string;
    description: string;
    template: string;
  }) =>
    apiFetch<PromptConfig>("/api/prompts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updatePrompt: (
    key: string,
    payload: { name?: string; description?: string; template: string },
  ) =>
    apiFetch<PromptConfig>(`/api/prompts/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deletePrompt: (key: string) =>
    apiFetch<void>(`/api/prompts/${encodeURIComponent(key)}`, {
      method: "DELETE",
    }),

  resetPrompts: () =>
    apiFetch<PromptConfig[]>("/api/prompts/reset", { method: "POST" }),

  sendChat: (payload: {
    query: string;
    scope: "email" | "inbox";
    email_id?: string | null;
    conversation_id?: string | null;
    tone?: string;
  }) =>
    apiFetch<AgentChatResponse>("/api/agent/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getChatHistory: (params?: {
    scope?: string;
    email_id?: string;
    conversation_id?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.scope) query.set("scope", params.scope);
    if (params?.email_id) query.set("email_id", params.email_id);
    if (params?.conversation_id) query.set("conversation_id", params.conversation_id);
    const qs = query.toString();
    return apiFetch<ChatMessage[]>(`/api/agent/history${qs ? `?${qs}` : ""}`);
  },

  clearChatHistory: () =>
    apiFetch<void>("/api/agent/history", { method: "DELETE" }),

  listDrafts: (emailId?: string) => {
    const qs = emailId ? `?email_id=${encodeURIComponent(emailId)}` : "";
    return apiFetch<DraftItem[]>(`/api/drafts${qs}`);
  },

  generateDraft: (payload: {
    email_id?: string | null;
    instruction?: string;
    tone?: string;
    recipient?: string;
    subject_hint?: string;
  }) =>
    apiFetch<DraftItem>("/api/drafts/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  createDraft: (payload: {
    email_id?: string | null;
    subject: string;
    body: string;
    suggested_followups?: string[];
    metadata?: Record<string, unknown>;
  }) =>
    apiFetch<DraftItem>("/api/drafts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateDraft: (
    draftId: string,
    payload: {
      subject?: string;
      body?: string;
      suggested_followups?: string[];
      metadata?: Record<string, unknown>;
    },
  ) =>
    apiFetch<DraftItem>(`/api/drafts/${encodeURIComponent(draftId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteDraft: (draftId: string) =>
    apiFetch<void>(`/api/drafts/${encodeURIComponent(draftId)}`, {
      method: "DELETE",
    }),

  getDbStatus: () => apiFetch<DatabaseStatus>("/api/observability/db-status"),

  getObservabilityMetrics: () =>
    apiFetch<ObservabilityMetrics>("/api/observability/metrics"),

  listExecutionLogs: (params?: {
    operation?: string;
    status?: string;
    email_id?: string;
    conversation_id?: string;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.operation) query.set("operation", params.operation);
    if (params?.status) query.set("status", params.status);
    if (params?.email_id) query.set("email_id", params.email_id);
    if (params?.conversation_id) query.set("conversation_id", params.conversation_id);
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return apiFetch<LLMExecutionLog[]>(
      `/api/observability/logs${qs ? `?${qs}` : ""}`,
    );
  },

  listConversations: (emailId?: string) => {
    const qs = emailId ? `?email_id=${encodeURIComponent(emailId)}` : "";
    return apiFetch<ConversationSummary[]>(`/api/observability/conversations${qs}`);
  },

  submitMessageFeedback: (
    messageId: string,
    payload: { rating: 1 | -1; notes?: string },
  ) =>
    apiFetch<ChatMessage>(
      `/api/observability/messages/${encodeURIComponent(messageId)}/feedback`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
};
