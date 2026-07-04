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
import type { AccountingNewApiError, AccountingNewSubjectSummary } from "@/types/accountingNew";
import { AccountingNewSubjectsTable } from "@/components/admin/accounting-new/AccountingNewSubjectsTable";
import {
  formatAccountingNewTemplate,
  getAccountingNewLocale,
  translateAccountingNewApiError,
} from "@/components/admin/accounting-new/accountingNewFormat";

function normalizeFilterValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function matchesQuery(subject: AccountingNewSubjectSummary, query: string): boolean {
  if (!query) return true;
  const haystack = [subject.name, subject.email, subject.phone, subject.ico, subject.dic, subject.country]
    .map(normalizeFilterValue)
    .join(" ");
  return haystack.includes(query);
}

export function AccountingNewSubjectsPanel({
  subjects,
  isLoading,
  authRequired,
  error,
}: {
  subjects: AccountingNewSubjectSummary[];
  isLoading: boolean;
  authRequired: boolean;
  error: AccountingNewApiError | null;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const locale = getAccountingNewLocale(language);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const filteredSubjects = subjects.filter((subject) => matchesQuery(subject, normalizeFilterValue(deferredQuery)));

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t.subjectWrite.badgeFunctional}</Badge>
            <Badge variant="outline">{t.subjects.badge}</Badge>
          </div>
          <Button asChild>
            <Link href={`${ACCOUNTING_NEW_ROUTE}/odberatele/novy`}>{t.subjectWrite.actions.createSubject}</Link>
          </Button>
        </div>
        <div className="space-y-1">
          <CardTitle>{t.subjects.title}</CardTitle>
          <CardDescription>{t.subjects.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {authRequired ? (
          <Alert>
            <AlertTitle>{t.auth.subjectsTitle}</AlertTitle>
            <AlertDescription>{t.auth.subjectsDescription}</AlertDescription>
          </Alert>
        ) : null}

        {error && !authRequired ? (
          <Alert variant="destructive">
            <AlertTitle>{t.errors.subjectsTitle}</AlertTitle>
            <AlertDescription>{translateAccountingNewApiError(t, error)}</AlertDescription>
          </Alert>
        ) : null}

        {!authRequired && !error ? (
          <>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.subjects.searchPlaceholder}
              aria-label={t.subjects.searchLabel}
            />
            <div className="text-sm text-muted-foreground">
              {formatAccountingNewTemplate(t.subjects.shownCount, { count: filteredSubjects.length })}
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

        {!isLoading && !authRequired && !error && filteredSubjects.length > 0 ? (
          <AccountingNewSubjectsTable subjects={filteredSubjects} />
        ) : null}

        {!isLoading && !authRequired && !error && subjects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">{t.empty.subjects}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
