"use client";

import { useDeferredValue, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import type { AccountingNewApiError, AccountingNewAttachmentInboxItem } from "@/types/accountingNew";
import { AccountingNewAttachmentInboxTable } from "@/components/admin/accounting-new/AccountingNewAttachmentInboxTable";
import {
  formatAccountingNewTemplate,
  getAccountingNewLocale,
  translateAccountingNewApiError,
} from "@/components/admin/accounting-new/accountingNewFormat";

function normalizeFilterValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function matchesQuery(attachment: AccountingNewAttachmentInboxItem, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [attachment.originalFilename, attachment.contentType, attachment.attachmentType, attachment.status]
    .map(normalizeFilterValue)
    .join(" ");

  return haystack.includes(query);
}

export function AccountingNewAttachmentInboxPanel({
  attachments,
  isLoading,
  authRequired,
  error,
}: {
  attachments: AccountingNewAttachmentInboxItem[];
  isLoading: boolean;
  authRequired: boolean;
  error: AccountingNewApiError | null;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const locale = getAccountingNewLocale(language);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const filteredAttachments = attachments.filter((attachment) =>
    matchesQuery(attachment, normalizeFilterValue(deferredQuery)),
  );

  return (
    <Card id="attachment-inbox" className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t.attachmentInbox.badge}</Badge>
          <Badge variant="secondary">{t.common.readOnlyBadge}</Badge>
        </div>
        <div className="space-y-1">
          <CardTitle>{t.attachmentInbox.title}</CardTitle>
          <CardDescription>{t.attachmentInbox.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t.attachmentInbox.readOnlyNote}</p>
        <p className="text-sm text-muted-foreground">{t.attachmentInbox.apiNote}</p>

        {authRequired ? (
          <Alert>
            <AlertTitle>{t.auth.attachmentInboxTitle}</AlertTitle>
            <AlertDescription>{t.auth.attachmentInboxDescription}</AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{t.errors.attachmentInboxTitle}</AlertTitle>
            <AlertDescription>{translateAccountingNewApiError(t, error)}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="attachment-inbox-search">
            {t.attachmentInbox.searchLabel}
          </label>
          <Input
            id="attachment-inbox-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.attachmentInbox.searchPlaceholder}
          />
        </div>

        <p className="text-sm text-muted-foreground">
          {formatAccountingNewTemplate(t.attachmentInbox.shownCount, { count: filteredAttachments.length })}
        </p>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : filteredAttachments.length > 0 ? (
          <AccountingNewAttachmentInboxTable attachments={filteredAttachments} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {attachments.length > 0 ? t.empty.attachmentInboxFiltered : t.empty.attachmentInbox}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
