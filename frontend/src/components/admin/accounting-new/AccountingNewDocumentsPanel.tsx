"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewDocumentListItem } from "@/types/accountingNew";
import { AccountingNewDocumentsTable } from "@/components/admin/accounting-new/AccountingNewDocumentsTable";
import {
  formatAccountingNewTemplate,
  getAccountingNewLocale,
  translateAccountingNewApiError,
  translateAccountingNewDocumentKind,
  translateAccountingNewStatus,
} from "@/components/admin/accounting-new/accountingNewFormat";

const MAX_VISIBLE_DOCUMENTS = 20;

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
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [documentKind, setDocumentKind] = useState("all");
  const [effectiveStatus, setEffectiveStatus] = useState("all");
  const deferredQuery = useDeferredValue(query);
  const locale = getAccountingNewLocale(language);

  const kindOptions = Array.from(new Set(documents.map((document) => document.documentKind))).sort((left, right) =>
    left.localeCompare(right, locale),
  );
  const effectiveStatusOptions = Array.from(new Set(documents.map((document) => document.effectiveStatus))).sort(
    (left, right) => left.localeCompare(right, locale),
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

  const visibleDocuments = filteredDocuments.slice(0, MAX_VISIBLE_DOCUMENTS);
  const hasMoreResults = filteredDocuments.length > MAX_VISIBLE_DOCUMENTS;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{t.documentWrite.badgeFunctional}</Badge>
          <Badge variant="outline">{t.documents.badge}</Badge>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle>{t.documents.title}</CardTitle>
            <CardDescription>{t.documents.description}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((current) => !current)}>
              {expanded ? t.documents.hideDocuments : t.documents.showDocuments}
            </Button>
            <Button asChild>
              <Link href={`${ACCOUNTING_NEW_ROUTE}/doklady/novy`}>{t.documentWrite.actions.createDocument}</Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {formatAccountingNewTemplate(t.documents.listCollapsed, { count: documents.length })}
        </p>

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

        {expanded && !authRequired && !error ? (
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
                    {translateAccountingNewDocumentKind(t, option)}
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
                    {translateAccountingNewStatus(t, option)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{formatAccountingNewTemplate(t.documents.shownCount, { count: visibleDocuments.length })}</span>
              <span>·</span>
              <span>{t.documents.detailRouteHint}</span>
            </div>

            {hasMoreResults ? (
              <p className="text-xs text-muted-foreground">{t.documents.tooManyUseSearch}</p>
            ) : null}
          </>
        ) : null}

        {isLoading && expanded ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : null}

        {expanded && !isLoading && !authRequired && !error && visibleDocuments.length > 0 ? (
          <AccountingNewDocumentsTable documents={visibleDocuments} />
        ) : null}

        {expanded && !isLoading && !authRequired && !error && documents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">{t.empty.documents}</div>
        ) : null}

        {expanded && !isLoading && !authRequired && !error && documents.length > 0 && visibleDocuments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t.empty.documentsFiltered}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
