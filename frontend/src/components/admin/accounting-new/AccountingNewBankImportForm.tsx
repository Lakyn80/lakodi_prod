"use client";

import { FormEvent, useState } from "react";

import { AccountingNewConfirmDialog } from "@/components/admin/accounting-new/AccountingNewConfirmDialog";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { AccountingNewRequestError, importAccountingNewBankTransactions } from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewBankTransactionImportPayload } from "@/types/accountingNew";
import { formatAccountingNewTemplate } from "@/components/admin/accounting-new/accountingNewFormat";

const EXAMPLE_JSON = `[
  {
    "transaction_date": "2026-06-01",
    "amount": 2000,
    "currency": "CZK",
    "variable_symbol": "123",
    "direction": "incoming",
    "message": "Platba od zákazníka"
  }
]`;

export function AccountingNewBankImportForm({ onImported }: { onImported?: () => void }) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [jsonValue, setJsonValue] = useState(EXAMPLE_JSON);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function submitImport() {
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const parsed = JSON.parse(jsonValue) as AccountingNewBankTransactionImportPayload["transactions"] | { transactions: AccountingNewBankTransactionImportPayload["transactions"] };
      const transactions = Array.isArray(parsed) ? parsed : parsed.transactions;
      if (!Array.isArray(transactions) || transactions.length === 0) {
        throw new Error(t.bankWrite.importInvalidJson);
      }

      const result = await importAccountingNewBankTransactions({ transactions });
      const successParts = [
        formatAccountingNewTemplate(t.bankWrite.importSuccess, {
          imported: result.importedCount,
          skipped: result.skippedDuplicateCount,
        }),
      ];
      if (result.skippedDuplicateCount === 1) {
        successParts.push(t.bankWrite.importSkippedDuplicatesOne);
      } else if (result.skippedDuplicateCount > 1) {
        successParts.push(
          formatAccountingNewTemplate(t.bankWrite.importSkippedDuplicatesMany, {
            count: result.skippedDuplicateCount,
          }),
        );
      }
      if (result.skippedDuplicateIdentifiers.length > 0) {
        successParts.push(
          formatAccountingNewTemplate(t.bankWrite.importSkippedIdentifiers, {
            items: result.skippedDuplicateIdentifiers.join(", "),
          }),
        );
      }
      setSuccessMessage(successParts.join(" "));
      setConfirmOpen(false);
      onImported?.();
    } catch (importError) {
      setError(
        importError instanceof AccountingNewRequestError
          ? importError.apiError
          : {
              resource: "bank-import",
              message: importError instanceof Error ? importError.message : t.errors.actionFailed,
              status: null,
              requiresLogin: false,
            },
      );
      setConfirmOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmOpen(true);
  }

  return (
    <>
      <form className="space-y-3 rounded-lg border border-border bg-background p-4" onSubmit={handleSubmit}>
        <div>
          <p className="text-sm font-medium text-foreground">{t.bankWrite.importTitle}</p>
          <p className="text-sm text-muted-foreground">{t.bankWrite.importDescription}</p>
        </div>
        {error ? <AccountingNewMutationNotice error={error} /> : null}
        {successMessage ? (
          <Alert>
            <AlertTitle>{t.documentWrite.mutation.successTitle}</AlertTitle>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="bank-import-json">{t.bankWrite.importJsonLabel}</Label>
          <Textarea
            id="bank-import-json"
            className="min-h-[160px] font-mono text-xs"
            value={jsonValue}
            onChange={(event) => setJsonValue(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={isSubmitting}>
          {t.bankWrite.importAction}
        </Button>
      </form>

      <AccountingNewConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t.bankWrite.importConfirmTitle}
        description={t.bankWrite.importConfirmDescription}
        confirmLabel={t.bankWrite.importAction}
        cancelLabel={t.documentWrite.confirm.cancel}
        isPending={isSubmitting}
        onConfirm={() => void submitImport()}
      />
    </>
  );
}
