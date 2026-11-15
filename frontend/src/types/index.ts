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
  conversation_id: string;
  scope: "email" | "inbox";
  email_id: string | null;
  role: "user" | "assistant";
  content: string;
  latency_ms?: number | null;
  llm_mode?: string | null;
  model_name?: string | null;
  quality_rating?: number | null;
  quality_notes?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SuggestedDraft {
  subject: string;
  body: string;
  suggested_followups?: string[];
}

export interface AgentChatResponse {
  conversation_id: string;
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  suggested_draft: SuggestedDraft | null;
  referenced_email_ids: string[];
  prompts_used: string[];
  latency_ms: number;
  error: string | null;
}

export interface ProcessInboxResponse {
  total_requested: number;
  processed_count: number;
  error_count: number;
  duration_ms: number;
  prompts_used: Record<string, string>;
  emails: EmailItem[];
}

export interface HealthStatus {
  status: "ok" | "degraded";
  service: string;
  version: string;
  llm_mode: string;
  db_status: string;
  db_dialect: string;
  db_latency_ms: number;
  email_count: number;
  prompt_count: number;
  draft_count: number;
  conversation_count: number;
  log_count: number;
}

export interface ConversationSummary {
  id: string;
  scope: "email" | "inbox";
  email_id: string | null;
  title: string;
  message_count: number;
  avg_latency_ms: number | null;
  positive_ratings: number;
  negative_ratings: number;
  created_at: string;
  updated_at: string;
}

export interface LLMExecutionLog {
  id: string;
  request_id: string | null;
  operation: string;
  conversation_id: string | null;
  email_id: string | null;
  prompt_key: string | null;
  prompt_hash: string | null;
  provider: string;
  model: string;
  started_at: string;
  completed_at: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  parse_valid: boolean;
  status: string;
  error_message: string | null;
  output_preview: string | null;
}

export interface DatabaseStatus {
  status: string;
  dialect: string;
  wal_mode: string | null;
  db_latency_ms: number;
  pool: Record<string, unknown>;
  table_counts: Record<string, number>;
}

export interface OperationStats {
  operation: string;
  count: number;
  success_count: number;
  error_count: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  total_tokens: number;
}

export interface ObservabilityMetrics {
  total_calls: number;
  success_count: number;
  error_count: number;
  success_rate_pct: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  total_tokens: number;
  parse_valid_rate_pct: number;
  total_conversations: number;
  rated_messages: number;
  positive_ratings: number;
  negative_ratings: number;
  approval_rate_pct: number | null;
  by_operation: OperationStats[];
}
