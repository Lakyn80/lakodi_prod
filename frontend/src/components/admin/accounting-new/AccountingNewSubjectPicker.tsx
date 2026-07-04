"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import {
  normalizeAccountingNewCompanyName,
  normalizeAccountingNewCustomerEmail,
  normalizeAccountingNewDic,
  normalizeAccountingNewIco,
} from "@/lib/accountingNewCustomerPersistence";
import type { AccountingNewSubjectSummary } from "@/types/accountingNew";
import { formatAccountingNewTemplate } from "@/components/admin/accounting-new/accountingNewFormat";

const MAX_PICKER_RESULTS = 20;

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase();
}

function matchesSubject(subject: AccountingNewSubjectSummary, query: string): boolean {
  if (!query) {
    return false;
  }

  const haystack = [
    subject.name,
    subject.email,
    subject.phone,
    subject.ico,
    subject.dic,
    subject.country,
  ]
    .map((value) => (value ?? "").toLowerCase())
    .join(" ");

  return haystack.includes(query);
}

export function AccountingNewSubjectPicker({
  subjects,
  selectedSubjectId,
  onSelect,
  onClear,
}: {
  subjects: AccountingNewSubjectSummary[];
  selectedSubjectId: string;
  onSelect: (subject: AccountingNewSubjectSummary) => void;
  onClear: () => void;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const selectedSubject = useMemo(
    () => subjects.find((subject) => String(subject.id) === selectedSubjectId) ?? null,
    [selectedSubjectId, subjects],
  );

  const normalizedQuery = normalizeQuery(deferredQuery);
  const filteredSubjects = useMemo(() => {
    if (!open) {
      return [];
    }

    if (!normalizedQuery) {
      return subjects.slice(0, MAX_PICKER_RESULTS);
    }

    return subjects.filter((subject) => matchesSubject(subject, normalizedQuery)).slice(0, MAX_PICKER_RESULTS);
  }, [normalizedQuery, open, subjects]);

  const showLimitedNotice = open && subjects.length > MAX_PICKER_RESULTS;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor="subjectPickerSearch">{t.customerPersistence.searchCustomers}</Label>
          <p className="text-sm text-muted-foreground">{t.customerPersistence.pickerDescription}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((current) => !current)}>
          {open ? t.customerPersistence.hideCustomers : t.customerPersistence.showCustomers}
        </Button>
      </div>

      {selectedSubject ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="font-medium text-foreground">{selectedSubject.name}</p>
          <p className="text-muted-foreground">
            {selectedSubject.ico ? `IČO ${selectedSubject.ico}` : null}
            {selectedSubject.ico && selectedSubject.email ? " · " : null}
            {selectedSubject.email}
          </p>
          <Button type="button" variant="link" className="h-auto p-0" onClick={onClear}>
            {t.aresWrite.clearSubjectLink}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t.documentWrite.fields.subjectNone}</p>
      )}

      {open ? (
        <div className="space-y-3">
          <Input
            id="subjectPickerSearch"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.subjects.searchPlaceholder}
            aria-label={t.subjects.searchLabel}
          />

          {showLimitedNotice ? (
            <p className="text-xs text-muted-foreground">{t.customerPersistence.limitedResultsShown}</p>
          ) : null}

          {filteredSubjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.customerPersistence.noCustomersFound}</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {filteredSubjects.map((subject) => (
                <button
                  key={subject.id}
                  type="button"
                  className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:border-primary/50"
                  onClick={() => {
                    onSelect(subject);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <p className="font-medium text-foreground">{subject.name}</p>
                  <p className="text-muted-foreground">
                    {[subject.ico, subject.dic, subject.email].filter(Boolean).join(" · ")}
                  </p>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{formatAccountingNewTemplate(t.subjects.shownCount, { count: subjects.length })}</span>
            <Link href={`${ACCOUNTING_NEW_ROUTE}/odberatele/novy`} className="text-primary underline-offset-4 hover:underline">
              {t.subjectWrite.actions.createSubject}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function filterSubjectsForPicker(subjects: AccountingNewSubjectSummary[], query: string): AccountingNewSubjectSummary[] {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return subjects.slice(0, MAX_PICKER_RESULTS);
  }

  return subjects
    .filter((subject) => {
      const haystack = [
        subject.name,
        subject.email,
        subject.phone,
        normalizeAccountingNewIco(subject.ico),
        normalizeAccountingNewDic(subject.dic),
        normalizeAccountingNewCompanyName(subject.name),
        normalizeAccountingNewCustomerEmail(subject.email),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    })
    .slice(0, MAX_PICKER_RESULTS);
}
