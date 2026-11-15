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
      version: "1.0.0",
      llm_mode: "mock",
      email_count: 1,
      prompt_count: 1,
      draft_count: 1,
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
  });

  it("renders inbox emails, detail action items, and handles chat", async () => {
    vi.mocked(api.sendChat).mockResolvedValue({
      user_message: {
        id: "m1",
        scope: "email",
        email_id: "email-001",
        role: "user",
        content: "Summarize this email",
        metadata: {},
        created_at: "2026-11-15T09:30:00Z",
      },
      assistant_message: {
        id: "m2",
        scope: "email",
        email_id: "email-001",
        role: "assistant",
        content: "Maya asked to meet Thursday at 2 PM.",
        metadata: { prompts_used: ["categorization"] },
        created_at: "2026-11-15T09:30:01Z",
      },
      suggested_draft: null,
      referenced_email_ids: ["email-001"],
      prompts_used: ["categorization"],
      error: null,
    });

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getAllByText("Meeting Request: Q4 Roadmap").length).toBeGreaterThan(0);
      expect(screen.getByText("Confirm Thursday slot")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Summarize this email" }));
    await waitFor(() => {
      expect(screen.getByText("Maya asked to meet Thursday at 2 PM.")).toBeInTheDocument();
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

  it("displays Drafts Studio in safe draft-only mode and handles errors gracefully", async () => {
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
  });
});
