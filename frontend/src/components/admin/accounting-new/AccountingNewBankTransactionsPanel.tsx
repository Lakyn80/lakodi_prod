"use client";

import { useDeferredValue, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountingNewApiError, AccountingNewBankTransactionListItem } from "@/types/accountingNew";
import { AccountingNewBankTransactionsTable } from "@/components/admin/accounting-new/AccountingNewBankTransactionsTable";

function normalizeFilterValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function matchesQuery(transaction: AccountingNewBankTransactionListItem, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [
    transaction.externalId,
    transaction.counterpartyName,
    transaction.counterpartyAccount,
    transaction.counterpartyIban,
    transaction.variableSymbol,
    transaction.message,
    transaction.status,
    transaction.direction,
  ]
    .map(normalizeFilterValue)
    .join(" ");

  return haystack.includes(query);
}

export function AccountingNewBankTransactionsPanel({
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
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState("all");
  const [status, setStatus] = useState("all");
  const deferredQuery = useDeferredValue(query);

  const directionOptions = Array.from(new Set(transactions.map((transaction) => transaction.direction))).sort((left, right) =>
    left.localeCompare(right, "cs"),
  );
  const statusOptions = Array.from(new Set(transactions.map((transaction) => transaction.status))).sort((left, right) =>
    left.localeCompare(right, "cs"),
  );

  const filteredTransactions = transactions.filter((transaction) => {
    if (!matchesQuery(transaction, normalizeFilterValue(deferredQuery))) {
      return false;
    }

    if (direction !== "all" && transaction.direction !== direction) {
      return false;
    }

    if (status !== "all" && transaction.status !== status) {
      return false;
    }

    return true;
  });

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Read-only</Badge>
          <Badge variant="outline">Bankovní transakce</Badge>
        </div>
        <div className="space-y-1">
          <CardTitle>Read-only bankovní transakce</CardTitle>
          <CardDescription>
            Přehled používá pouze bezpečné GET endpointy. Neobsahuje import, upload, apply matching ani jiné write akce.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {authRequired ? (
          <Alert>
            <AlertTitle>Pro načtení bankovních transakcí je nutné přihlášení</AlertTitle>
            <AlertDescription>Bez aktivní admin session se read-only bankovní transakce nenačtou.</AlertDescription>
          </Alert>
        ) : null}

        {error && !authRequired ? (
          <Alert variant="destructive">
            <AlertTitle>Read-only seznam bankovních transakcí se nepodařilo načíst</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        {!authRequired && !error ? (
          <>
            <div className="grid gap-3 md:grid-cols-[2fr,1fr,1fr]">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Hledat podle protistrany, účtu, VS, zprávy nebo stavu"
                aria-label="Hledat bankovní transakce"
              />

              <select
                value={direction}
                onChange={(event) => setDirection(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label="Filtrovat podle směru transakce"
              >
                <option value="all">Všechny směry</option>
                {directionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label="Filtrovat podle stavu transakce"
              >
                <option value="all">Všechny stavy</option>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{filteredTransactions.length} zobrazených bankovních transakcí</span>
              <span>·</span>
              <span>detail vede pouze do nové paralelní route `/admin/ucetnictvi-new/bankovni-transakce/[id]`</span>
            </div>
          </>
        ) : null}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : null}

        {!isLoading && !authRequired && !error && filteredTransactions.length > 0 ? (
          <AccountingNewBankTransactionsTable transactions={filteredTransactions} />
        ) : null}

        {!isLoading && !authRequired && !error && transactions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            Backend zatím nevrátil žádné read-only bankovní transakce. Nová paralelní sekce přesto zůstává bezpečná a bez importních akcí.
          </div>
        ) : null}

        {!isLoading && !authRequired && !error && transactions.length > 0 && filteredTransactions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            Aktuální filtry nevrátily žádnou bankovní transakci. Zkuste upravit hledání nebo vrátit filtry na `Všechny`.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
