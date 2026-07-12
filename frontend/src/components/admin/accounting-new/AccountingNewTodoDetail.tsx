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
import { ACCOUNTING_NEW_ROUTE, AccountingNewRequestError, getAccountingNewTodo } from "@/lib/accountingNew";
import { getAccountingNewModuleRoute } from "@/lib/accountingNewModuleRoutes";
import type { AccountingNewTodoDetailState } from "@/types/accountingNew";
import { AccountingNewReminderSendForm } from "@/components/admin/accounting-new/AccountingNewReminderSendForm";
import { AccountingNewTodoDetailActions } from "@/components/admin/accounting-new/AccountingNewTodoActions";
import { AccountingNewTodoStatusBadge } from "@/components/admin/accounting-new/AccountingNewTodoStatusBadge";
import {
  formatAccountingNewDate,
  formatAccountingNewDateTime,
  formatAccountingNewTemplate,
  translateAccountingNewApiError,
  translateAccountingNewTodoType,
} from "@/components/admin/accounting-new/accountingNewFormat";

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground">{value}</div>
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

export function AccountingNewTodoDetail({ todoId }: { todoId: string }) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [state, setState] = useState<AccountingNewTodoDetailState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDetail() {
      setState({ status: "loading" });

      try {
        const detail = await getAccountingNewTodo(todoId, { signal: controller.signal });
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
            resource: "todo-detail",
            message: error instanceof Error ? error.message : t.errors.todoDetailTitle,
            status: null,
            requiresLogin: false,
          },
        });
      }
    }

    void loadDetail();

    return () => controller.abort();
  }, [todoId, t.errors.todoDetailTitle, reloadKey]);

  if (state.status === "loading") {
    return <DetailLoading />;
  }

  if (state.status === "auth") {
    return (
      <Alert>
        <AlertTitle>{t.auth.todoDetailTitle}</AlertTitle>
        <AlertDescription>{t.auth.todoDetailDescription}</AlertDescription>
      </Alert>
    );
  }

  if (state.status === "not_found") {
    return (
      <Alert>
        <AlertTitle>{t.todoDetail.notFoundTitle}</AlertTitle>
        <AlertDescription>{t.todoDetail.notFoundDescription}</AlertDescription>
      </Alert>
    );
  }

  if (state.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.errors.todoDetailTitle}</AlertTitle>
        <AlertDescription>{translateAccountingNewApiError(t, state.error)}</AlertDescription>
      </Alert>
    );
  }

  const { detail } = state;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline">
          <Link href={getAccountingNewModuleRoute("reminders")}>{t.todoDetail.backLabel}</Link>
        </Button>
        <Badge variant="outline">{t.todoDetail.badge}</Badge>
      </div>

      <AccountingNewTodoDetailActions
        todo={detail}
        onUpdated={(updated) => setState({ status: "ready", detail: updated })}
      />

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>{detail.title}</CardTitle>
          <CardDescription>{t.todoDetail.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t.todoDetail.sections.summary}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MetaRow label={t.todoDetail.fields.status} value={<AccountingNewTodoStatusBadge label={detail.status} />} />
              <MetaRow label={t.todoDetail.fields.type} value={translateAccountingNewTodoType(t, detail.todoType)} />
              <MetaRow
                label={t.todoDetail.fields.dueDate}
                value={formatAccountingNewDate(detail.dueDate, language, t.common.noValue)}
              />
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t.todoDetail.sections.message}
            </h2>
            <p className="text-sm text-foreground">{detail.message ?? t.common.noValue}</p>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t.todoDetail.sections.links}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <MetaRow
                label={t.todoDetail.fields.invoice}
                value={
                  detail.invoiceId ? (
                    <Link href={`${ACCOUNTING_NEW_ROUTE}/doklady/${detail.invoiceId}`} className="underline underline-offset-4">
                      {formatAccountingNewTemplate(t.todos.table.invoiceLinked, { id: detail.invoiceId })}
                    </Link>
                  ) : (
                    t.common.noValue
                  )
                }
              />
              <MetaRow
                label={t.todoDetail.fields.expense}
                value={
                  detail.expenseId ? (
                    <Link href={`${ACCOUNTING_NEW_ROUTE}/vydaje/${detail.expenseId}`} className="underline underline-offset-4">
                      {formatAccountingNewTemplate(t.todos.table.expenseLinked, { id: detail.expenseId })}
                    </Link>
                  ) : (
                    t.common.noValue
                  )
                }
              />
            </div>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t.todoDetail.sections.timeline}
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              <MetaRow
                label={t.todoDetail.fields.createdAt}
                value={formatAccountingNewDateTime(detail.createdAt, language, t.common.noValue)}
              />
              <MetaRow
                label={t.todoDetail.fields.updatedAt}
                value={formatAccountingNewDateTime(detail.updatedAt, language, t.common.noValue)}
              />
              <MetaRow
                label={t.todoDetail.fields.completedAt}
                value={formatAccountingNewDateTime(detail.completedAt, language, t.common.noValue)}
              />
            </div>
          </section>

          {detail.invoiceId ? (
            <>
              <Separator />
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.reminderWrite.sectionTitle}
                </h2>
                <AccountingNewReminderSendForm
                  invoiceId={detail.invoiceId}
                  todoId={detail.id}
                  onSent={() => setReloadKey((current) => current + 1)}
                />
              </section>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
