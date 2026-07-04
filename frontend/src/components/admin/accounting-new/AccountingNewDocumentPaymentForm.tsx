"use client";

import { FormEvent, useState } from "react";

import { AccountingNewConfirmDialog } from "@/components/admin/accounting-new/AccountingNewConfirmDialog";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { AccountingNewRequestError, addAccountingNewDocumentPayment } from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewDocumentDetail } from "@/types/accountingNew";

export function AccountingNewDocumentPaymentForm({
  detail,
  onPaymentAdded,
}: {
  detail: AccountingNewDocumentDetail;
  onPaymentAdded: (detail: AccountingNewDocumentDetail) => void;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState(detail.paymentMethod || "bank_transfer");
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function submitPayment() {
    setIsSubmitting(true);
    setMutationError(null);
    setSuccessMessage(null);

    try {
      const updated = await addAccountingNewDocumentPayment(detail.id, {
        amount: Number(amount),
        paid_at: paidAt,
        payment_method: paymentMethod,
        note: note.trim() || null,
      });
      setSuccessMessage(t.documentWrite.payment.success);
      setAmount("");
      setNote("");
      setConfirmOpen(false);
      onPaymentAdded(updated);
    } catch (error) {
      if (error instanceof AccountingNewRequestError) {
        setMutationError(error.apiError);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmOpen(true);
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t.documentWrite.payment.title}</h3>
        <p className="text-sm text-muted-foreground">{t.documentWrite.payment.description}</p>
      </div>

      <AccountingNewMutationNotice successMessage={successMessage} error={mutationError} />

      <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="paymentAmount">{t.documentWrite.payment.fields.amount}</Label>
          <Input id="paymentAmount" value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="paymentPaidAt">{t.documentWrite.payment.fields.paidAt}</Label>
          <Input
            id="paymentPaidAt"
            type="date"
            value={paidAt}
            onChange={(event) => setPaidAt(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="paymentMethod">{t.documentWrite.payment.fields.method}</Label>
          <Input
            id="paymentMethod"
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="paymentNote">{t.documentWrite.payment.fields.note}</Label>
          <Input id="paymentNote" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Button type="submit" disabled={isSubmitting}>
            {t.documentWrite.payment.submit}
          </Button>
        </div>
      </form>

      <AccountingNewConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t.documentWrite.payment.confirmTitle}
        description={t.documentWrite.payment.confirmDescription}
        confirmLabel={t.documentWrite.payment.confirmAction}
        cancelLabel={t.documentWrite.confirm.cancel}
        isPending={isSubmitting}
        onConfirm={submitPayment}
      />
    </div>
  );
}
