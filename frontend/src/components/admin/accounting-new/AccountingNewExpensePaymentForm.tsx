"use client";

import { FormEvent, useState } from "react";

import { AccountingNewConfirmDialog } from "@/components/admin/accounting-new/AccountingNewConfirmDialog";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { AccountingNewRequestError, addAccountingNewExpensePayment } from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewExpenseDetail } from "@/types/accountingNew";

export function AccountingNewExpensePaymentForm({
  detail,
  onPaymentAdded,
}: {
  detail: AccountingNewExpenseDetail;
  onPaymentAdded: (detail: AccountingNewExpenseDetail) => void;
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
      const updated = await addAccountingNewExpensePayment(detail.id, {
        amount: Number(amount),
        paid_at: paidAt,
        payment_method: paymentMethod,
        note: note.trim() || null,
      });
      setSuccessMessage(t.expenseWrite.payment.success);
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
        <h3 className="text-sm font-semibold text-foreground">{t.expenseWrite.payment.title}</h3>
        <p className="text-sm text-muted-foreground">{t.expenseWrite.payment.description}</p>
      </div>

      <AccountingNewMutationNotice successMessage={successMessage} error={mutationError} />

      <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="expensePaymentAmount">{t.expenseWrite.payment.fields.amount}</Label>
          <Input id="expensePaymentAmount" value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expensePaymentPaidAt">{t.expenseWrite.payment.fields.paidAt}</Label>
          <Input
            id="expensePaymentPaidAt"
            type="date"
            value={paidAt}
            onChange={(event) => setPaidAt(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expensePaymentMethod">{t.expenseWrite.payment.fields.method}</Label>
          <Input
            id="expensePaymentMethod"
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="expensePaymentNote">{t.expenseWrite.payment.fields.note}</Label>
          <Input id="expensePaymentNote" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Button type="submit" disabled={isSubmitting}>
            {t.expenseWrite.payment.submit}
          </Button>
        </div>
      </form>

      <AccountingNewConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t.expenseWrite.payment.confirmTitle}
        description={t.expenseWrite.payment.confirmDescription}
        confirmLabel={t.expenseWrite.payment.confirmAction}
        cancelLabel={t.documentWrite.confirm.cancel}
        isPending={isSubmitting}
        onConfirm={submitPayment}
      />
    </div>
  );
}
