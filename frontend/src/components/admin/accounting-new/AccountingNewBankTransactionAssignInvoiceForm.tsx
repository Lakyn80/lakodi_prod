"use client";

import { FormEvent, useState } from "react";

import { AccountingNewConfirmDialog } from "@/components/admin/accounting-new/AccountingNewConfirmDialog";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { AccountingNewRequestError, assignAccountingNewBankTransactionInvoice } from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewBankTransactionListItem } from "@/types/accountingNew";
import { formatAccountingNewTemplate } from "@/components/admin/accounting-new/accountingNewFormat";

export function AccountingNewBankTransactionAssignInvoiceForm({
  detail,
  onAssigned,
}: {
  detail: AccountingNewBankTransactionListItem;
  onAssigned?: () => void;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [error, setError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canAssign = detail.status === "imported" && detail.direction === "incoming";

  if (!canAssign) {
    return null;
  }

  async function submitAssign() {
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    setValidationError(null);

    const cleanedInvoiceNumber = invoiceNumber.trim();
    if (!cleanedInvoiceNumber) {
      setValidationError(t.bankWrite.recordPaymentInvoiceRequired);
      setIsSubmitting(false);
      return;
    }

    try {
      await assignAccountingNewBankTransactionInvoice(detail.id, {
        invoice_number: cleanedInvoiceNumber,
      });
      setSuccessMessage(
        formatAccountingNewTemplate(t.bankWrite.assignInvoiceSuccess, {
          invoiceNumber: cleanedInvoiceNumber,
        }),
      );
      setInvoiceNumber("");
      setConfirmOpen(false);
      onAssigned?.();
    } catch (assignError) {
      setError(
        assignError instanceof AccountingNewRequestError
          ? assignError.apiError
          : {
              resource: "bank-assign-invoice",
              message: assignError instanceof Error ? assignError.message : t.errors.actionFailed,
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
      <form className="space-y-3 rounded-lg border border-dashed border-border bg-background p-4" onSubmit={handleSubmit}>
        <div>
          <p className="text-sm font-medium text-foreground">{t.bankWrite.assignInvoiceTitle}</p>
          <p className="text-sm text-muted-foreground">{t.bankWrite.assignInvoiceDescription}</p>
        </div>
        {validationError ? (
          <Alert variant="destructive">
            <AlertTitle>{t.documentWrite.mutation.errorTitle}</AlertTitle>
            <AlertDescription>{validationError}</AlertDescription>
          </Alert>
        ) : null}
        {error ? <AccountingNewMutationNotice error={error} /> : null}
        {successMessage ? (
          <Alert>
            <AlertTitle>{t.documentWrite.mutation.successTitle}</AlertTitle>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grow space-y-2">
            <Label htmlFor="assign-invoice-number">{t.bankWrite.recordPaymentInvoiceNumberLabel}</Label>
            <Input
              id="assign-invoice-number"
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              placeholder={t.bankWrite.recordPaymentInvoiceNumberPlaceholder}
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {t.bankWrite.assignInvoiceAction}
          </Button>
        </div>
      </form>

      <AccountingNewConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t.bankWrite.assignInvoiceConfirmTitle}
        description={t.bankWrite.assignInvoiceConfirmDescription}
        confirmLabel={t.bankWrite.assignInvoiceAction}
        cancelLabel={t.documentWrite.confirm.cancel}
        isPending={isSubmitting}
        onConfirm={() => void submitAssign()}
      />
    </>
  );
}
