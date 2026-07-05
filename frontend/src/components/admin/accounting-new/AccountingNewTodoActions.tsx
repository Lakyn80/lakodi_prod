"use client";

import { useState } from "react";

import { AccountingNewConfirmDialog } from "@/components/admin/accounting-new/AccountingNewConfirmDialog";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  AccountingNewRequestError,
  cancelAccountingNewTodo,
  completeAccountingNewTodo,
  generateAccountingNewTodos,
} from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewTodoSummary } from "@/types/accountingNew";
import { formatAccountingNewTemplate } from "@/components/admin/accounting-new/accountingNewFormat";

export function AccountingNewTodoGenerateButton({ onGenerated }: { onGenerated?: () => void }) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleGenerate() {
    setIsPending(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await generateAccountingNewTodos();
      setSuccessMessage(
        formatAccountingNewTemplate(t.todoWrite.generateSuccess, {
          generated: result.generatedCount,
          skipped: result.skippedExistingCount,
        }),
      );
      setConfirmOpen(false);
      onGenerated?.();
    } catch (generateError) {
      setError(
        generateError instanceof AccountingNewRequestError
          ? generateError.apiError
          : {
              resource: "todo-generate",
              message: generateError instanceof Error ? generateError.message : t.errors.actionFailed,
              status: null,
              requiresLogin: false,
            },
      );
      setConfirmOpen(false);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      {error ? <AccountingNewMutationNotice error={error} /> : null}
      {successMessage ? (
        <Alert>
          <AlertTitle>{t.documentWrite.mutation.successTitle}</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="button" variant="outline" onClick={() => setConfirmOpen(true)} disabled={isPending}>
        {t.todoWrite.generateAction}
      </Button>
      <AccountingNewConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t.todoWrite.generateConfirmTitle}
        description={t.todoWrite.generateConfirmDescription}
        confirmLabel={t.todoWrite.generateAction}
        cancelLabel={t.documentWrite.confirm.cancel}
        isPending={isPending}
        onConfirm={() => void handleGenerate()}
      />
    </>
  );
}

export function AccountingNewTodoDetailActions({
  todo,
  onUpdated,
}: {
  todo: AccountingNewTodoSummary;
  onUpdated?: (todo: AccountingNewTodoSummary) => void;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [pendingAction, setPendingAction] = useState<"complete" | "cancel" | null>(null);
  const [confirmAction, setConfirmAction] = useState<"complete" | "cancel" | null>(null);
  const [error, setError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canComplete = todo.status === "open" || todo.status === "overdue";
  const canCancel = todo.status === "open" || todo.status === "overdue";

  async function runAction(action: "complete" | "cancel") {
    setPendingAction(action);
    setError(null);
    setSuccessMessage(null);

    try {
      const updated =
        action === "complete" ? await completeAccountingNewTodo(todo.id) : await cancelAccountingNewTodo(todo.id);
      setSuccessMessage(action === "complete" ? t.todoWrite.completeSuccess : t.todoWrite.cancelSuccess);
      setConfirmAction(null);
      onUpdated?.(updated);
    } catch (actionError) {
      setError(
        actionError instanceof AccountingNewRequestError
          ? actionError.apiError
          : {
              resource: "todo-action",
              message: actionError instanceof Error ? actionError.message : t.errors.actionFailed,
              status: null,
              requiresLogin: false,
            },
      );
      setConfirmAction(null);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <AccountingNewMutationNotice error={error} /> : null}
      {successMessage ? (
        <Alert>
          <AlertTitle>{t.documentWrite.mutation.successTitle}</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canComplete ? (
          <Button type="button" onClick={() => setConfirmAction("complete")} disabled={pendingAction !== null}>
            {t.todoWrite.completeAction}
          </Button>
        ) : null}
        {canCancel ? (
          <Button type="button" variant="outline" onClick={() => setConfirmAction("cancel")} disabled={pendingAction !== null}>
            {t.todoWrite.cancelAction}
          </Button>
        ) : null}
      </div>

      <AccountingNewConfirmDialog
        open={confirmAction === "complete"}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={t.todoWrite.completeConfirmTitle}
        description={t.todoWrite.completeConfirmDescription}
        confirmLabel={t.todoWrite.completeAction}
        cancelLabel={t.documentWrite.confirm.cancel}
        isPending={pendingAction === "complete"}
        onConfirm={() => void runAction("complete")}
      />
      <AccountingNewConfirmDialog
        open={confirmAction === "cancel"}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={t.todoWrite.cancelConfirmTitle}
        description={t.todoWrite.cancelConfirmDescription}
        confirmLabel={t.todoWrite.cancelAction}
        cancelLabel={t.documentWrite.confirm.cancel}
        isPending={pendingAction === "cancel"}
        onConfirm={() => void runAction("cancel")}
      />
    </div>
  );
}
