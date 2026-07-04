"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { translateAccountingNewApiError } from "@/components/admin/accounting-new/accountingNewFormat";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import type { AccountingNewApiError } from "@/types/accountingNew";

export function AccountingNewMutationNotice({
  successMessage,
  error,
}: {
  successMessage?: string | null;
  error?: AccountingNewApiError | null;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;

  if (successMessage) {
    return (
      <Alert>
        <AlertTitle>{t.documentWrite.mutation.successTitle}</AlertTitle>
        <AlertDescription>{successMessage}</AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.documentWrite.mutation.errorTitle}</AlertTitle>
        <AlertDescription>{translateAccountingNewApiError(t, error)}</AlertDescription>
      </Alert>
    );
  }

  return null;
}
