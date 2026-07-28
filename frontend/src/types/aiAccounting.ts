/** Types matching Lakodi AI Accounting BFF ↔ AI_Agent_Accounting schemas. */

export type AiAccountingActionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"
  | "failed"
  | "expired"
  | string;

export interface AiAccountingChatMessageRequest {
  text: string;
  language?: string | null;
  conversation_id?: string | null;
}

export interface AiAccountingChatUsageSummary {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
}

export interface AiAccountingChatMessageResponse {
  conversation_id: string;
  user_message_id: string;
  assistant_message_id: string;
  agent_run_id: string;
  status: string;
  final_text: string;
  usage?: AiAccountingChatUsageSummary;
  trace_id?: string;
  correlation_id?: string;
  idempotent_replay?: boolean;
  executed_tools?: string[];
  route_source?: string | null;
  detected_intent?: string | null;
  detected_capability?: string | null;
  route_confidence?: string | null;
  route_evidence?: string[];
  tool_executions?: unknown[];
  provider_skipped?: boolean;
  requested_language?: string | null;
  resolved_locale?: string | null;
  locale_source?: string | null;
}

export interface AiAccountingConversation {
  id: string;
  status: string;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface AiAccountingConversationMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  sequence: number;
  created_at: string;
}

export interface AiAccountingConversationMessagesPage {
  conversation_id: string;
  items: AiAccountingConversationMessage[];
  limit: number;
  offset: number;
}

export interface AiAccountingActionView {
  action_id: string;
  status: AiAccountingActionStatus;
  risk_level: string;
  operation_type: string;
  created_at: string;
  expires_at: string;
  safe_summary: string;
  amount_excluding_vat?: string | number | null;
  vat_amount?: string | number | null;
  amount_including_vat?: string | number | null;
  currency?: string | null;
  recipient_name?: string | null;
  recipient_email?: string | null;
  required_confirmation?: string | null;
  result_reference?: Record<string, unknown> | null;
  error_code?: string | null;
  execution_id?: string | null;
}

export interface AiAccountingRejectActionRequest {
  reason?: string | null;
}

export interface AiAccountingHealthResponse {
  status: string;
  app_name?: string;
  environment?: string;
  version?: string;
}

export interface AiAccountingApiError {
  resource: string;
  message: string;
  status: number | null;
  requiresLogin: boolean;
}

export type AiAccountingChatRole = "user" | "assistant" | "system" | string;

export interface AiAccountingChatUiMessage {
  id: string;
  role: AiAccountingChatRole;
  content: string;
  createdAt?: string;
  actionIds?: string[];
}
