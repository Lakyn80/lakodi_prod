"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE, AccountingNewRequestError, listAccountingNewPaymentMatchesCatalog } from "@/lib/accountingNew";
import type {
  AccountingNewApiError,
  AccountingNewBankTransactionListItem,
  AccountingNewPaymentMatchDashboardItem,
} from "@/types/accountingNew";
import { AccountingNewPaymentMatchesTable } from "@/components/admin/accounting-new/AccountingNewPaymentMatchesTable";
import { translateAccountingNewApiError } from "@/components/admin/accounting-new/accountingNewFormat";

function countTransactionsByStatus(transactions: AccountingNewBankTransactionListItem[], status: string): number {
  return transactions.filter((transaction) => transaction.status === status).length;
}

export function AccountingNewPaymentMatchesPanel({
  transactions,
  isLoading: isDashboardLoading,
  authRequired,
  error: dashboardError,
  reloadKey = 0,
  onStateChanged,
}: {
  transactions: AccountingNewBankTransactionListItem[];
  isLoading: boolean;
  authRequired: boolean;
  error: AccountingNewApiError | null;
  reloadKey?: number;
  onStateChanged?: () => void;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const matchedCount = countTransactionsByStatus(transactions, "matched");
  const ignoredCount = countTransactionsByStatus(transactions, "ignored");
  const openCount = transactions.length - matchedCount - ignoredCount;

  const [matches, setMatches] = useState<AccountingNewPaymentMatchDashboardItem[]>([]);
  const [isMatchesLoading, setIsMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState<AccountingNewApiError | null>(null);

  useEffect(() => {
    if (authRequired || dashboardError) {
      setMatches([]);
      setMatchesError(null);
      setIsMatchesLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadMatches() {
      setIsMatchesLoading(true);
      setMatchesError(null);

      try {
        const items = await listAccountingNewPaymentMatchesCatalog({
          status: "suggested",
          limit: 100,
          offset: 0,
          signal: controller.signal,
        });
        setMatches(items);
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setMatches([]);
        setMatchesError(
          loadError instanceof AccountingNewRequestError
            ? loadError.apiError
            : {
                resource: "payment-matches-catalog",
                message: loadError instanceof Error ? loadError.message : t.errors.paymentMatchingTitle,
                status: null,
                requiresLogin: false,
              },
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsMatchesLoading(false);
        }
      }
    }

    void loadMatches();

    return () => controller.abort();
  }, [authRequired, dashboardError, reloadKey, t.errors.paymentMatchingTitle]);

  function handleMatchUpdated() {
    onStateChanged?.();
  }

  const showMatchesSection = !authRequired && !dashboardError;
  const isLoading = isDashboardLoading || isMatchesLoading;

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

        {dashboardError && !authRequired ? (
          <Alert variant="destructive">
            <AlertTitle>{t.errors.paymentMatchingTitle}</AlertTitle>
            <AlertDescription>{translateAccountingNewApiError(t, dashboardError)}</AlertDescription>
          </Alert>
        ) : null}

        {!authRequired && !dashboardError ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm text-muted-foreground">{t.paymentMatching.matchedTitle}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{isDashboardLoading ? "…" : matchedCount}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm text-muted-foreground">{t.paymentMatching.ignoredTitle}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{isDashboardLoading ? "…" : ignoredCount}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm text-muted-foreground">{t.paymentMatching.openTitle}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{isDashboardLoading ? "…" : openCount}</p>
              </div>
            </div>

            {showMatchesSection ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-foreground">{t.paymentMatching.suggestionsTitle}</h3>
                  <p className="text-sm text-muted-foreground">{t.paymentMatching.suggestionsDescription}</p>
                </div>

                {matchesError ? (
                  <Alert variant="destructive">
                    <AlertTitle>{t.errors.paymentMatchingTitle}</AlertTitle>
                    <AlertDescription>{translateAccountingNewApiError(t, matchesError)}</AlertDescription>
                  </Alert>
                ) : null}

                {isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton key={index} className="h-14 w-full" />
                    ))}
                  </div>
                ) : null}

                {!isLoading && !matchesError && matches.length > 0 ? (
                  <AccountingNewPaymentMatchesTable
                    matches={matches}
                    showTransactionContext
                    onMatchApplied={handleMatchUpdated}
                  />
                ) : null}

                {!isLoading && !matchesError && matches.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                    {t.empty.paymentMatchSuggestions}
                  </div>
                ) : null}

                <p className="text-xs text-muted-foreground">
                  {t.paymentMatching.detailRouteHint}{" "}
                  <Link href={`${ACCOUNTING_NEW_ROUTE}#bank-transactions`} className="underline underline-offset-4">
                    {t.navigation.bankTransactions}
                  </Link>
                </p>
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
