import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountingNewAiChatPanel } from "@/components/admin/accounting-new/AccountingNewAiChatPanel";
import { LanguageProvider } from "@/contexts/LanguageContext";

const ACTION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CONVERSATION_ID = "cccccccc-dddd-4eee-8fff-000000000001";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderChat() {
  return render(
    <LanguageProvider>
      <AccountingNewAiChatPanel />
    </LanguageProvider>,
  );
}

describe("AccountingNewAiChatPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("shows the initial empty chat state when AI is available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/admin/ai/health")) {
          return jsonResponse({ status: "ok", app_name: "ai", environment: "test", version: "0" });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    renderChat();

    expect(await screen.findByTestId("ai-chat-panel")).toBeInTheDocument();
    expect(screen.getByTestId("ai-chat-empty")).toBeInTheDocument();
  });

  it("reaches available or unavailable after a Strict Mode remount", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/admin/ai/health")) {
        if (init?.signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
          if (init?.signal?.aborted) {
            onAbort();
            return;
          }
          init?.signal?.addEventListener("abort", onAbort, { once: true });
          window.setTimeout(() => {
            init?.signal?.removeEventListener("abort", onAbort);
            resolve();
          }, 20);
        });
        return jsonResponse({ status: "ok", app_name: "ai", environment: "test", version: "0" });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = renderChat();
    // Simulate React Strict Mode: first effect is cleaned up before the second mount.
    unmount();
    renderChat();

    expect(await screen.findByTestId("ai-chat-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-chat-checking")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([request]) => String(request).includes("/ai/health")).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("sends a message, renders the AI response, and continues the conversation", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/admin/ai/health")) {
        return jsonResponse({ status: "ok", app_name: "ai", environment: "test", version: "0" });
      }
      if (url.endsWith("/api/admin/ai/chat/messages") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { text: string; conversation_id?: string };
        return jsonResponse({
          conversation_id: CONVERSATION_ID,
          user_message_id: "user-1",
          assistant_message_id: "assistant-1",
          agent_run_id: "run-1",
          status: "completed",
          final_text: body.conversation_id
            ? `Continued reply for ${body.text}`
            : `Hello about ${body.text}`,
          usage: {},
          route_evidence: [],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderChat();

    await screen.findByTestId("ai-chat-panel");
    await user.type(screen.getByTestId("ai-chat-input"), "Najdi faktury");
    await user.click(screen.getByTestId("ai-chat-send"));

    expect(await screen.findByText("Najdi faktury")).toBeInTheDocument();
    expect(await screen.findByText("Hello about Najdi faktury")).toBeInTheDocument();
    expect(screen.getByTestId("ai-chat-conversation-id")).toHaveTextContent(CONVERSATION_ID);

    await user.clear(screen.getByTestId("ai-chat-input"));
    await user.type(screen.getByTestId("ai-chat-input"), "A dalsi");
    await user.click(screen.getByTestId("ai-chat-send"));

    expect(await screen.findByText("Continued reply for A dalsi")).toBeInTheDocument();

    const chatCalls = fetchMock.mock.calls.filter(([request]) =>
      String(request).endsWith("/api/admin/ai/chat/messages"),
    );
    expect(chatCalls).toHaveLength(2);
    const secondBody = JSON.parse(String(chatCalls[1][1]?.body)) as { conversation_id?: string };
    expect(secondBody.conversation_id).toBe(CONVERSATION_ID);
  });

  it("disables duplicate submission while a request is pending", async () => {
    let resolveChat: ((value: Response) => void) | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/admin/ai/health")) {
        return jsonResponse({ status: "ok", app_name: "ai", environment: "test", version: "0" });
      }
      if (url.endsWith("/api/admin/ai/chat/messages") && init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          resolveChat = resolve;
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderChat();
    await screen.findByTestId("ai-chat-panel");

    fireEvent.change(screen.getByTestId("ai-chat-input"), { target: { value: "Pend" } });
    fireEvent.click(screen.getByTestId("ai-chat-send"));

    expect(await screen.findByTestId("ai-chat-pending")).toBeInTheDocument();
    expect(screen.getByTestId("ai-chat-send")).toBeDisabled();
    expect(screen.getByTestId("ai-chat-input")).toBeDisabled();

    fireEvent.click(screen.getByTestId("ai-chat-send"));
    expect(fetchMock.mock.calls.filter(([request]) => String(request).includes("/chat/messages"))).toHaveLength(1);

    resolveChat?.(
      jsonResponse({
        conversation_id: CONVERSATION_ID,
        user_message_id: "user-1",
        assistant_message_id: "assistant-1",
        agent_run_id: "run-1",
        status: "completed",
        final_text: "done",
        usage: {},
      }),
    );

    await waitFor(() => expect(screen.queryByTestId("ai-chat-pending")).not.toBeInTheDocument());
  });

  it("shows backend validation errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/admin/ai/health")) {
          return jsonResponse({ status: "ok", app_name: "ai", environment: "test", version: "0" });
        }
        if (url.endsWith("/api/admin/ai/chat/messages") && init?.method === "POST") {
          return jsonResponse({ detail: "text field required" }, 422);
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const user = userEvent.setup();
    renderChat();
    await screen.findByTestId("ai-chat-panel");
    await user.type(screen.getByTestId("ai-chat-input"), "x");
    await user.click(screen.getByTestId("ai-chat-send"));

    expect(await screen.findByText("text field required")).toBeInTheDocument();
  });

  it("shows AI unavailable state without repeated health polling", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/admin/ai/health")) {
        return jsonResponse({ detail: "AI agent is not configured." }, 503);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderChat();
    expect(await screen.findByTestId("ai-chat-unavailable")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads an existing conversation from storage", async () => {
    window.sessionStorage.setItem("lakodi.admin.aiAccounting.conversationId", CONVERSATION_ID);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/admin/ai/health")) {
          return jsonResponse({ status: "ok", app_name: "ai", environment: "test", version: "0" });
        }
        if (url.endsWith(`/api/admin/ai/conversations/${CONVERSATION_ID}`)) {
          return jsonResponse({
            id: CONVERSATION_ID,
            status: "active",
            language: "cs",
            created_at: "2026-07-24T10:00:00Z",
            updated_at: "2026-07-24T10:01:00Z",
          });
        }
        if (url.endsWith(`/api/admin/ai/conversations/${CONVERSATION_ID}/messages`)) {
          return jsonResponse({
            conversation_id: CONVERSATION_ID,
            items: [
              {
                id: "m1",
                conversation_id: CONVERSATION_ID,
                role: "user",
                content: "Prior message",
                sequence: 1,
                created_at: "2026-07-24T10:00:00Z",
              },
              {
                id: "m2",
                conversation_id: CONVERSATION_ID,
                role: "assistant",
                content: "Prior answer",
                sequence: 2,
                created_at: "2026-07-24T10:00:01Z",
              },
            ],
            limit: 50,
            offset: 0,
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    renderChat();
    expect(await screen.findByText("Prior message")).toBeInTheDocument();
    expect(screen.getByText("Prior answer")).toBeInTheDocument();
  });

  it("renders a pending action and approves it after confirmation", async () => {
    let actionStatus = "pending";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/admin/ai/health")) {
        return jsonResponse({ status: "ok", app_name: "ai", environment: "test", version: "0" });
      }
      if (url.endsWith("/api/admin/ai/chat/messages") && init?.method === "POST") {
        return jsonResponse({
          conversation_id: CONVERSATION_ID,
          user_message_id: "user-1",
          assistant_message_id: "assistant-1",
          agent_run_id: "run-1",
          status: "completed",
          final_text: `Navrhuji draft. Approve through POST /api/v1/actions/${ACTION_ID}/approve.`,
          usage: {},
          route_evidence: [`action_id:${ACTION_ID}`],
        });
      }
      if (url.endsWith(`/api/admin/ai/actions/${ACTION_ID}`) && (!init?.method || init.method === "GET")) {
        return jsonResponse({
          action_id: ACTION_ID,
          status: actionStatus,
          risk_level: "medium",
          operation_type: "create_invoice_draft",
          created_at: "2026-07-24T10:00:00Z",
          expires_at: "2026-07-24T12:00:00Z",
          safe_summary: "Vytvořit koncept faktury ALPHA",
          required_confirmation: "Approve through POST",
        });
      }
      if (url.endsWith(`/api/admin/ai/actions/${ACTION_ID}/approve`) && init?.method === "POST") {
        expect(init.body == null || init.body === "").toBe(true);
        const headers = new Headers(init.headers);
        expect(headers.get("Idempotency-Key")).toBeTruthy();
        actionStatus = "approved";
        return jsonResponse({
          action_id: ACTION_ID,
          status: "approved",
          risk_level: "medium",
          operation_type: "create_invoice_draft",
          created_at: "2026-07-24T10:00:00Z",
          expires_at: "2026-07-24T12:00:00Z",
          safe_summary: "Vytvořit koncept faktury ALPHA",
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderChat();
    await screen.findByTestId("ai-chat-panel");
    await user.type(screen.getByTestId("ai-chat-input"), "Vytvor draft");
    await user.click(screen.getByTestId("ai-chat-send"));

    const card = await screen.findByTestId("ai-action-card");
    expect(within(card).getByTestId("ai-action-summary")).toHaveTextContent("Vytvořit koncept faktury ALPHA");
    expect(within(card).getByTestId("ai-action-status")).toHaveTextContent("pending");

    await user.click(within(card).getByTestId("ai-action-approve"));
    expect(await screen.findByText("Schválit AI akci?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ano, schválit" }));

    await waitFor(() =>
      expect(within(screen.getByTestId("ai-action-card")).getByTestId("ai-action-status")).toHaveTextContent(
        "approved",
      ),
    );
  });

  it("rejects a pending action", async () => {
    let actionStatus = "pending";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/admin/ai/health")) {
          return jsonResponse({ status: "ok", app_name: "ai", environment: "test", version: "0" });
        }
        if (url.endsWith("/api/admin/ai/chat/messages") && init?.method === "POST") {
          return jsonResponse({
            conversation_id: CONVERSATION_ID,
            user_message_id: "user-1",
            assistant_message_id: "assistant-1",
            agent_run_id: "run-1",
            status: "completed",
            final_text: `Approve through POST /api/v1/actions/${ACTION_ID}/approve.`,
            usage: {},
            route_evidence: [`action_id:${ACTION_ID}`],
          });
        }
        if (url.endsWith(`/api/admin/ai/actions/${ACTION_ID}`) && (!init?.method || init.method === "GET")) {
          return jsonResponse({
            action_id: ACTION_ID,
            status: actionStatus,
            risk_level: "medium",
            operation_type: "create_invoice_draft",
            created_at: "2026-07-24T10:00:00Z",
            expires_at: "2026-07-24T12:00:00Z",
            safe_summary: "Draft summary",
          });
        }
        if (url.endsWith(`/api/admin/ai/actions/${ACTION_ID}/reject`) && init?.method === "POST") {
          actionStatus = "rejected";
          return jsonResponse({
            action_id: ACTION_ID,
            status: "rejected",
            risk_level: "medium",
            operation_type: "create_invoice_draft",
            created_at: "2026-07-24T10:00:00Z",
            expires_at: "2026-07-24T12:00:00Z",
            safe_summary: "Draft summary",
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const user = userEvent.setup();
    renderChat();
    await screen.findByTestId("ai-chat-panel");
    await user.type(screen.getByTestId("ai-chat-input"), "Draft");
    await user.click(screen.getByTestId("ai-chat-send"));

    const card = await screen.findByTestId("ai-action-card");
    await user.click(within(card).getByTestId("ai-action-reject"));
    await waitFor(() =>
      expect(within(screen.getByTestId("ai-action-card")).getByTestId("ai-action-status")).toHaveTextContent(
        "rejected",
      ),
    );
  });

  it("prevents repeated action execution while a request is pending", async () => {
    let resolveApprove: ((value: Response) => void) | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/admin/ai/health")) {
        return jsonResponse({ status: "ok", app_name: "ai", environment: "test", version: "0" });
      }
      if (url.endsWith("/api/admin/ai/chat/messages") && init?.method === "POST") {
        return jsonResponse({
          conversation_id: CONVERSATION_ID,
          user_message_id: "user-1",
          assistant_message_id: "assistant-1",
          agent_run_id: "run-1",
          status: "completed",
          final_text: `Approve through POST /api/v1/actions/${ACTION_ID}/approve.`,
          usage: {},
          route_evidence: [`action_id:${ACTION_ID}`],
        });
      }
      if (url.endsWith(`/api/admin/ai/actions/${ACTION_ID}`) && (!init?.method || init.method === "GET")) {
        return jsonResponse({
          action_id: ACTION_ID,
          status: "pending",
          risk_level: "medium",
          operation_type: "create_invoice_draft",
          created_at: "2026-07-24T10:00:00Z",
          expires_at: "2026-07-24T12:00:00Z",
          safe_summary: "Draft",
        });
      }
      if (url.endsWith(`/api/admin/ai/actions/${ACTION_ID}/approve`) && init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          resolveApprove = resolve;
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderChat();
    await screen.findByTestId("ai-chat-panel");
    await user.type(screen.getByTestId("ai-chat-input"), "Draft");
    await user.click(screen.getByTestId("ai-chat-send"));

    const card = await screen.findByTestId("ai-action-card");
    await user.click(within(card).getByTestId("ai-action-approve"));
    await screen.findByText("Schválit AI akci?");
    await user.click(screen.getByRole("button", { name: "Ano, schválit" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([request]) => String(request).includes("/approve")),
      ).toHaveLength(1),
    );

    await user.click(screen.getByRole("button", { name: "Ano, schválit" }));
    expect(
      fetchMock.mock.calls.filter(([request]) => String(request).includes("/approve")),
    ).toHaveLength(1);

    resolveApprove?.(
      jsonResponse({
        action_id: ACTION_ID,
        status: "approved",
        risk_level: "medium",
        operation_type: "create_invoice_draft",
        created_at: "2026-07-24T10:00:00Z",
        expires_at: "2026-07-24T12:00:00Z",
        safe_summary: "Draft",
      }),
    );

    await waitFor(() =>
      expect(within(screen.getByTestId("ai-action-card")).getByTestId("ai-action-status")).toHaveTextContent(
        "approved",
      ),
    );
  });
});
