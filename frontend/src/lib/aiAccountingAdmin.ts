import { adminApiUrl, apiFetchOptions } from "@/lib/api";
import type {
  AiAccountingActionView,
  AiAccountingApiError,
  AiAccountingChatMessageRequest,
  AiAccountingChatMessageResponse,
  AiAccountingConversation,
  AiAccountingConversationMessagesPage,
  AiAccountingHealthResponse,
  AiAccountingRejectActionRequest,
} from "@/types/aiAccounting";

const AI_ADMIN_BASE = "/ai";

export class AiAccountingRequestError extends Error {
  readonly apiError: AiAccountingApiError;

  constructor(apiError: AiAccountingApiError) {
    super(apiError.message);
    this.name = "AiAccountingRequestError";
    this.apiError = apiError;
  }
}

function formatFastApiErrorDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) {
    return detail.trim();
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") {
          return item.trim();
        }
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg).trim();
        }
        return "";
      })
      .filter(Boolean);
    return messages.length > 0 ? messages.join(" ") : null;
  }

  if (detail && typeof detail === "object" && "message" in detail) {
    const message = String((detail as { message: unknown }).message).trim();
    return message || null;
  }

  return null;
}

async function buildApiError(resource: string, response: Response): Promise<AiAccountingApiError> {
  let message = `AI request failed (HTTP ${response.status}).`;

  try {
    const payload = (await response.json()) as { detail?: unknown; message?: unknown };
    const formattedDetail = formatFastApiErrorDetail(payload.detail);
    if (formattedDetail) {
      message = formattedDetail;
    } else if (typeof payload.message === "string" && payload.message.trim()) {
      message = payload.message.trim();
    }
  } catch {
    // Keep status-based fallback below.
  }

  if (response.status === 401) {
    message = "Authentication required.";
  } else if (response.status === 403) {
    message = "Admin access required.";
  } else if (response.status === 404) {
    message = "Requested AI resource was not found.";
  } else if (response.status === 502 || response.status === 503 || response.status === 504) {
    // Prefer upstream/BFF detail when it is already a clear operator-facing message.
    if (!message || message.startsWith("AI request failed")) {
      message = "AI service is currently unavailable.";
    }
  }

  return {
    resource,
    message,
    status: response.status,
    requiresLogin: response.status === 401,
  };
}

function buildNetworkError(resource: string, error: unknown): AiAccountingApiError {
  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      resource,
      message: "Request was aborted.",
      status: null,
      requiresLogin: false,
    };
  }

  return {
    resource,
    message: error instanceof Error ? error.message : "Network error while calling AI BFF.",
    status: null,
    requiresLogin: false,
  };
}

function createIdempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function parseJsonBody<T>(resource: string, response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new AiAccountingRequestError({
      resource,
      message: "AI BFF returned invalid JSON.",
      status: response.status,
      requiresLogin: response.status === 401,
    });
  }
}

async function aiFetchJson<T>(
  resource: string,
  path: string,
  init?: RequestInit & { idempotencyKey?: string },
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (init?.idempotencyKey) {
    headers.set("Idempotency-Key", init.idempotencyKey);
  }

  let response: Response;
  try {
    response = await fetch(adminApiUrl(`${AI_ADMIN_BASE}${path}`), {
      ...apiFetchOptions,
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (error) {
    throw new AiAccountingRequestError(buildNetworkError(resource, error));
  }

  if (!response.ok) {
    throw new AiAccountingRequestError(await buildApiError(resource, response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return parseJsonBody<T>(resource, response);
}

export async function getAiAccountingHealth(signal?: AbortSignal): Promise<AiAccountingHealthResponse> {
  return aiFetchJson<AiAccountingHealthResponse>("ai-health", "/health", { method: "GET", signal });
}

export function isAiAccountingHealthOk(payload: AiAccountingHealthResponse | null | undefined): boolean {
  return Boolean(payload && typeof payload.status === "string" && payload.status.toLowerCase() === "ok");
}

export async function postAiAccountingChatMessage(
  body: AiAccountingChatMessageRequest,
  options?: { signal?: AbortSignal; idempotencyKey?: string },
): Promise<AiAccountingChatMessageResponse> {
  const payload: Record<string, string> = {
    text: body.text.trim(),
  };
  if (body.language != null && body.language.trim()) {
    payload.language = body.language.trim();
  }
  if (body.conversation_id != null && body.conversation_id.trim()) {
    payload.conversation_id = body.conversation_id.trim();
  }

  return aiFetchJson<AiAccountingChatMessageResponse>("ai-chat", "/chat/messages", {
    method: "POST",
    body: JSON.stringify(payload),
    signal: options?.signal,
    idempotencyKey: options?.idempotencyKey ?? createIdempotencyKey("lakodi-chat"),
  });
}

export async function getAiAccountingConversation(
  conversationId: string,
  signal?: AbortSignal,
): Promise<AiAccountingConversation> {
  return aiFetchJson<AiAccountingConversation>(
    "ai-conversation",
    `/conversations/${encodeURIComponent(conversationId)}`,
    { method: "GET", signal },
  );
}

export async function listAiAccountingConversationMessages(
  conversationId: string,
  signal?: AbortSignal,
): Promise<AiAccountingConversationMessagesPage> {
  return aiFetchJson<AiAccountingConversationMessagesPage>(
    "ai-conversation-messages",
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: "GET", signal },
  );
}

export async function getAiAccountingAction(
  actionId: string,
  signal?: AbortSignal,
): Promise<AiAccountingActionView> {
  return aiFetchJson<AiAccountingActionView>("ai-action", `/actions/${encodeURIComponent(actionId)}`, {
    method: "GET",
    signal,
  });
}

export async function approveAiAccountingAction(
  actionId: string,
  options?: { signal?: AbortSignal; idempotencyKey?: string },
): Promise<AiAccountingActionView> {
  return aiFetchJson<AiAccountingActionView>("ai-action-approve", `/actions/${encodeURIComponent(actionId)}/approve`, {
    method: "POST",
    signal: options?.signal,
    idempotencyKey: options?.idempotencyKey ?? createIdempotencyKey("lakodi-approve"),
  });
}

export async function rejectAiAccountingAction(
  actionId: string,
  body?: AiAccountingRejectActionRequest,
  options?: { signal?: AbortSignal },
): Promise<AiAccountingActionView> {
  const payload =
    body?.reason != null && body.reason.trim()
      ? { reason: body.reason.trim().slice(0, 300) }
      : {};

  return aiFetchJson<AiAccountingActionView>("ai-action-reject", `/actions/${encodeURIComponent(actionId)}/reject`, {
    method: "POST",
    body: JSON.stringify(payload),
    signal: options?.signal,
  });
}
