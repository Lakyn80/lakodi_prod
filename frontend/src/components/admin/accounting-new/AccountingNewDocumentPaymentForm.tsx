"use client";

import { FormEvent, useState } from "react";

import { AccountingNewConfirmDialog } from "@/components/admin/accounting-new/AccountingNewConfirmDialog";
import { AccountingNewMoneyInput } from "@/components/admin/accounting-new/AccountingNewMoneyInput";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { AccountingNewPaymentMethodSelect } from "@/components/admin/accounting-new/AccountingNewPaymentMethodSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { AccountingNewRequestError, addAccountingNewDocumentPayment } from "@/lib/accountingNew";
import {
  minorUnitsToApiDecimal,
  parseAccountingNewMoneyInput,
} from "@/lib/accountingNewMoney";
import {
  backendPaymentMethodToId,
  paymentMethodIdToBackendValue,
  type AccountingNewPaymentMethodId,
} from "@/lib/accountingNewPaymentMethods";
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
  const [paymentMethod, setPaymentMethod] = useState(backendPaymentMethodToId(detail.paymentMethod));
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function submitPayment() {
    setIsSubmitting(true);
    setMutationError(null);
    setSuccessMessage(null);
    setValidationError(null);

    const parsedAmount = parseAccountingNewMoneyInput(amount, detail.currency);
    if (!parsedAmount.ok) {
      setValidationError(t.money.invalidFormat);
      setIsSubmitting(false);
      return;
    }

    try {
      const updated = await addAccountingNewDocumentPayment(detail.id, {
        amount: minorUnitsToApiDecimal(parsedAmount.minorUnits),
        paid_at: paidAt,
        payment_method: paymentMethodIdToBackendValue(paymentMethod),
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
      } else {
        setMutationError({
          resource: "document-payment",
          message: t.errors.actionFailed,
          status: null,
          requiresLogin: false,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);
    const parsedAmount = parseAccountingNewMoneyInput(amount, detail.currency);
    if (!parsedAmount.ok) {
      setValidationError(t.money.invalidFormat);
      return;
    }

    setConfirmOpen(true);
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t.documentWrite.payment.title}</h3>
        <p className="text-sm text-muted-foreground">{t.documentWrite.payment.description}</p>
      </div>

      <AccountingNewMutationNotice successMessage={successMessage} error={mutationError} />

      {validationError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {validationError}
        </p>
      ) : null}

      <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <AccountingNewMoneyInput
          id="paymentAmount"
          label={t.documentWrite.payment.fields.amount}
          value={amount}
          onChange={setAmount}
          required
        />
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
        <AccountingNewPaymentMethodSelect
          id="paymentMethod"
          label={t.documentWrite.payment.fields.method}
          value={paymentMethod}
          onChange={(value: AccountingNewPaymentMethodId) => setPaymentMethod(value)}
          required
        />
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
