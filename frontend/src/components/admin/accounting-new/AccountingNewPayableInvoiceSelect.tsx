"use client";

import { useEffect, useId, useState } from "react";

import {
  formatAccountingNewTemplate,
  getAccountingNewLocale,
  translateAccountingNewApiError,
} from "@/components/admin/accounting-new/accountingNewFormat";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { AccountingNewRequestError, listAccountingNewPayableInvoices } from "@/lib/accountingNew";
import type { AccountingNewPayableInvoiceListItem } from "@/types/accountingNew";

function formatRemainingAmount(amount: number, currency: string, locale: string): string {
  const normalizedCurrency = currency.trim().toUpperCase();
  if (normalizedCurrency.length >= 3) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ${currency}`;
}

function formatPayableInvoiceLabel(
  invoice: AccountingNewPayableInvoiceListItem,
  template: string,
  locale: string,
): string {
  return formatAccountingNewTemplate(template, {
    invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.customerName,
    remaining: formatRemainingAmount(invoice.remainingAmount, invoice.currency, locale),
  });
}

export function AccountingNewPayableInvoiceSelect({
  id,
  label,
  value,
  onChange,
  currencyFilter,
  disabled,
  required,
  listSize = 8,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (invoiceId: string, invoice: AccountingNewPayableInvoiceListItem | null) => void;
  currencyFilter?: string;
  disabled?: boolean;
  required?: boolean;
  listSize?: number;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const locale = getAccountingNewLocale(language);
  const hintId = useId();
  const [invoices, setInvoices] = useState<AccountingNewPayableInvoiceListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInvoices() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const items = await listAccountingNewPayableInvoices({
          currency: currencyFilter,
        });
        if (cancelled) {
          return;
        }
        setInvoices(items);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setInvoices([]);
        setLoadError(
          error instanceof AccountingNewRequestError
            ? translateAccountingNewApiError(t, error.apiError)
            : t.bankWrite.payableInvoiceSelectLoadError,
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadInvoices();

    return () => {
      cancelled = true;
    };
  }, [currencyFilter, t]);

  const selectedInvoice = invoices.find((item) => String(item.id) === value) ?? null;
  const isDisabled = disabled || isLoading || Boolean(loadError) || invoices.length === 0;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        aria-describedby={selectedInvoice ? hintId : undefined}
        aria-label={label}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isDisabled}
        required={required}
        size={Math.min(listSize, Math.max(invoices.length, 1))}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          const invoice = invoices.find((item) => String(item.id) === nextValue) ?? null;
          onChange(nextValue, invoice);
        }}
      >
        {isLoading ? (
          <option value="">{t.bankWrite.payableInvoiceSelectLoading}</option>
        ) : invoices.length === 0 ? (
          <option value="">{t.bankWrite.payableInvoiceSelectEmpty}</option>
        ) : (
          <>
            <option value="">{t.bankWrite.recordPaymentInvoicePlaceholder}</option>
            {invoices.map((invoice) => (
              <option key={invoice.id} value={String(invoice.id)}>
                {formatPayableInvoiceLabel(invoice, t.bankWrite.payableInvoiceOption, locale)}
              </option>
            ))}
          </>
        )}
      </select>
      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}
      {!isLoading && !loadError && invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.bankWrite.payableInvoiceSelectEmpty}</p>
      ) : null}
      {selectedInvoice ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {formatPayableInvoiceLabel(selectedInvoice, t.bankWrite.payableInvoiceSelectedHint, locale)}
        </p>
      ) : null}
    </div>
  );
}
