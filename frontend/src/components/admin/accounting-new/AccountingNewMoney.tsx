"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { getAccountingNewLocale } from "@/components/admin/accounting-new/accountingNewFormat";

export function AccountingNewMoney({
  amount,
  currency,
  className,
}: {
  amount: number;
  currency: string;
  className?: string;
}) {
  const { language } = useLanguage();
  const normalizedCurrency = currency.trim().toUpperCase();
  const formatter =
    normalizedCurrency.length >= 3
      ? new Intl.NumberFormat(getAccountingNewLocale(language), {
          style: "currency",
          currency: normalizedCurrency,
          maximumFractionDigits: 2,
        })
      : new Intl.NumberFormat(getAccountingNewLocale(language), {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  const text =
    normalizedCurrency.length >= 3
      ? formatter.format(amount)
      : `${formatter.format(amount)} ${currency}`.trim();

  return <span className={className}>{text}</span>;
}
