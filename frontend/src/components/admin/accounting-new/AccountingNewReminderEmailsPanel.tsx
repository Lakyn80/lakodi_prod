"use client";

import { useDeferredValue, useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { AccountingNewRequestError, listAccountingNewReminderEmails } from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewReminderEmailListItem } from "@/types/accountingNew";
import { AccountingNewReminderEmailsTable } from "@/components/admin/accounting-new/AccountingNewReminderEmailsTable";
import {
  formatAccountingNewTemplate,
  getAccountingNewLocale,
  translateAccountingNewApiError,
} from "@/components/admin/accounting-new/accountingNewFormat";

type ReminderEmailsState =
  | { status: "loading" }
  | { status: "ready"; emails: AccountingNewReminderEmailListItem[] }
  | { status: "auth"; error: AccountingNewApiError }
  | { status: "error"; error: AccountingNewApiError };

function normalizeFilterValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function matchesQuery(email: AccountingNewReminderEmailListItem, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [
    email.recipientEmail,
    email.subject,
    email.message,
    email.invoiceNumber,
    email.reminderType,
    email.status,
  ]
    .map(normalizeFilterValue)
    .join(" ");

  return haystack.includes(query);
}

export function AccountingNewReminderEmailsPanel() {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const locale = getAccountingNewLocale(language);
  const [state, setState] = useState<ReminderEmailsState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [reminderType, setReminderType] = useState("all");
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const controller = new AbortController();

    async function loadEmails() {
      setState({ status: "loading" });

      try {
        const emails = await listAccountingNewReminderEmails({}, { signal: controller.signal });
        setState({ status: "ready", emails });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof AccountingNewRequestError) {
          setState(
            error.apiError.requiresLogin
              ? { status: "auth", error: error.apiError }
              : { status: "error", error: error.apiError },
          );
          return;
        }

        setState({
          status: "error",
          error: {
            resource: "reminder-emails",
            message: error instanceof Error ? error.message : t.errors.reminderEmailsTitle,
            status: null,
            requiresLogin: false,
          },
        });
      }
    }

    void loadEmails();

    return () => controller.abort();
  }, [t.errors.reminderEmailsTitle]);

  const emails = state.status === "ready" ? state.emails : [];
  const statusOptions = Array.from(new Set(emails.map((email) => email.status))).sort((left, right) =>
    left.localeCompare(right, locale),
  );
  const typeOptions = Array.from(new Set(emails.map((email) => email.reminderType))).sort((left, right) =>
    left.localeCompare(right, locale),
  );

  const filteredEmails = emails.filter((email) => {
    if (!matchesQuery(email, normalizeFilterValue(deferredQuery))) {
      return false;
    }

    if (status !== "all" && email.status !== status) {
      return false;
    }

    if (reminderType !== "all" && email.reminderType !== reminderType) {
      return false;
    }

    return true;
  });

  const authRequired = state.status === "auth";
  const error = state.status === "auth" || state.status === "error" ? state.error : null;
  const isLoading = state.status === "loading";

  return (
    <Card id="reminder-emails" className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t.reminderEmails.badge}</Badge>
          <Badge variant="secondary">{t.common.readOnlyBadge}</Badge>
        </div>
        <div className="space-y-1">
          <CardTitle>{t.reminderEmails.title}</CardTitle>
          <CardDescription>{t.reminderEmails.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t.reminderEmails.readOnlyNote}</p>
        <p className="text-sm text-muted-foreground">{t.reminderEmails.aggregationNote}</p>

        {authRequired ? (
          <Alert>
            <AlertTitle>{t.auth.reminderEmailsTitle}</AlertTitle>
            <AlertDescription>{t.auth.reminderEmailsDescription}</AlertDescription>
          </Alert>
        ) : null}

        {error && state.status === "error" ? (
          <Alert variant="destructive">
            <AlertTitle>{t.errors.reminderEmailsTitle}</AlertTitle>
            <AlertDescription>{translateAccountingNewApiError(t, error)}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="reminder-emails-search">
              {t.reminderEmails.searchLabel}
            </label>
            <Input
              id="reminder-emails-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.reminderEmails.searchPlaceholder}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="reminder-emails-status">
              {t.reminderEmails.statusFilterLabel}
            </label>
            <select
              id="reminder-emails-status"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">{t.reminderEmails.statusAll}</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="reminder-emails-type">
              {t.reminderEmails.typeFilterLabel}
            </label>
            <select
              id="reminder-emails-type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={reminderType}
              onChange={(event) => setReminderType(event.target.value)}
            >
              <option value="all">{t.reminderEmails.typeAll}</option>
              {typeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {formatAccountingNewTemplate(t.reminderEmails.shownCount, { count: filteredEmails.length })}
        </p>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : filteredEmails.length > 0 ? (
          <AccountingNewReminderEmailsTable emails={filteredEmails} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {emails.length > 0 ? t.empty.reminderEmailsFiltered : t.empty.reminderEmails}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
