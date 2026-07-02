"use client";

import { useDeferredValue, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import type { AccountingNewApiError, AccountingNewDocumentListItem } from "@/types/accountingNew";
import { AccountingNewDocumentsTable } from "@/components/admin/accounting-new/AccountingNewDocumentsTable";
import {
  formatAccountingNewTemplate,
  getAccountingNewLocale,
  translateAccountingNewApiError,
} from "@/components/admin/accounting-new/accountingNewFormat";

function normalizeFilterValue(value: string): string {
  return value.trim().toLowerCase();
}

function matchesQuery(document: AccountingNewDocumentListItem, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [
    document.invoiceNumber,
    document.variableSymbol,
    document.customerName,
    document.customerEmail,
    document.documentKind,
  ]
    .map(normalizeFilterValue)
    .join(" ");

  return haystack.includes(query);
}

export function AccountingNewDocumentsPanel({
  documents,
  isLoading,
  authRequired,
  error,
}: {
  documents: AccountingNewDocumentListItem[];
  isLoading: boolean;
  authRequired: boolean;
  error: AccountingNewApiError | null;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [query, setQuery] = useState("");
  const [documentKind, setDocumentKind] = useState("all");
  const [effectiveStatus, setEffectiveStatus] = useState("all");
  const deferredQuery = useDeferredValue(query);
  const locale = getAccountingNewLocale(language);

  const kindOptions = Array.from(new Set(documents.map((document) => document.documentKind))).sort((left, right) =>
    left.localeCompare(right, locale),
  );
  const effectiveStatusOptions = Array.from(new Set(documents.map((document) => document.effectiveStatus))).sort((left, right) =>
    left.localeCompare(right, locale),
  );

  const filteredDocuments = documents.filter((document) => {
    if (!matchesQuery(document, normalizeFilterValue(deferredQuery))) {
      return false;
    }

    if (documentKind !== "all" && document.documentKind !== documentKind) {
      return false;
    }

    if (effectiveStatus !== "all" && document.effectiveStatus !== effectiveStatus) {
      return false;
    }

    return true;
  });

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{t.common.readOnly}</Badge>
          <Badge variant="outline">{t.documents.badge}</Badge>
        </div>
        <div className="space-y-1">
          <CardTitle>{t.documents.title}</CardTitle>
          <CardDescription>{t.documents.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {authRequired ? (
          <Alert>
            <AlertTitle>{t.auth.documentsTitle}</AlertTitle>
            <AlertDescription>{t.auth.documentsDescription}</AlertDescription>
          </Alert>
        ) : null}

        {error && !authRequired ? (
          <Alert variant="destructive">
            <AlertTitle>{t.errors.documentsTitle}</AlertTitle>
            <AlertDescription>{translateAccountingNewApiError(t, error)}</AlertDescription>
          </Alert>
        ) : null}

        {!authRequired && !error ? (
          <>
            <div className="grid gap-3 md:grid-cols-[2fr,1fr,1fr]">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.documents.searchPlaceholder}
                aria-label={t.documents.searchLabel}
              />

              <select
                value={documentKind}
                onChange={(event) => setDocumentKind(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label={t.documents.kindFilterLabel}
              >
                <option value="all">{t.documents.kindAll}</option>
                {kindOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <select
                value={effectiveStatus}
                onChange={(event) => setEffectiveStatus(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label={t.documents.statusFilterLabel}
              >
                <option value="all">{t.documents.statusAll}</option>
                {effectiveStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{formatAccountingNewTemplate(t.documents.shownCount, { count: filteredDocuments.length })}</span>
              <span>·</span>
              <span>
                {formatAccountingNewTemplate(t.documents.detailRouteHint, {
                  route: "/admin/ucetnictvi-new/doklady/[id]",
                })}
              </span>
            </div>
          </>
        ) : null}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : null}

        {!isLoading && !authRequired && !error && filteredDocuments.length > 0 ? (
          <AccountingNewDocumentsTable documents={filteredDocuments} />
        ) : null}

        {!isLoading && !authRequired && !error && documents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t.empty.documents}
          </div>
        ) : null}

        {!isLoading && !authRequired && !error && documents.length > 0 && filteredDocuments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t.empty.documentsFiltered}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
