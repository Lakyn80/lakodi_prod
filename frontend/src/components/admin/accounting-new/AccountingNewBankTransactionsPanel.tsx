"use client";

import { useDeferredValue, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import type { AccountingNewApiError, AccountingNewBankTransactionListItem } from "@/types/accountingNew";
import { AccountingNewBankTransactionsTable } from "@/components/admin/accounting-new/AccountingNewBankTransactionsTable";
import {
  formatAccountingNewTemplate,
  getAccountingNewLocale,
  translateAccountingNewApiError,
} from "@/components/admin/accounting-new/accountingNewFormat";

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
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const locale = getAccountingNewLocale(language);
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState("all");
  const [status, setStatus] = useState("all");
  const deferredQuery = useDeferredValue(query);

  const directionOptions = Array.from(new Set(transactions.map((transaction) => transaction.direction))).sort((left, right) =>
    left.localeCompare(right, locale),
  );
  const statusOptions = Array.from(new Set(transactions.map((transaction) => transaction.status))).sort((left, right) =>
    left.localeCompare(right, locale),
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
          <Badge variant="secondary">{t.common.readOnly}</Badge>
          <Badge variant="outline">{t.bankTransactions.badge}</Badge>
        </div>
        <div className="space-y-1">
          <CardTitle>{t.bankTransactions.title}</CardTitle>
          <CardDescription>{t.bankTransactions.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {authRequired ? (
          <Alert>
            <AlertTitle>{t.auth.bankTransactionsTitle}</AlertTitle>
            <AlertDescription>{t.auth.bankTransactionsDescription}</AlertDescription>
          </Alert>
        ) : null}

        {error && !authRequired ? (
          <Alert variant="destructive">
            <AlertTitle>{t.errors.bankTransactionsTitle}</AlertTitle>
            <AlertDescription>{translateAccountingNewApiError(t, error)}</AlertDescription>
          </Alert>
        ) : null}

        {!authRequired && !error ? (
          <>
            <div className="grid gap-3 md:grid-cols-[2fr,1fr,1fr]">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.bankTransactions.searchPlaceholder}
                aria-label={t.bankTransactions.searchLabel}
              />

              <select
                value={direction}
                onChange={(event) => setDirection(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label={t.bankTransactions.directionLabel}
              >
                <option value="all">{t.bankTransactions.directionAll}</option>
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
                aria-label={t.bankTransactions.statusLabel}
              >
                <option value="all">{t.bankTransactions.statusAll}</option>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{formatAccountingNewTemplate(t.bankTransactions.shownCount, { count: filteredTransactions.length })}</span>
              <span>·</span>
              <span>
                {formatAccountingNewTemplate(t.bankTransactions.detailRouteHint, {
                  route: "/admin/ucetnictvi-new/bankovni-transakce/[id]",
                })}
              </span>
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
            {t.empty.bankTransactions}
          </div>
        ) : null}

        {!isLoading && !authRequired && !error && transactions.length > 0 && filteredTransactions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t.empty.bankTransactionsFiltered}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
