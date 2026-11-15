import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    getHealth: vi.fn(),
    loadMockInbox: vi.fn(),
    uploadEmails: vi.fn(),
    listEmails: vi.fn(),
    getEmailDetail: vi.fn(),
    processInbox: vi.fn(),
    listPrompts: vi.fn(),
    createPrompt: vi.fn(),
    updatePrompt: vi.fn(),
    deletePrompt: vi.fn(),
    resetPrompts: vi.fn(),
    sendChat: vi.fn(),
    getChatHistory: vi.fn(),
    clearChatHistory: vi.fn(),
    listDrafts: vi.fn(),
    generateDraft: vi.fn(),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    deleteDraft: vi.fn(),
    getDbStatus: vi.fn(),
    getObservabilityMetrics: vi.fn(),
    listExecutionLogs: vi.fn(),
    listConversations: vi.fn(),
    submitMessageFeedback: vi.fn(),
  },
}));

const sampleEmail = {
  id: "email-001",
  thread_id: "thread-1",
  sender: "Maya Lin",
  sender_email: "maya.lin@acme-corp.io",
  recipient: "alex@acme-corp.io",
  subject: "Meeting Request: Q4 Roadmap",
  body: "Could we meet Thursday at 2 PM?",
  timestamp: "2026-11-15T09:15:00Z",
  is_read: false,
  category: "To-Do",
  urgency: "medium",
  category_reason: "Direct scheduling request",
  action_items: [{ task: "Confirm Thursday slot", deadline: "Tomorrow" }],
  processing_error: null,
  processed_at: "2026-11-15T09:20:00Z",
};

const samplePrompt = {
  key: "categorization",
  name: "Categorization Prompt",
  description: "Classifies incoming emails.",
  template: "Categorize emails into: Important, Newsletter, Spam, To-Do.",
  is_default: true,
  updated_at: "2026-11-15T09:00:00Z",
};

const sampleDraft = {
  id: "draft-1",
  email_id: "email-001",
  subject: "Re: Meeting Request: Q4 Roadmap",
  body: "Hi Maya, could you please share an agenda?",
  suggested_followups: ["Check calendar"],
  metadata: { category: "To-Do" },
  status: "draft" as const,
  created_at: "2026-11-15T09:25:00Z",
  updated_at: "2026-11-15T09:25:00Z",
};

