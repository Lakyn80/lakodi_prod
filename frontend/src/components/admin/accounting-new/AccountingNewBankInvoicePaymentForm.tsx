"use client";

import { FormEvent, useState } from "react";

import { AccountingNewConfirmDialog } from "@/components/admin/accounting-new/AccountingNewConfirmDialog";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { AccountingNewMoneyInput } from "@/components/admin/accounting-new/AccountingNewMoneyInput";
import { AccountingNewPayableInvoiceSelect } from "@/components/admin/accounting-new/AccountingNewPayableInvoiceSelect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { AccountingNewRequestError, recordAccountingNewInvoiceBankPayment } from "@/lib/accountingNew";
import { minorUnitsToApiDecimal, parseAccountingNewMoneyInput } from "@/lib/accountingNewMoney";
import type { AccountingNewApiError, AccountingNewPayableInvoiceListItem } from "@/types/accountingNew";
import { formatAccountingNewTemplate } from "@/components/admin/accounting-new/accountingNewFormat";

export function AccountingNewBankInvoicePaymentForm({ onRecorded }: { onRecorded?: () => void }) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<AccountingNewPayableInvoiceListItem | null>(null);
  const [amount, setAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [error, setError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function submitPayment() {
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    setValidationError(null);

    const parsedInvoiceId = Number.parseInt(selectedInvoiceId, 10);
    if (!selectedInvoiceId || Number.isNaN(parsedInvoiceId) || parsedInvoiceId <= 0) {
      setValidationError(t.bankWrite.recordPaymentInvoiceRequired);
      setIsSubmitting(false);
      return;
    }

    let parsedAmount: number | undefined;
    if (amount.trim()) {
      const parsed = parseAccountingNewMoneyInput(amount, selectedInvoice?.currency ?? "CZK");
      if (!parsed.ok) {
        setValidationError(t.money.invalidFormat);
        setIsSubmitting(false);
        return;
      }
      parsedAmount = Number(minorUnitsToApiDecimal(parsed.minorUnits));
    }

    try {
      const result = await recordAccountingNewInvoiceBankPayment({
        invoice_id: parsedInvoiceId,
        transaction_date: transactionDate,
        amount: parsedAmount,
        message: message.trim() || null,
      });
      setSuccessMessage(
        formatAccountingNewTemplate(t.bankWrite.recordPaymentSuccess, {
          invoiceNumber: result.invoiceNumber,
          remaining: String(result.remainingAmount),
        }),
      );
      setSelectedInvoiceId("");
      setSelectedInvoice(null);
      setAmount("");
      setMessage("");
      setConfirmOpen(false);
      onRecorded?.();
    } catch (recordError) {
      setError(
        recordError instanceof AccountingNewRequestError
          ? recordError.apiError
          : {
              resource: "bank-record-payment",
              message: recordError instanceof Error ? recordError.message : t.errors.actionFailed,
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
          <p className="text-sm font-medium text-foreground">{t.bankWrite.recordPaymentTitle}</p>
          <p className="text-sm text-muted-foreground">{t.bankWrite.recordPaymentDescription}</p>
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
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <AccountingNewPayableInvoiceSelect
              id="bank-invoice-select"
              label={t.bankWrite.recordPaymentInvoiceLabel}
              value={selectedInvoiceId}
              onChange={(invoiceId, invoice) => {
                setSelectedInvoiceId(invoiceId);
                setSelectedInvoice(invoice);
              }}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank-payment-date">{t.bankWrite.recordPaymentDateLabel}</Label>
            <Input
              id="bank-payment-date"
              type="date"
              value={transactionDate}
              onChange={(event) => setTransactionDate(event.target.value)}
            />
          </div>
          <AccountingNewMoneyInput
            id="bank-payment-amount"
            label={t.bankWrite.recordPaymentAmountLabel}
            value={amount}
            onChange={setAmount}
            placeholder={t.bankWrite.recordPaymentAmountPlaceholder}
          />
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="bank-payment-message">{t.bankWrite.recordPaymentMessageLabel}</Label>
            <Input
              id="bank-payment-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t.bankWrite.recordPaymentMessagePlaceholder}
            />
          </div>
        </div>
        <Button type="submit" disabled={isSubmitting || !selectedInvoiceId}>
          {t.bankWrite.recordPaymentAction}
        </Button>
      </form>

      <AccountingNewConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t.bankWrite.recordPaymentConfirmTitle}
        description={t.bankWrite.recordPaymentConfirmDescription}
        confirmLabel={t.bankWrite.recordPaymentAction}
        cancelLabel={t.documentWrite.confirm.cancel}
        isPending={isSubmitting}
        onConfirm={() => void submitPayment()}
      />
    </>
  );
}
