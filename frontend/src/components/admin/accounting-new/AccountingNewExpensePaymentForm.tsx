"use client";

import { FormEvent, useEffect, useState } from "react";

import { AccountingNewConfirmDialog } from "@/components/admin/accounting-new/AccountingNewConfirmDialog";
import { AccountingNewMoneyInput } from "@/components/admin/accounting-new/AccountingNewMoneyInput";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { AccountingNewPaymentMethodSelect } from "@/components/admin/accounting-new/AccountingNewPaymentMethodSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { AccountingNewRequestError, addAccountingNewExpensePayment } from "@/lib/accountingNew";
import {
  formatAccountingNewMoneyInputFromApiDecimal,
  minorUnitsToApiDecimal,
  parseAccountingNewMoneyInput,
} from "@/lib/accountingNewMoney";
import {
  backendPaymentMethodToId,
  paymentMethodIdToBackendValue,
  type AccountingNewPaymentMethodId,
} from "@/lib/accountingNewPaymentMethods";
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
  const [paymentMethod, setPaymentMethod] = useState(backendPaymentMethodToId(detail.paymentMethod));
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setAmount(
      detail.remainingAmount > 0 ? formatAccountingNewMoneyInputFromApiDecimal(detail.remainingAmount) : "",
    );
  }, [detail.id, detail.remainingAmount]);

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
      const updated = await addAccountingNewExpensePayment(detail.id, {
        amount: minorUnitsToApiDecimal(parsedAmount.minorUnits),
        paid_at: paidAt,
        payment_method: paymentMethodIdToBackendValue(paymentMethod),
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
      } else {
        setMutationError({
          resource: "expense-payment",
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
        <h3 className="text-sm font-semibold text-foreground">{t.expenseWrite.payment.title}</h3>
        <p className="text-sm text-muted-foreground">{t.expenseWrite.payment.description}</p>
      </div>

      <AccountingNewMutationNotice successMessage={successMessage} error={mutationError} />

      {validationError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {validationError}
        </p>
      ) : null}

      <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <AccountingNewMoneyInput
          id="expensePaymentAmount"
          label={t.expenseWrite.payment.fields.amount}
          value={amount}
          onChange={setAmount}
          required
        />
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
        <AccountingNewPaymentMethodSelect
          id="expensePaymentMethod"
          label={t.expenseWrite.payment.fields.method}
          value={paymentMethod}
          onChange={(value: AccountingNewPaymentMethodId) => setPaymentMethod(value)}
          required
        />
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
