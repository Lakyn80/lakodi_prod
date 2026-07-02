"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccountingNewApiError, AccountingNewBankTransactionListItem } from "@/types/accountingNew";
import { ACCOUNTING_NEW_MATCH_CANDIDATES_DEFERRED_NOTE } from "@/lib/accountingNew";
import { AccountingNewMatchCandidatesList } from "@/components/admin/accounting-new/AccountingNewMatchCandidatesList";

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
  const matchedCount = countTransactionsByStatus(transactions, "matched");
  const ignoredCount = countTransactionsByStatus(transactions, "ignored");
  const openCount = transactions.length - matchedCount - ignoredCount;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Read-only</Badge>
          <Badge variant="outline">Párování plateb</Badge>
        </div>
        <div className="space-y-1">
          <CardTitle>Read-only matching přehled</CardTitle>
          <CardDescription>
            Tato sekce používá pouze bezpečné GET endpointy. Neobsahuje apply matching, reject, create payment ani import.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {authRequired ? (
          <Alert>
            <AlertTitle>Pro načtení matching přehledu je nutné přihlášení</AlertTitle>
            <AlertDescription>Bez admin session se read-only matching data nenačtou.</AlertDescription>
          </Alert>
        ) : null}

        {error && !authRequired ? (
          <Alert variant="destructive">
            <AlertTitle>Read-only matching přehled se nepodařilo načíst</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        {!authRequired && !error ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm text-muted-foreground">Matched</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{isLoading ? "…" : matchedCount}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm text-muted-foreground">Ignored</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{isLoading ? "…" : ignoredCount}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm text-muted-foreground">Open / unmatched</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{isLoading ? "…" : openCount}</p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
              Existing matches are available read-only per bank transaction detail through
              `GET /api/admin/invoices/bank-transactions/{'{id}'}/matches`.
            </div>

            <AccountingNewMatchCandidatesList deferredNote={ACCOUNTING_NEW_MATCH_CANDIDATES_DEFERRED_NOTE} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
