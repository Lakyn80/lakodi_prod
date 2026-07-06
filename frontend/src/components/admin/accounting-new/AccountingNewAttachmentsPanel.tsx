"use client";

import { useDeferredValue, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import type { AccountingNewApiError, AccountingNewAttachmentListItem } from "@/types/accountingNew";
import { AccountingNewAttachmentsTable } from "@/components/admin/accounting-new/AccountingNewAttachmentsTable";
import {
  formatAccountingNewTemplate,
  getAccountingNewLocale,
  translateAccountingNewApiError,
  translateAccountingNewAttachmentType,
} from "@/components/admin/accounting-new/accountingNewFormat";

function normalizeFilterValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function matchesQuery(attachment: AccountingNewAttachmentListItem, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [
    attachment.originalFilename,
    attachment.contentType,
    attachment.attachmentType,
    attachment.status,
    attachment.note,
    attachment.checksumSha256,
  ]
    .map(normalizeFilterValue)
    .join(" ");

  return haystack.includes(query);
}

export function AccountingNewAttachmentsPanel({
  attachments,
  isLoading,
  authRequired,
  error,
}: {
  attachments: AccountingNewAttachmentListItem[];
  isLoading: boolean;
  authRequired: boolean;
  error: AccountingNewApiError | null;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const locale = getAccountingNewLocale(language);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [attachmentType, setAttachmentType] = useState("all");
  const deferredQuery = useDeferredValue(query);

  const statusOptions = Array.from(new Set(attachments.map((item) => item.status))).sort((left, right) =>
    left.localeCompare(right, locale),
  );
  const typeOptions = Array.from(new Set(attachments.map((item) => item.attachmentType))).sort((left, right) =>
    left.localeCompare(right, locale),
  );

  const filteredAttachments = attachments.filter((attachment) => {
    if (!matchesQuery(attachment, normalizeFilterValue(deferredQuery))) {
      return false;
    }

    if (status !== "all" && attachment.status !== status) {
      return false;
    }

    if (attachmentType !== "all" && attachment.attachmentType !== attachmentType) {
      return false;
    }

    return true;
  });

  return (
    <Card id="attachments" className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t.attachments.badge}</Badge>
        </div>
        <div className="space-y-1">
          <CardTitle>{t.attachments.title}</CardTitle>
          <CardDescription>{t.attachments.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {authRequired ? (
          <Alert>
            <AlertTitle>{t.auth.attachmentsTitle}</AlertTitle>
            <AlertDescription>{t.auth.attachmentsDescription}</AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{t.errors.attachmentsTitle}</AlertTitle>
            <AlertDescription>{translateAccountingNewApiError(t, error)}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="attachments-search">
              {t.attachments.searchLabel}
            </label>
            <Input
              id="attachments-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.attachments.searchPlaceholder}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="attachments-status">
              {t.attachments.statusFilterLabel}
            </label>
            <select
              id="attachments-status"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">{t.attachments.statusAll}</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="attachments-type">
              {t.attachments.typeFilterLabel}
            </label>
            <select
              id="attachments-type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={attachmentType}
              onChange={(event) => setAttachmentType(event.target.value)}
            >
              <option value="all">{t.attachments.typeAll}</option>
              {typeOptions.map((option) => (
                <option key={option} value={option}>
                  {translateAccountingNewAttachmentType(t, option)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {formatAccountingNewTemplate(t.attachments.shownCount, { count: filteredAttachments.length })}
        </p>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : filteredAttachments.length > 0 ? (
          <AccountingNewAttachmentsTable attachments={filteredAttachments} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {attachments.length > 0 ? t.empty.attachmentsFiltered : t.empty.attachments}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
