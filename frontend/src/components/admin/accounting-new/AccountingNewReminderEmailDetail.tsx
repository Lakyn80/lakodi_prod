"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ACCOUNTING_NEW_ROUTE,
  AccountingNewRequestError,
  getAccountingNewReminderEmail,
} from "@/lib/accountingNew";
import { getAccountingNewModuleRoute } from "@/lib/accountingNewModuleRoutes";
import type { AccountingNewReminderEmailDetailState } from "@/types/accountingNew";
import { AccountingNewTodoStatusBadge } from "@/components/admin/accounting-new/AccountingNewTodoStatusBadge";
import {
  formatAccountingNewDateTime,
  formatAccountingNewTemplate,
  translateAccountingNewApiError,
} from "@/components/admin/accounting-new/accountingNewFormat";

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="break-words text-sm text-foreground">{value}</div>
    </div>
  );
}

function DetailLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-48" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

export function AccountingNewReminderEmailDetail({
  reminderEmailId,
  invoiceId,
}: {
  reminderEmailId: string;
  invoiceId?: string | null;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [state, setState] = useState<AccountingNewReminderEmailDetailState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadDetail() {
      setState({ status: "loading" });

      try {
        const detail = await getAccountingNewReminderEmail(reminderEmailId, invoiceId ?? undefined, {
          signal: controller.signal,
        });
        setState({ status: "ready", detail });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof AccountingNewRequestError) {
          if (error.apiError.requiresLogin) {
            setState({ status: "auth", error: error.apiError });
            return;
          }

          if (error.apiError.status === 404) {
            setState({ status: "not_found", error: error.apiError });
            return;
          }

          setState({ status: "error", error: error.apiError });
          return;
        }

        setState({
          status: "error",
          error: {
            resource: "reminder-email-detail",
            message: error instanceof Error ? error.message : t.errors.reminderEmailDetailTitle,
            status: null,
            requiresLogin: false,
          },
        });
      }
    }

    void loadDetail();

    return () => controller.abort();
  }, [invoiceId, reminderEmailId, t.errors.reminderEmailDetailTitle]);

  if (state.status === "loading") {
    return <DetailLoading />;
  }

  if (state.status === "auth") {
    return (
      <Alert>
        <AlertTitle>{t.auth.reminderEmailDetailTitle}</AlertTitle>
        <AlertDescription>{t.auth.reminderEmailDetailDescription}</AlertDescription>
      </Alert>
    );
  }

  if (state.status === "not_found") {
    return (
      <Alert>
        <AlertTitle>{t.reminderEmailDetail.notFoundTitle}</AlertTitle>
        <AlertDescription>{t.reminderEmailDetail.notFoundDescription}</AlertDescription>
      </Alert>
    );
  }

  if (state.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.errors.reminderEmailDetailTitle}</AlertTitle>
        <AlertDescription>{translateAccountingNewApiError(t, state.error)}</AlertDescription>
      </Alert>
    );
  }

  const { detail } = state;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline">
          <Link href={getAccountingNewModuleRoute("reminders")}>{t.reminderEmailDetail.backLabel}</Link>
        </Button>
        <Badge variant="outline">{t.reminderEmailDetail.badge}</Badge>
        <Badge variant="secondary">{t.common.readOnlyBadge}</Badge>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle data-testid="accounting-new-reminder-email-detail-title">
            {detail.subject}
          </CardTitle>
          <CardDescription>{t.reminderEmailDetail.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t.reminderEmailDetail.sections.summary}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MetaRow label={t.reminderEmailDetail.fields.recipient} value={detail.recipientEmail} />
              <MetaRow label={t.reminderEmailDetail.fields.status} value={<AccountingNewTodoStatusBadge label={detail.status} />} />
              <MetaRow label={t.reminderEmailDetail.fields.reminderType} value={detail.reminderType} />
            </div>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t.reminderEmailDetail.sections.delivery}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MetaRow
                label={t.reminderEmailDetail.fields.sentAt}
                value={formatAccountingNewDateTime(detail.sentAt, language, t.common.noValue)}
              />
              <MetaRow
                label={t.reminderEmailDetail.fields.createdAt}
                value={formatAccountingNewDateTime(detail.createdAt, language, t.common.noValue)}
              />
              <MetaRow label={t.reminderEmailDetail.fields.errorMessage} value={detail.errorMessage ?? t.common.noValue} />
            </div>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t.reminderEmailDetail.sections.message}
            </h2>
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="whitespace-pre-wrap text-sm text-foreground">{detail.message}</p>
            </div>
          </section>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <MetaRow
              label={t.reminderEmailDetail.fields.invoice}
              value={
                <Link href={`${ACCOUNTING_NEW_ROUTE}/doklady/${detail.invoiceId}`} className="underline underline-offset-4">
                  {detail.invoiceNumber
                    ? formatAccountingNewTemplate(t.reminderEmails.table.invoiceLinked, { number: detail.invoiceNumber })
                    : formatAccountingNewTemplate(t.reminderEmails.table.invoiceMissing, { id: detail.invoiceId })}
                </Link>
              }
            />
            <MetaRow
              label={t.reminderEmailDetail.fields.todo}
              value={
                detail.todoId ? (
                  <Link href={`${ACCOUNTING_NEW_ROUTE}/ukoly/${detail.todoId}`} className="underline underline-offset-4">
                    #{detail.todoId}
                  </Link>
                ) : (
                  t.common.noValue
                )
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
