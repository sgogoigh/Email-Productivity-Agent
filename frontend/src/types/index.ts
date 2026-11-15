export interface ActionItem {
  task: string;
  deadline: string;
}

export interface EmailItem {
  id: string;
  thread_id: string;
  sender: string;
  sender_email: string;
  recipient: string;
  subject: string;
  body: string;
  timestamp: string;
  is_read: boolean;
  category: string | null;
  urgency: string | null;
  category_reason: string | null;
  action_items: ActionItem[];
  processing_error: string | null;
  processed_at: string | null;
}

export interface DraftItem {
  id: string;
  email_id: string | null;
  subject: string;
  body: string;
  suggested_followups: string[];
  metadata: Record<string, unknown>;
  status: "draft";
  created_at: string;
  updated_at: string;
}

export interface EmailDetail extends EmailItem {
  thread_emails: EmailItem[];
  drafts: DraftItem[];
}

export interface PromptConfig {
  key: string;
  name: string;
  description: string;
  template: string;
  is_default: boolean;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  scope: "email" | "inbox";
  email_id: string | null;
  role: "user" | "assistant";
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SuggestedDraft {
  subject: string;
  body: string;
  suggested_followups?: string[];
}

export interface AgentChatResponse {
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  suggested_draft: SuggestedDraft | null;
  referenced_email_ids: string[];
  prompts_used: string[];
  error: string | null;
}

export interface ProcessInboxResponse {
  total_requested: number;
  processed_count: number;
  error_count: number;
  prompts_used: Record<string, string>;
  emails: EmailItem[];
}

export interface HealthStatus {
  status: "ok";
  service: string;
  version: string;
  llm_mode: string;
  email_count: number;
  prompt_count: number;
  draft_count: number;
}