describe("Email Productivity Agent UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getHealth).mockResolvedValue({
      status: "ok",
      service: "Email Productivity Agent API",
      version: "1.1.0",
      llm_mode: "mock",
      db_status: "connected",
      db_dialect: "sqlite",
      db_latency_ms: 0.4,
      email_count: 1,
      prompt_count: 1,
      draft_count: 1,
      conversation_count: 1,
      log_count: 2,
    });
    vi.mocked(api.listEmails).mockResolvedValue([sampleEmail]);
    vi.mocked(api.getEmailDetail).mockResolvedValue({
      ...sampleEmail,
      thread_emails: [sampleEmail],
      drafts: [sampleDraft],
    });
    vi.mocked(api.listPrompts).mockResolvedValue([samplePrompt]);
    vi.mocked(api.listDrafts).mockResolvedValue([sampleDraft]);
    vi.mocked(api.getChatHistory).mockResolvedValue([]);
    vi.mocked(api.getDbStatus).mockResolvedValue({
      status: "connected",
      dialect: "sqlite",
      wal_mode: "wal",
      db_latency_ms: 0.4,
      pool: { pool_class: "QueuePool" },
      table_counts: {
        emails: 1,
        prompts: 1,
        drafts: 1,
        conversations: 1,
        chat_messages: 2,
        llm_execution_logs: 2,
      },
    });
    vi.mocked(api.getObservabilityMetrics).mockResolvedValue({
      total_calls: 2,
      success_count: 2,
      error_count: 0,
      success_rate_pct: 100,
      avg_latency_ms: 12.5,
      p95_latency_ms: 18.0,
      total_tokens: 140,
      parse_valid_rate_pct: 100,
      total_conversations: 1,
      rated_messages: 1,
      positive_ratings: 1,
      negative_ratings: 0,
      approval_rate_pct: 100,
      by_operation: [
        {
          operation: "chat",
          count: 1,
          success_count: 1,
          error_count: 0,
          avg_latency_ms: 12.5,
          p95_latency_ms: 12.5,
          total_tokens: 90,
        },
      ],
    });
    vi.mocked(api.listConversations).mockResolvedValue([
      {
        id: "conv-abc123",
        scope: "email",
        email_id: "email-001",
        title: "Meeting Request: Q4 Roadmap",
        message_count: 2,
        avg_latency_ms: 12.5,
        positive_ratings: 1,
        negative_ratings: 0,
        created_at: "2026-11-15T09:30:00Z",
        updated_at: "2026-11-15T09:30:01Z",
      },
    ]);
    vi.mocked(api.listExecutionLogs).mockResolvedValue([]);
  });

  it("renders inbox emails, chat with conversation_id & timing, and quality rating", async () => {
    vi.mocked(api.sendChat).mockResolvedValue({
      conversation_id: "conv-abc123",
      user_message: {
        id: "m1",
        conversation_id: "conv-abc123",
        scope: "email",
        email_id: "email-001",
        role: "user",
        content: "Summarize this email",
        metadata: {},
        created_at: "2026-11-15T09:30:00Z",
      },
      assistant_message: {
        id: "m2",
        conversation_id: "conv-abc123",
        scope: "email",
        email_id: "email-001",
        role: "assistant",
        content: "Maya asked to meet Thursday at 2 PM.",
        latency_ms: 14.2,
        llm_mode: "mock",
        model_name: "prompt-aware-mock-v1",
        quality_rating: null,
        metadata: { prompts_used: ["categorization"] },
        created_at: "2026-11-15T09:30:01Z",
      },
      suggested_draft: null,
      referenced_email_ids: ["email-001"],
      prompts_used: ["categorization"],
      latency_ms: 14.2,
      error: null,
    });
    vi.mocked(api.submitMessageFeedback).mockResolvedValue({
      id: "m2",
      conversation_id: "conv-abc123",
      scope: "email",
      email_id: "email-001",
      role: "assistant",
      content: "Maya asked to meet Thursday at 2 PM.",
      latency_ms: 14.2,
      quality_rating: 1,
      metadata: { prompts_used: ["categorization"] },
      created_at: "2026-11-15T09:30:01Z",
    });

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getAllByText("Meeting Request: Q4 Roadmap").length).toBeGreaterThan(0);
      expect(screen.getByText("Confirm Thursday slot")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Summarize this email" }));
    await waitFor(() => {
      expect(screen.getByText("Maya asked to meet Thursday at 2 PM.")).toBeInTheDocument();
      expect(screen.getByText("conv-abc123")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Rate response helpful" }));
    await waitFor(() => {
      expect(api.submitMessageFeedback).toHaveBeenCalledWith("m2", { rating: 1 });
    });
  });

  it("allows editing and saving prompts in Prompt Brain", async () => {
    vi.mocked(api.updatePrompt).mockResolvedValue({
      ...samplePrompt,
      template: "Categorize emails into: VIP, Newsletter, Spam, To-Do.",
    });

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Prompt Brain/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Prompt Brain/i }));
    const textarea = screen.getByLabelText("Categorization Prompt template");
    fireEvent.change(textarea, {
      target: { value: "Categorize emails into: VIP, Newsletter, Spam, To-Do." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Prompt/i }));

    await waitFor(() => {
      expect(api.updatePrompt).toHaveBeenCalledWith("categorization", {
        template: "Categorize emails into: VIP, Newsletter, Spam, To-Do.",
        name: undefined,
      });
    });
  });

  it("displays Drafts Studio and Observability & DB dashboard", async () => {
    vi.mocked(api.updateDraft).mockRejectedValueOnce(new Error("Simulated save error"));

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Drafts Studio/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Drafts Studio/i }));
    await waitFor(() => {
      expect(screen.getByText(/Safe Storage Mode/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue("Re: Meeting Request: Q4 Roadmap")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Simulated save error");
    });

    fireEvent.click(screen.getByRole("button", { name: /Observability & DB/i }));
    await waitFor(() => {
      expect(screen.getByText("Database Connectivity")).toBeInTheDocument();
      expect(screen.getByText("conv-abc123")).toBeInTheDocument();
    });
  });
});
