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
import { AccountingNewRequestError, linkAccountingNewAttachment } from "@/lib/accountingNew";
import type { AccountingNewApiError } from "@/types/accountingNew";

export function AccountingNewAttachmentLinkForm({
  attachmentId,
  onLinked,
}: {
  attachmentId: number;
  onLinked?: () => void;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [invoiceId, setInvoiceId] = useState("");
  const [expenseId, setExpenseId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function submitLink() {
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    const payload: { invoice_id?: number; expense_id?: number } = {};
    const parsedInvoiceId = Number.parseInt(invoiceId.trim(), 10);
    const parsedExpenseId = Number.parseInt(expenseId.trim(), 10);
    if (Number.isFinite(parsedInvoiceId) && parsedInvoiceId > 0) {
      payload.invoice_id = parsedInvoiceId;
    }
    if (Number.isFinite(parsedExpenseId) && parsedExpenseId > 0) {
      payload.expense_id = parsedExpenseId;
    }

    try {
      await linkAccountingNewAttachment(attachmentId, payload);
      setSuccessMessage(t.attachmentWrite.linkSuccess);
      setConfirmOpen(false);
      onLinked?.();
    } catch (linkError) {
      setError(
        linkError instanceof AccountingNewRequestError
          ? linkError.apiError
          : {
              resource: "attachment-link",
              message: linkError instanceof Error ? linkError.message : t.errors.actionFailed,
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
    if (!invoiceId.trim() && !expenseId.trim()) {
      return;
    }
    setConfirmOpen(true);
  }

  return (
    <>
      <form className="space-y-3 rounded-lg border border-border bg-background p-4" onSubmit={handleSubmit}>
        <div>
          <p className="text-sm font-medium text-foreground">{t.attachmentWrite.linkTitle}</p>
          <p className="text-sm text-muted-foreground">{t.attachmentWrite.linkDescription}</p>
        </div>
        {error ? <AccountingNewMutationNotice error={error} /> : null}
        {successMessage ? (
          <Alert>
            <AlertTitle>{t.documentWrite.mutation.successTitle}</AlertTitle>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="attachment-link-invoice">{t.attachmentWrite.fields.invoiceId}</Label>
            <Input id="attachment-link-invoice" value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="attachment-link-expense">{t.attachmentWrite.fields.expenseId}</Label>
            <Input id="attachment-link-expense" value={expenseId} onChange={(event) => setExpenseId(event.target.value)} />
          </div>
        </div>
        <Button type="submit">{t.attachmentWrite.linkAction}</Button>
      </form>

      <AccountingNewConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t.attachmentWrite.linkTitle}
        description={t.attachmentWrite.linkDescription}
        confirmLabel={t.attachmentWrite.linkAction}
        cancelLabel={t.documentWrite.confirm.cancel}
        isPending={isSubmitting}
        onConfirm={submitLink}
      />
    </>
  );
}
