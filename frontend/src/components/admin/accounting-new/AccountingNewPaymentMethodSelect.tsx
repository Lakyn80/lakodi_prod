"use client";

import { Label } from "@/components/ui/label";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ACCOUNTING_NEW_PAYMENT_METHOD_IDS,
  backendPaymentMethodToId,
  type AccountingNewPaymentMethodId,
} from "@/lib/accountingNewPaymentMethods";

export function AccountingNewPaymentMethodSelect({
  id,
  label,
  value,
  onChange,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: AccountingNewPaymentMethodId) => void;
  required?: boolean;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const selectedId = backendPaymentMethodToId(value);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={selectedId}
        onChange={(event) => onChange(event.target.value as AccountingNewPaymentMethodId)}
        required={required}
      >
        {ACCOUNTING_NEW_PAYMENT_METHOD_IDS.map((methodId) => (
          <option key={methodId} value={methodId}>
            {t.paymentMethods[methodId]}
          </option>
        ))}
      </select>
    </div>
  );
}
