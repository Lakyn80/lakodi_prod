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
  generateAccountingNewBankTransactionMatches,
  ignoreAccountingNewBankTransaction,
} from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewBankTransactionListItem } from "@/types/accountingNew";

export function AccountingNewBankTransactionActions({
  detail,
  onUpdated,
}: {
  detail: AccountingNewBankTransactionListItem;
  onUpdated?: () => void;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [confirmAction, setConfirmAction] = useState<"generate" | "ignore" | null>(null);
  const [pendingAction, setPendingAction] = useState<"generate" | "ignore" | null>(null);
  const [error, setError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canGenerate = detail.status !== "ignored" && detail.status !== "matched";
  const canIgnore = detail.status !== "ignored" && detail.status !== "matched";

  async function runAction(action: "generate" | "ignore") {
    setPendingAction(action);
    setError(null);
    setSuccessMessage(null);

    try {
      if (action === "generate") {
        await generateAccountingNewBankTransactionMatches(detail.id);
        setSuccessMessage(t.bankWrite.generateSuccess);
      } else {
        await ignoreAccountingNewBankTransaction(detail.id);
        setSuccessMessage(t.bankWrite.ignoreSuccess);
      }
      setConfirmAction(null);
      onUpdated?.();
    } catch (actionError) {
      setError(
        actionError instanceof AccountingNewRequestError
          ? actionError.apiError
          : {
              resource: "bank-transaction-action",
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
        {canGenerate ? (
          <Button type="button" onClick={() => setConfirmAction("generate")} disabled={pendingAction !== null}>
            {t.bankWrite.generateAction}
          </Button>
        ) : null}
        {canIgnore ? (
          <Button type="button" variant="outline" onClick={() => setConfirmAction("ignore")} disabled={pendingAction !== null}>
            {t.bankWrite.ignoreAction}
          </Button>
        ) : null}
      </div>

      <AccountingNewConfirmDialog
        open={confirmAction === "generate"}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={t.bankWrite.generateConfirmTitle}
        description={t.bankWrite.generateConfirmDescription}
        confirmLabel={t.bankWrite.generateAction}
        cancelLabel={t.documentWrite.confirm.cancel}
        isPending={pendingAction === "generate"}
        onConfirm={() => void runAction("generate")}
      />
      <AccountingNewConfirmDialog
        open={confirmAction === "ignore"}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={t.bankWrite.ignoreConfirmTitle}
        description={t.bankWrite.ignoreConfirmDescription}
        confirmLabel={t.bankWrite.ignoreAction}
        cancelLabel={t.documentWrite.confirm.cancel}
        isPending={pendingAction === "ignore"}
        onConfirm={() => void runAction("ignore")}
      />
    </div>
  );
}
