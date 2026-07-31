"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

import { AccountingNewAiActionCard } from "@/components/admin/accounting-new/AccountingNewAiActionCard";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Language } from "@/contexts/LanguageContext";
import { extractAiAccountingActionIds } from "@/lib/aiAccountingActionIds";
import {
  AiAccountingRequestError,
  getAiAccountingAction,
  getAiAccountingConversation,
  getAiAccountingHealth,
  isAiAccountingHealthOk,
  listAiAccountingConversationMessages,
  postAiAccountingChatMessage,
} from "@/lib/aiAccountingAdmin";
import type {
  AiAccountingActionView,
  AiAccountingApiError,
  AiAccountingChatUiMessage,
} from "@/types/aiAccounting";

const CONVERSATION_STORAGE_KEY = "lakodi.admin.aiAccounting.conversationId";
/** Keep the health probe short so the UI cannot stay on "checking" indefinitely. */
const AI_HEALTH_TIMEOUT_MS = 10_000;

const languageToAiLocale: Record<Language, string> = {
  cs: "cs",
  ua: "uk",
  ru: "ru",
  en: "en",
};

function readStoredConversationId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const value = window.sessionStorage.getItem(CONVERSATION_STORAGE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function writeStoredConversationId(conversationId: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (conversationId) {
      window.sessionStorage.setItem(CONVERSATION_STORAGE_KEY, conversationId);
    } else {
      window.sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

function mapApiError(error: unknown, fallbackMessage: string, resource: string): AiAccountingApiError {
  if (error instanceof AiAccountingRequestError) {
    return error.apiError;
  }
  return {
    resource,
    message: error instanceof Error ? error.message : fallbackMessage,
    status: null,
    requiresLogin: false,
  };
}

function allocateUniqueMessageId(preferredId: string | null | undefined, existingIds: Set<string>, prefix: string): string {
  const trimmed = preferredId?.trim() ?? "";
  if (trimmed && !existingIds.has(trimmed)) {
    return trimmed;
  }

  let suffix = 0;
  while (true) {
    const candidate = trimmed
      ? `${trimmed}__${prefix}-${suffix}`
      : `${prefix}-${Date.now()}-${suffix}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
    suffix += 1;
  }
}

export function AccountingNewAiChatPanel() {
  const { language } = useLanguage();
  const t = translations[language].accountingNew.aiChat;
  const [availability, setAvailability] = useState<"checking" | "available" | "unavailable">("checking");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiAccountingChatUiMessage[]>([]);
  const [actionsById, setActionsById] = useState<Record<string, AiAccountingActionView>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<AiAccountingApiError | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Do not gate bootstrap behind a ref: React Strict Mode remounts and aborts the
    // first effect; a sticky "already ran" flag leaves availability stuck on "checking".
    let cancelled = false;
    const controller = new AbortController();
    const healthTimeoutId = window.setTimeout(() => {
      controller.abort();
    }, AI_HEALTH_TIMEOUT_MS);

    async function bootstrap() {
      setAvailability("checking");
      setError(null);

      try {
        const health = await getAiAccountingHealth(controller.signal);
        if (cancelled) {
          return;
        }
        if (!isAiAccountingHealthOk(health)) {
          setAvailability("unavailable");
          return;
        }
        setAvailability("available");
      } catch (healthError) {
        if (cancelled) {
          return;
        }
        setAvailability("unavailable");
        setError(mapApiError(healthError, t.unavailableDescription, "ai-health"));
        return;
      } finally {
        window.clearTimeout(healthTimeoutId);
      }

      const storedId = readStoredConversationId();
      if (!storedId || cancelled) {
        return;
      }

      setLoadingHistory(true);
      try {
        await getAiAccountingConversation(storedId, controller.signal);
        if (cancelled) {
          return;
        }
        const page = await listAiAccountingConversationMessages(storedId, controller.signal);
        if (cancelled) {
          return;
        }
        const uiMessages: AiAccountingChatUiMessage[] = (page.items ?? [])
          .slice()
          .sort((a, b) => a.sequence - b.sequence)
          .map((item) => {
            const actionIds =
              item.role === "assistant" ? extractAiAccountingActionIds(item.content) : undefined;
            return {
              id: item.id,
              role: item.role,
              content: item.content,
              createdAt: item.created_at,
              actionIds,
            };
          });

        const seenIds = new Set<string>();
        const dedupedMessages = uiMessages.map((message, index) => {
          if (!seenIds.has(message.id)) {
            seenIds.add(message.id);
            return message;
          }
          const uniqueId = allocateUniqueMessageId(message.id, seenIds, `history-${index}`);
          seenIds.add(uniqueId);
          return { ...message, id: uniqueId };
        });

        setConversationId(storedId);
        setMessages(dedupedMessages);
        await loadActionsForMessages(dedupedMessages, controller.signal);
      } catch (historyError) {
        if (cancelled) {
          return;
        }
        const apiError = mapApiError(historyError, t.historyLoadError, "ai-conversation");
        if (apiError.status === 404) {
          writeStoredConversationId(null);
          setConversationId(null);
          setMessages([]);
          setError(null);
        } else {
          setError(apiError);
          if (apiError.requiresLogin) {
            writeStoredConversationId(null);
          }
        }
      } finally {
        if (!cancelled) {
          setLoadingHistory(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
      window.clearTimeout(healthTimeoutId);
      controller.abort();
    };
  }, [t.historyLoadError, t.unavailableDescription]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [messages, sending, actionsById]);

  async function loadActionsForMessages(
    uiMessages: AiAccountingChatUiMessage[],
    signal?: AbortSignal,
  ): Promise<void> {
    const ids = Array.from(
      new Set(uiMessages.flatMap((message) => message.actionIds ?? []).filter(Boolean)),
    );
    if (ids.length === 0) {
      return;
    }

    const next: Record<string, AiAccountingActionView> = {};
    await Promise.all(
      ids.map(async (actionId) => {
        try {
          next[actionId] = await getAiAccountingAction(actionId, signal);
        } catch {
          // Skip missing/expired actions without crashing the chat.
        }
      }),
    );

    if (Object.keys(next).length > 0) {
      setActionsById((current) => ({ ...current, ...next }));
    }
  }

  async function handleSend(event?: FormEvent) {
    event?.preventDefault();
    if (sending || availability !== "available") {
      return;
    }

    const text = draft.trim();
    if (!text) {
      return;
    }

    setSending(true);
    setError(null);

    const optimisticId = `local-user-${Date.now()}`;
    setMessages((current) => [...current, { id: optimisticId, role: "user", content: text }]);
    setDraft("");

    try {
      const response = await postAiAccountingChatMessage({
        text,
        language: languageToAiLocale[language],
        conversation_id: conversationId,
      });

      const actionIds = extractAiAccountingActionIds(
        response.final_text,
        ...(response.route_evidence ?? []),
      );

      setConversationId(response.conversation_id);
      writeStoredConversationId(response.conversation_id);

      setMessages((current) => {
        const withoutOptimistic = current.filter((message) => message.id !== optimisticId);
        const existingIds = new Set(withoutOptimistic.map((message) => message.id));
        const userMessageId = allocateUniqueMessageId(
          response.user_message_id,
          existingIds,
          "user",
        );
        existingIds.add(userMessageId);
        const assistantMessageId = allocateUniqueMessageId(
          response.assistant_message_id,
          existingIds,
          "assistant",
        );

        return [
          ...withoutOptimistic,
          {
            id: userMessageId,
            role: "user",
            content: text,
          },
          {
            id: assistantMessageId,
            role: "assistant",
            content: response.final_text,
            actionIds,
          },
        ];
      });

      if (actionIds.length > 0) {
        await loadActionsForMessages([{ id: "tmp", role: "assistant", content: "", actionIds }]);
      }
    } catch (sendError) {
      setMessages((current) => current.filter((message) => message.id !== optimisticId));
      setDraft(text);
      setError(mapApiError(sendError, t.sendError, "ai-chat"));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  function handleNewConversation() {
    writeStoredConversationId(null);
    setConversationId(null);
    setMessages([]);
    setActionsById({});
    setError(null);
    setDraft("");
  }

  if (availability === "checking") {
    return (
      <Card className="border-border bg-card" data-testid="ai-chat-checking">
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.checkingAvailability}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (availability === "unavailable") {
    return (
      <Card className="border-border bg-card" data-testid="ai-chat-unavailable">
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.unavailableTitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="destructive">
            <AlertTitle>{t.unavailableTitle}</AlertTitle>
            <AlertDescription>{t.unavailableDescription}</AlertDescription>
          </Alert>
          {error ? <AccountingNewMutationNotice error={error} /> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card" data-testid="ai-chat-panel">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{t.title}</CardTitle>
            <CardDescription>{t.description}</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="ai-chat-new-conversation"
            onClick={handleNewConversation}
            disabled={sending}
          >
            {t.newConversation}
          </Button>
        </div>
        {conversationId ? (
          <p className="text-xs text-muted-foreground" data-testid="ai-chat-conversation-id">
            {t.conversationLabel}: {conversationId}
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? <AccountingNewMutationNotice error={error} /> : null}
        {loadingHistory ? (
          <p className="text-sm text-muted-foreground" data-testid="ai-chat-loading-history">
            {t.loadingHistory}
          </p>
        ) : null}

        <div
          ref={listRef}
          className="max-h-[28rem] space-y-3 overflow-y-auto rounded-md border border-border bg-background p-3"
          data-testid="ai-chat-messages"
        >
          {messages.length === 0 && !loadingHistory ? (
            <p className="text-sm text-muted-foreground" data-testid="ai-chat-empty">
              {t.emptyState}
            </p>
          ) : null}

          {messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <div
                key={message.id}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                data-testid={isUser ? "ai-chat-message-user" : "ai-chat-message-assistant"}
              >
                <div
                  className={`max-w-[85%] space-y-2 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    isUser
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground border border-border"
                  }`}
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">
                    {isUser ? t.roleUser : t.roleAssistant}
                  </p>
                  <p>{message.content}</p>
                  {(message.actionIds ?? []).map((actionId) => {
                    const action = actionsById[actionId];
                    if (!action) {
                      return (
                        <p key={actionId} className="text-xs opacity-80">
                          {t.actionLoading}: {actionId}
                        </p>
                      );
                    }
                    return (
                      <AccountingNewAiActionCard
                        key={actionId}
                        action={action}
                        onUpdated={(next) =>
                          setActionsById((current) => ({ ...current, [next.action_id]: next }))
                        }
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {sending ? (
            <p className="text-sm text-muted-foreground" data-testid="ai-chat-pending">
              {t.sending}
            </p>
          ) : null}
        </div>

        <form className="space-y-3" onSubmit={(event) => void handleSend(event)}>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.inputPlaceholder}
            rows={4}
            disabled={sending}
            data-testid="ai-chat-input"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t.inputHint}</p>
            <Button type="submit" disabled={sending || !draft.trim()} data-testid="ai-chat-send">
              {sending ? t.sending : t.send}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
