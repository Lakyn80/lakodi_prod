"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import type { AccountingNewApiError, AccountingNewBankTransactionListItem } from "@/types/accountingNew";
import { AccountingNewMatchCandidatesList } from "@/components/admin/accounting-new/AccountingNewMatchCandidatesList";
import { translateAccountingNewApiError } from "@/components/admin/accounting-new/accountingNewFormat";

function countTransactionsByStatus(transactions: AccountingNewBankTransactionListItem[], status: string): number {
  return transactions.filter((transaction) => transaction.status === status).length;
}

export function AccountingNewPaymentMatchesPanel({
  transactions,
  isLoading,
  authRequired,
  error,
}: {
  transactions: AccountingNewBankTransactionListItem[];
  isLoading: boolean;
  authRequired: boolean;
  error: AccountingNewApiError | null;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const matchedCount = countTransactionsByStatus(transactions, "matched");
  const ignoredCount = countTransactionsByStatus(transactions, "ignored");
  const openCount = transactions.length - matchedCount - ignoredCount;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t.paymentMatching.badge}</Badge>
        </div>
        <div className="space-y-1">
          <CardTitle>{t.paymentMatching.title}</CardTitle>
          <CardDescription>{t.paymentMatching.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {authRequired ? (
          <Alert>
            <AlertTitle>{t.auth.paymentMatchingTitle}</AlertTitle>
            <AlertDescription>{t.auth.paymentMatchingDescription}</AlertDescription>
          </Alert>
        ) : null}

        {error && !authRequired ? (
          <Alert variant="destructive">
            <AlertTitle>{t.errors.paymentMatchingTitle}</AlertTitle>
            <AlertDescription>{translateAccountingNewApiError(t, error)}</AlertDescription>
          </Alert>
        ) : null}

        {!authRequired && !error ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm text-muted-foreground">{t.paymentMatching.matchedTitle}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{isLoading ? "…" : matchedCount}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm text-muted-foreground">{t.paymentMatching.ignoredTitle}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{isLoading ? "…" : ignoredCount}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm text-muted-foreground">{t.paymentMatching.openTitle}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{isLoading ? "…" : openCount}</p>
              </div>
            </div>

            <AccountingNewMatchCandidatesList deferredNote={t.paymentMatching.deferredDescription} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
