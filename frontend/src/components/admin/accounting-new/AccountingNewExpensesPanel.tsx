"use client";

import { useDeferredValue, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountingNewApiError, AccountingNewExpenseListItem } from "@/types/accountingNew";
import { AccountingNewExpensesTable } from "@/components/admin/accounting-new/AccountingNewExpensesTable";

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
}: {
  expenses: AccountingNewExpenseListItem[];
  isLoading: boolean;
  authRequired: boolean;
  error: AccountingNewApiError | null;
}) {
  const [query, setQuery] = useState("");
  const [expenseStatus, setExpenseStatus] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const deferredQuery = useDeferredValue(query);

  const expenseStatusOptions = Array.from(new Set(expenses.map((expense) => expense.status))).sort((left, right) =>
    left.localeCompare(right, "cs"),
  );
  const paymentStatusOptions = Array.from(new Set(expenses.map((expense) => expense.paymentStatus))).sort((left, right) =>
    left.localeCompare(right, "cs"),
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
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Read-only</Badge>
          <Badge variant="outline">Výdaje</Badge>
        </div>
        <div className="space-y-1">
          <CardTitle>Read-only přijaté doklady a výdaje</CardTitle>
          <CardDescription>
            Přehled používá pouze bezpečné GET endpointy. Neobsahuje create, edit, delete, apply payment ani importní akce.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {authRequired ? (
          <Alert>
            <AlertTitle>Pro načtení výdajů je nutné přihlášení</AlertTitle>
            <AlertDescription>
              Bez aktivní admin session se read-only seznam výdajů nenačte. Původní issued invoices v `/admin/invoices` tím zůstávají nedotčené.
            </AlertDescription>
          </Alert>
        ) : null}

        {error && !authRequired ? (
          <Alert variant="destructive">
            <AlertTitle>Read-only seznam výdajů se nepodařilo načíst</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        {!authRequired && !error ? (
          <>
            <div className="grid gap-3 md:grid-cols-[2fr,1fr,1fr]">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Hledat podle čísla, VS, dodavatele, IČO nebo DIČ"
                aria-label="Hledat výdaje"
              />

              <select
                value={expenseStatus}
                onChange={(event) => setExpenseStatus(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label="Filtrovat podle stavu výdaje"
              >
                <option value="all">Všechny stavy výdaje</option>
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
                aria-label="Filtrovat podle stavu platby výdaje"
              >
                <option value="all">Všechny stavy platby</option>
                {paymentStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{filteredExpenses.length} zobrazených výdajů</span>
              <span>·</span>
              <span>detail vede pouze do nové paralelní route `/admin/ucetnictvi-new/vydaje/[id]`</span>
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

        {!isLoading && !authRequired && !error && filteredExpenses.length > 0 ? (
          <AccountingNewExpensesTable expenses={filteredExpenses} />
        ) : null}

        {!isLoading && !authRequired && !error && expenses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            Backend zatím nevrátil žádné read-only výdaje. Nová paralelní sekce přesto zůstává bezpečná a staré vydané faktury v `/admin/invoices` se nemění.
          </div>
        ) : null}

        {!isLoading && !authRequired && !error && expenses.length > 0 && filteredExpenses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            Aktuální filtry nevrátily žádný výdaj. Zkuste upravit hledání nebo vrátit filtry na `Všechny`.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
