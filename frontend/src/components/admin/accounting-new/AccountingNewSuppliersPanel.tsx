"use client";

import { useDeferredValue, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountingNewApiError, AccountingNewSupplierListItem } from "@/types/accountingNew";
import { AccountingNewSuppliersTable } from "@/components/admin/accounting-new/AccountingNewSuppliersTable";

function normalizeFilterValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function matchesQuery(supplier: AccountingNewSupplierListItem, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [
    supplier.name,
    supplier.email,
    supplier.phone,
    supplier.ico,
    supplier.dic,
    supplier.country,
  ]
    .map(normalizeFilterValue)
    .join(" ");

  return haystack.includes(query);
}

export function AccountingNewSuppliersPanel({
  suppliers,
  isLoading,
  authRequired,
  error,
}: {
  suppliers: AccountingNewSupplierListItem[];
  isLoading: boolean;
  authRequired: boolean;
  error: AccountingNewApiError | null;
}) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("all");
  const deferredQuery = useDeferredValue(query);

  const countryOptions = Array.from(new Set(suppliers.map((supplier) => supplier.country).filter(Boolean) as string[])).sort(
    (left, right) => left.localeCompare(right, "cs"),
  );

  const filteredSuppliers = suppliers.filter((supplier) => {
    if (!matchesQuery(supplier, normalizeFilterValue(deferredQuery))) {
      return false;
    }

    if (country !== "all" && supplier.country !== country) {
      return false;
    }

    return true;
  });

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Read-only</Badge>
          <Badge variant="outline">Dodavatelé</Badge>
        </div>
        <div className="space-y-1">
          <CardTitle>Read-only registr dodavatelů</CardTitle>
          <CardDescription>
            Přehled používá pouze GET endpointy. Neobsahuje žádné create, edit ani delete akce.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {authRequired ? (
          <Alert>
            <AlertTitle>Pro načtení dodavatelů je nutné přihlášení</AlertTitle>
            <AlertDescription>
              Bez admin session se read-only seznam dodavatelů nenačte. Legacy `/admin/invoices` tím zůstává beze změny.
            </AlertDescription>
          </Alert>
        ) : null}

        {error && !authRequired ? (
          <Alert variant="destructive">
            <AlertTitle>Read-only seznam dodavatelů se nepodařilo načíst</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        {!authRequired && !error ? (
          <>
            <div className="grid gap-3 md:grid-cols-[2fr,1fr]">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Hledat podle názvu, e-mailu, telefonu, IČO nebo DIČ"
                aria-label="Hledat dodavatele"
              />

              <select
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label="Filtrovat podle země dodavatele"
              >
                <option value="all">Všechny země</option>
                {countryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{filteredSuppliers.length} zobrazených dodavatelů</span>
              <span>·</span>
              <span>detail vede pouze do nové paralelní route `/admin/ucetnictvi-new/dodavatele/[id]`</span>
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

        {!isLoading && !authRequired && !error && filteredSuppliers.length > 0 ? (
          <AccountingNewSuppliersTable suppliers={filteredSuppliers} />
        ) : null}

        {!isLoading && !authRequired && !error && suppliers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            Backend zatím nevrátil žádné read-only dodavatele. Nová paralelní sekce přesto zůstává připravená bez zásahu do starého invoicing UI.
          </div>
        ) : null}

        {!isLoading && !authRequired && !error && suppliers.length > 0 && filteredSuppliers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            Aktuální filtry nevrátily žádného dodavatele. Zkuste upravit hledání nebo vrátit filtry na `Všechny`.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
