"use client";

import { useDeferredValue, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import type { AccountingNewApiError, AccountingNewSupplierListItem } from "@/types/accountingNew";
import { AccountingNewSuppliersTable } from "@/components/admin/accounting-new/AccountingNewSuppliersTable";
import {
  formatAccountingNewTemplate,
  getAccountingNewLocale,
  translateAccountingNewApiError,
} from "@/components/admin/accounting-new/accountingNewFormat";

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
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const locale = getAccountingNewLocale(language);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("all");
  const deferredQuery = useDeferredValue(query);

  const countryOptions = Array.from(new Set(suppliers.map((supplier) => supplier.country).filter(Boolean) as string[])).sort(
    (left, right) => left.localeCompare(right, locale),
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
          <Badge variant="secondary">{t.common.readOnly}</Badge>
          <Badge variant="outline">{t.suppliers.badge}</Badge>
        </div>
        <div className="space-y-1">
          <CardTitle>{t.suppliers.title}</CardTitle>
          <CardDescription>{t.suppliers.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {authRequired ? (
          <Alert>
            <AlertTitle>{t.auth.suppliersTitle}</AlertTitle>
            <AlertDescription>{t.auth.suppliersDescription}</AlertDescription>
          </Alert>
        ) : null}

        {error && !authRequired ? (
          <Alert variant="destructive">
            <AlertTitle>{t.errors.suppliersTitle}</AlertTitle>
            <AlertDescription>{translateAccountingNewApiError(t, error)}</AlertDescription>
          </Alert>
        ) : null}

        {!authRequired && !error ? (
          <>
            <div className="grid gap-3 md:grid-cols-[2fr,1fr]">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.suppliers.searchPlaceholder}
                aria-label={t.suppliers.searchLabel}
              />

              <select
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label={t.suppliers.countryLabel}
              >
                <option value="all">{t.suppliers.countryAll}</option>
                {countryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{formatAccountingNewTemplate(t.suppliers.shownCount, { count: filteredSuppliers.length })}</span>
              <span>·</span>
              <span>
                {formatAccountingNewTemplate(t.suppliers.detailRouteHint, {
                  route: "/admin/ucetnictvi-new/dodavatele/[id]",
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

        {!isLoading && !authRequired && !error && filteredSuppliers.length > 0 ? (
          <AccountingNewSuppliersTable suppliers={filteredSuppliers} />
        ) : null}

        {!isLoading && !authRequired && !error && suppliers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t.empty.suppliers}
          </div>
        ) : null}

        {!isLoading && !authRequired && !error && suppliers.length > 0 && filteredSuppliers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t.empty.suppliersFiltered}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
