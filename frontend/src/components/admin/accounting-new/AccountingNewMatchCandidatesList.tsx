"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import type { AccountingNewPaymentMatchCandidate } from "@/types/accountingNew";
import { formatAccountingNewTemplate } from "@/components/admin/accounting-new/accountingNewFormat";

export function AccountingNewMatchCandidatesList({
  candidates,
  deferredNote,
}: {
  candidates?: AccountingNewPaymentMatchCandidate[];
  deferredNote: string;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;

  if (!candidates || candidates.length === 0) {
    return (
      <Alert>
        <AlertTitle>{t.paymentMatching.deferredTitle}</AlertTitle>
        <AlertDescription>{deferredNote}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {candidates.map((candidate) => (
        <div key={candidate.id} className="rounded-lg border border-border bg-background p-4">
          <p className="font-medium text-foreground">{candidate.label}</p>
          <p className="mt-2 text-sm text-muted-foreground">{candidate.reason ?? t.common.noReason}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {candidate.confidence !== null
              ? formatAccountingNewTemplate("{label} {value}", {
                  label: t.paymentMatching.table.confidence,
                  value: candidate.confidence,
                })
              : t.common.noValue}
          </p>
        </div>
      ))}
    </div>
  );
}
