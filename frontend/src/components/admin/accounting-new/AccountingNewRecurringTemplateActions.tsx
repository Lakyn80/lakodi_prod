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
  activateAccountingNewRecurringTemplate,
  cancelAccountingNewRecurringTemplate,
  generateAccountingNewRecurringTemplate,
  pauseAccountingNewRecurringTemplate,
} from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewRecurringTemplateSummary } from "@/types/accountingNew";
import { formatAccountingNewTemplate } from "@/components/admin/accounting-new/accountingNewFormat";

type RecurringAction = "generate" | "pause" | "activate" | "cancel";

export function AccountingNewRecurringTemplateActions({
  template,
  onUpdated,
}: {
  template: AccountingNewRecurringTemplateSummary;
  onUpdated?: (template: AccountingNewRecurringTemplateSummary) => void;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [confirmAction, setConfirmAction] = useState<RecurringAction | null>(null);
  const [pendingAction, setPendingAction] = useState<RecurringAction | null>(null);
  const [error, setError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function runAction(action: RecurringAction) {
    setPendingAction(action);
    setError(null);
    setSuccessMessage(null);

    try {
      if (action === "generate") {
        const result = await generateAccountingNewRecurringTemplate(template.id);
        setSuccessMessage(
          formatAccountingNewTemplate(t.recurringWrite.generateSuccess, {
            id: result.generatedInvoiceId ?? result.generatedExpenseId ?? result.id,
          }),
        );
      } else if (action === "pause") {
        const updated = await pauseAccountingNewRecurringTemplate(template.id);
        onUpdated?.(updated);
        setSuccessMessage(t.recurringWrite.pauseSuccess);
      } else if (action === "activate") {
        const updated = await activateAccountingNewRecurringTemplate(template.id);
        onUpdated?.(updated);
        setSuccessMessage(t.recurringWrite.activateSuccess);
      } else {
        const updated = await cancelAccountingNewRecurringTemplate(template.id);
        onUpdated?.(updated);
        setSuccessMessage(t.recurringWrite.cancelSuccess);
      }
      setConfirmAction(null);
    } catch (actionError) {
      setError(
        actionError instanceof AccountingNewRequestError
          ? actionError.apiError
          : {
              resource: "recurring-action",
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

  const confirmCopy: Record<RecurringAction, { title: string; description: string; label: string }> = {
    generate: {
      title: t.recurringWrite.generateConfirmTitle,
      description: t.recurringWrite.generateConfirmDescription,
      label: t.recurringWrite.generateAction,
    },
    pause: {
      title: t.recurringWrite.pauseConfirmTitle,
      description: t.recurringWrite.pauseConfirmDescription,
      label: t.recurringWrite.pauseAction,
    },
    activate: {
      title: t.recurringWrite.activateConfirmTitle,
      description: t.recurringWrite.activateConfirmDescription,
      label: t.recurringWrite.activateAction,
    },
    cancel: {
      title: t.recurringWrite.cancelConfirmTitle,
      description: t.recurringWrite.cancelConfirmDescription,
      label: t.recurringWrite.cancelAction,
    },
  };

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
        {template.status === "active" ? (
          <>
            <Button type="button" onClick={() => setConfirmAction("generate")} disabled={pendingAction !== null}>
              {t.recurringWrite.generateAction}
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirmAction("pause")} disabled={pendingAction !== null}>
              {t.recurringWrite.pauseAction}
            </Button>
          </>
        ) : null}
        {template.status === "paused" ? (
          <Button type="button" onClick={() => setConfirmAction("activate")} disabled={pendingAction !== null}>
            {t.recurringWrite.activateAction}
          </Button>
        ) : null}
        {template.status !== "cancelled" ? (
          <Button type="button" variant="outline" onClick={() => setConfirmAction("cancel")} disabled={pendingAction !== null}>
            {t.recurringWrite.cancelAction}
          </Button>
        ) : null}
      </div>

      {confirmAction ? (
        <AccountingNewConfirmDialog
          open={confirmAction !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }}
          title={confirmCopy[confirmAction].title}
          description={confirmCopy[confirmAction].description}
          confirmLabel={confirmCopy[confirmAction].label}
          cancelLabel={t.documentWrite.confirm.cancel}
          isPending={pendingAction === confirmAction}
          onConfirm={() => void runAction(confirmAction)}
        />
      ) : null}
    </div>
  );
}
