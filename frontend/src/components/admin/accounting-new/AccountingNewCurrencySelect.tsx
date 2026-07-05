"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_CURRENCY_IDS, type AccountingNewCurrencyId } from "@/lib/accountingNewCurrencies";

export function AccountingNewCurrencySelect({
  id,
  label,
  value,
  onChange,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: AccountingNewCurrencyId) => void;
  required?: boolean;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const selected = ACCOUNTING_NEW_CURRENCY_IDS.includes(value as AccountingNewCurrencyId)
    ? (value as AccountingNewCurrencyId)
    : "CZK";

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={selected}
        onValueChange={(nextValue) => onChange(nextValue as AccountingNewCurrencyId)}
        required={required}
      >
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue placeholder={t.currencies.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {ACCOUNTING_NEW_CURRENCY_IDS.map((currencyId) => (
            <SelectItem key={currencyId} value={currencyId}>
              {t.currencies[currencyId]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
