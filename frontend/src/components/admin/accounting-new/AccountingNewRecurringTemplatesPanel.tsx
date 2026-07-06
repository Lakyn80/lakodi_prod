"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import type {
  AccountingNewApiError,
  AccountingNewRecurringTemplateListItem,
  AccountingNewSubjectSummary,
  AccountingNewSupplierSummary,
} from "@/types/accountingNew";
import { AccountingNewRecurringTemplatesTable } from "@/components/admin/accounting-new/AccountingNewRecurringTemplatesTable";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import {
  formatAccountingNewTemplate,
  getAccountingNewLocale,
  translateAccountingNewApiError,
  translateAccountingNewRecurringKind,
  translateAccountingNewStatus,
} from "@/components/admin/accounting-new/accountingNewFormat";

function normalizeFilterValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function matchesQuery(
  template: AccountingNewRecurringTemplateListItem,
  query: string,
  subjectLabels: Record<number, string>,
  supplierLabels: Record<number, string>,
): boolean {
  if (!query) {
    return true;
  }

  const relatedParty =
    template.templateType === "invoice" && template.subjectId
      ? subjectLabels[template.subjectId]
      : template.templateType === "expense" && template.supplierId
        ? supplierLabels[template.supplierId]
        : "";

  const haystack = [
    template.name,
    template.templateType,
    template.documentKind,
    template.status,
    template.note,
    template.currency,
    relatedParty,
  ]
    .map(normalizeFilterValue)
    .join(" ");

  return haystack.includes(query);
}

export function AccountingNewRecurringTemplatesPanel({
  templates,
  subjects,
  suppliers,
  isLoading,
  authRequired,
  error,
}: {
  templates: AccountingNewRecurringTemplateListItem[];
  subjects: AccountingNewSubjectSummary[];
  suppliers: AccountingNewSupplierSummary[];
  isLoading: boolean;
  authRequired: boolean;
  error: AccountingNewApiError | null;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const locale = getAccountingNewLocale(language);
  const [query, setQuery] = useState("");
  const [templateType, setTemplateType] = useState("all");
  const [status, setStatus] = useState("all");
  const deferredQuery = useDeferredValue(query);

  const subjectLabels = useMemo(
    () => Object.fromEntries(subjects.map((subject) => [subject.id, subject.name])),
    [subjects],
  );
  const supplierLabels = useMemo(
    () => Object.fromEntries(suppliers.map((supplier) => [supplier.id, supplier.name])),
    [suppliers],
  );

  const typeOptions = Array.from(new Set(templates.map((template) => template.templateType))).sort((left, right) =>
    left.localeCompare(right, locale),
  );
  const statusOptions = Array.from(new Set(templates.map((template) => template.status))).sort((left, right) =>
    left.localeCompare(right, locale),
  );

  const filteredTemplates = templates.filter((template) => {
    if (!matchesQuery(template, normalizeFilterValue(deferredQuery), subjectLabels, supplierLabels)) {
      return false;
    }

    if (templateType !== "all" && template.templateType !== templateType) {
      return false;
    }

    if (status !== "all" && template.status !== status) {
      return false;
    }

    return true;
  });

  return (
    <Card id="recurring" className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t.recurring.badge}</Badge>
        </div>
        <div className="space-y-1">
          <CardTitle>{t.recurring.title}</CardTitle>
          <CardDescription>{t.recurring.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!authRequired ? (
          <Button asChild className="min-h-11">
            <Link href={`${ACCOUNTING_NEW_ROUTE}/opakovane/novy`}>{t.recurringForm.createAction}</Link>
          </Button>
        ) : null}

        {authRequired ? (
          <Alert>
            <AlertTitle>{t.auth.recurringTitle}</AlertTitle>
            <AlertDescription>{t.auth.recurringDescription}</AlertDescription>
          </Alert>
        ) : null}

        {error && !authRequired ? (
          <Alert variant="destructive">
            <AlertTitle>{t.errors.recurringTitle}</AlertTitle>
            <AlertDescription>{translateAccountingNewApiError(t, error)}</AlertDescription>
          </Alert>
        ) : null}

        {!authRequired && !error ? (
          <>
            <div className="grid gap-3 md:grid-cols-[2fr,1fr,1fr]">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.recurring.searchPlaceholder}
                aria-label={t.recurring.searchLabel}
              />
              <select
                value={templateType}
                onChange={(event) => setTemplateType(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label={t.recurring.typeFilterLabel}
              >
                <option value="all">{t.recurring.typeAll}</option>
                {typeOptions.map((option) => (
                  <option key={option} value={option}>
                    {translateAccountingNewRecurringKind(t, option)}
                  </option>
                ))}
              </select>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label={t.recurring.statusFilterLabel}
              >
                <option value="all">{t.recurring.statusAll}</option>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {translateAccountingNewStatus(t, option)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{formatAccountingNewTemplate(t.recurring.shownCount, { count: filteredTemplates.length })}</span>
              <span>·</span>
              <span>{t.recurring.detailRouteHint}</span>
            </div>
          </>
        ) : null}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : null}

        {!isLoading && !authRequired && !error && filteredTemplates.length > 0 ? (
          <AccountingNewRecurringTemplatesTable
            templates={filteredTemplates}
            subjectLabels={subjectLabels}
            supplierLabels={supplierLabels}
          />
        ) : null}

        {!isLoading && !authRequired && !error && templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t.empty.recurring}
          </div>
        ) : null}

        {!isLoading && !authRequired && !error && templates.length > 0 && filteredTemplates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t.empty.recurringFiltered}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
