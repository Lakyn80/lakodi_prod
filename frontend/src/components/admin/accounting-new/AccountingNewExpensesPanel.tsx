"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";

import { useAccountingNewCollapsibleList } from "@/components/admin/accounting-new/useAccountingNewCollapsibleList";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewExpenseListItem } from "@/types/accountingNew";
import { AccountingNewExpensesTable } from "@/components/admin/accounting-new/AccountingNewExpensesTable";
import {
  formatAccountingNewTemplate,
  getAccountingNewLocale,
  translateAccountingNewApiError,
} from "@/components/admin/accounting-new/accountingNewFormat";

function normalizeFilterValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function matchesQuery(expense: AccountingNewExpenseListItem, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [
    expense.expenseNumber,
    expense.variableSymbol,
    expense.supplierName,
    expense.supplierEmail,
    expense.supplierIco,
    expense.supplierDic,
  ]
    .map(normalizeFilterValue)
    .join(" ");

  return haystack.includes(query);
}

export function AccountingNewExpensesPanel({
  expenses,
  isLoading,
  authRequired,
  error,
  defaultExpanded = false,
}: {
  expenses: AccountingNewExpenseListItem[];
  isLoading: boolean;
  authRequired: boolean;
  error: AccountingNewApiError | null;
  defaultExpanded?: boolean;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const locale = getAccountingNewLocale(language);
  const { expanded, toggle, isContentVisible } = useAccountingNewCollapsibleList(defaultExpanded);
  const [query, setQuery] = useState("");
  const [expenseStatus, setExpenseStatus] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const deferredQuery = useDeferredValue(query);
  const contentVisible = isContentVisible(authRequired, error);

  const expenseStatusOptions = Array.from(new Set(expenses.map((expense) => expense.status))).sort((left, right) =>
    left.localeCompare(right, locale),
  );
  const paymentStatusOptions = Array.from(new Set(expenses.map((expense) => expense.paymentStatus))).sort((left, right) =>
    left.localeCompare(right, locale),
  );

  const filteredExpenses = expenses.filter((expense) => {
    if (!matchesQuery(expense, normalizeFilterValue(deferredQuery))) {
      return false;
    }

    if (expenseStatus !== "all" && expense.status !== expenseStatus) {
      return false;
    }

    if (paymentStatus !== "all" && expense.paymentStatus !== paymentStatus) {
      return false;
    }

    return true;
  });

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t.expenseWrite.badgeFunctional}</Badge>
            <Badge variant="outline">{t.expenses.badge}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={toggle}>
              {expanded ? t.expenses.hideList : t.expenses.showList}
            </Button>
            <Button asChild>
              <Link href={`${ACCOUNTING_NEW_ROUTE}/vydaje/novy`}>{t.expenseWrite.actions.createExpense}</Link>
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <CardTitle>{t.expenses.title}</CardTitle>
          <CardDescription>{t.expenses.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {formatAccountingNewTemplate(t.expenses.listCollapsed, { count: expenses.length })}
        </p>

        {authRequired ? (
          <Alert>
            <AlertTitle>{t.auth.expensesTitle}</AlertTitle>
            <AlertDescription>{t.auth.expensesDescription}</AlertDescription>
          </Alert>
        ) : null}

        {error && !authRequired ? (
          <Alert variant="destructive">
            <AlertTitle>{t.errors.expensesTitle}</AlertTitle>
            <AlertDescription>{translateAccountingNewApiError(t, error)}</AlertDescription>
          </Alert>
        ) : null}

        {contentVisible ? (
          <>
            <div className="grid gap-3 md:grid-cols-[2fr,1fr,1fr]">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.expenses.searchPlaceholder}
                aria-label={t.expenses.searchLabel}
              />

              <select
                value={expenseStatus}
                onChange={(event) => setExpenseStatus(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label={t.expenses.expenseStatusLabel}
              >
                <option value="all">{t.expenses.expenseStatusAll}</option>
                {expenseStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <select
                value={paymentStatus}
                onChange={(event) => setPaymentStatus(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label={t.expenses.paymentStatusLabel}
              >
                <option value="all">{t.expenses.paymentStatusAll}</option>
                {paymentStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{formatAccountingNewTemplate(t.expenses.shownCount, { count: filteredExpenses.length })}</span>
              <span>·</span>
              <span>{t.expenses.detailRouteHint}</span>
            </div>
          </>
        ) : null}

        {isLoading && contentVisible ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : null}

        {contentVisible && !isLoading && filteredExpenses.length > 0 ? (
          <AccountingNewExpensesTable expenses={filteredExpenses} />
        ) : null}

        {contentVisible && !isLoading && expenses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t.empty.expenses}
          </div>
        ) : null}

        {contentVisible && !isLoading && expenses.length > 0 && filteredExpenses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t.empty.expensesFiltered}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
