"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE, getAccountingNewDashboardData } from "@/lib/accountingNew";
import {
  accountingNewGridModuleIds,
  accountingNewModuleRegistry,
  mapRegistryEntryToModuleDefinition,
} from "@/lib/accountingNewModules";
import { AccountingNewModuleGrid, type AccountingNewModuleStat } from "@/components/admin/accounting-new/AccountingNewModuleGrid";
import { AccountingNewDocumentsPanel } from "@/components/admin/accounting-new/AccountingNewDocumentsPanel";
import { AccountingNewExpensesPanel } from "@/components/admin/accounting-new/AccountingNewExpensesPanel";
import { AccountingNewSubjectsPanel } from "@/components/admin/accounting-new/AccountingNewSubjectsPanel";
import { AccountingNewSuppliersPanel } from "@/components/admin/accounting-new/AccountingNewSuppliersPanel";
import { AccountingNewBankTransactionsPanel } from "@/components/admin/accounting-new/AccountingNewBankTransactionsPanel";
import { AccountingNewPaymentMatchesPanel } from "@/components/admin/accounting-new/AccountingNewPaymentMatchesPanel";
import { AccountingNewTodosPanel } from "@/components/admin/accounting-new/AccountingNewTodosPanel";
import { AccountingNewRecurringTemplatesPanel } from "@/components/admin/accounting-new/AccountingNewRecurringTemplatesPanel";
import { AccountingNewAttachmentsPanel } from "@/components/admin/accounting-new/AccountingNewAttachmentsPanel";
import { AccountingNewAttachmentInboxPanel } from "@/components/admin/accounting-new/AccountingNewAttachmentInboxPanel";
import { AccountingNewReminderEmailsPanel } from "@/components/admin/accounting-new/AccountingNewReminderEmailsPanel";
import {
  formatAccountingNewDateTime,
  formatAccountingNewTemplate,
  getAccountingNewTranslationValue,
  translateAccountingNewApiError,
  translateAccountingNewEntityType,
} from "@/components/admin/accounting-new/accountingNewFormat";
import type {
  AccountingNewApiError,
  AccountingNewAuditEventSummary,
  AccountingNewDashboardData,
  AccountingNewDashboardLoadResult,
  AccountingNewModuleId,
} from "@/types/accountingNew";

type DashboardState =
  | { status: "loading" }
  | { status: "ready"; result: AccountingNewDashboardLoadResult }
  | { status: "auth"; result: AccountingNewDashboardLoadResult }
  | { status: "error"; error: AccountingNewApiError };

function getModuleStats(
  t: (typeof translations)["cs"]["accountingNew"],
  data: AccountingNewDashboardData | null,
): Partial<Record<AccountingNewModuleId, AccountingNewModuleStat>> {
  if (!data) {
    return {};
  }

  return {
    dashboard: {
      badge: t.common.readOnlyBadge,
      detail: formatAccountingNewTemplate(t.dashboard.moduleStats.dashboard, {
        documents: data.metrics.documentsLoaded,
        todos: data.metrics.openTodos,
      }),
    },
    documents: {
      badge: t.common.readOnlyBadge,
      detail: formatAccountingNewTemplate(t.dashboard.moduleStats.documents, {
        count: data.metrics.documentsLoaded,
      }),
    },
    subjects: {
      badge: t.subjectWrite.badgeFunctional,
      detail: formatAccountingNewTemplate(t.dashboard.subjectsDescription, {
        count: data.metrics.subjectsLoaded,
      }),
    },
    expenses: {
      badge: t.expenseWrite.badgeFunctional,
      detail: formatAccountingNewTemplate(t.dashboard.moduleStats.expenses, {
        count: data.metrics.expensesLoaded,
      }),
    },
    suppliers: {
      badge: t.supplierWrite.badgeFunctional,
      detail: formatAccountingNewTemplate(t.dashboard.moduleStats.suppliers, {
        count: data.metrics.suppliersLoaded,
      }),
    },
    "bank-transactions": {
      badge: t.common.readOnlyBadge,
      detail: formatAccountingNewTemplate(t.dashboard.moduleStats.bankTransactions, {
        count: data.metrics.bankTransactionsLoaded,
      }),
    },
    "payment-matching": {
      badge: t.common.readOnlyBadge,
      detail: formatAccountingNewTemplate(t.dashboard.moduleStats.paymentMatching, {
        matched: data.bankTransactions.filter((item) => item.status === "matched").length,
        open: data.bankTransactions.filter((item) => item.status !== "matched" && item.status !== "ignored").length,
      }),
    },
    reminders: {
      badge: t.common.readOnlyBadge,
      detail: formatAccountingNewTemplate(t.dashboard.moduleStats.reminders, {
        open: data.metrics.openTodos,
        overdue: data.metrics.overdueTodos,
      }),
    },
    attachments: {
      badge: t.common.readOnlyBadge,
      detail: formatAccountingNewTemplate(t.dashboard.moduleStats.attachments, {
        count: data.metrics.attachmentsLoaded,
      }),
    },
    recurring: {
      badge: t.common.readOnlyBadge,
      detail: formatAccountingNewTemplate(t.dashboard.moduleStats.recurring, {
        count: data.metrics.recurringTemplatesLoaded,
      }),
    },
    exports: {
      badge: t.common.readyBadge,
      detail: t.dashboard.moduleStats.exports,
    },
    audit: {
      badge: t.common.readyBadge,
      detail: formatAccountingNewTemplate(t.dashboard.moduleStats.audit, {
        count: data.metrics.auditEventsLoaded,
      }),
    },
  };
}

function getPrimaryError(errors: AccountingNewApiError[]): AccountingNewApiError | null {
  return errors[0] ?? null;
}

function getResourceError(errors: AccountingNewApiError[], resource: string): AccountingNewApiError | null {
  return errors.find((error) => error.resource === resource) ?? null;
}

function getRecentAuditEvents(events: AccountingNewAuditEventSummary[]): AccountingNewAuditEventSummary[] {
  return [...events]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 5);
}

function SummarySkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <Card key={index} className="border-border bg-card">
          <CardContent className="space-y-3 p-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  description,
}: {
  title: string;
  value: number;
  description: string;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="space-y-2 p-6">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-3xl font-semibold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export function AccountingNewShell() {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [state, setState] = useState<DashboardState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setState({ status: "loading" });

      try {
        const result = await getAccountingNewDashboardData({ signal: controller.signal });
        setState(result.authRequired ? { status: "auth", result } : { status: "ready", result });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        const fallbackError: AccountingNewApiError = {
          resource: "dashboard",
          message: error instanceof Error ? error.message : t.errors.dashboardTitle,
          status: null,
          requiresLogin: false,
        };

        setState({ status: "error", error: fallbackError });
      }
    }

    void loadDashboard();

    return () => controller.abort();
  }, [t.errors.dashboardTitle]);

  const result = state.status === "ready" || state.status === "auth" ? state.result : null;
  const dashboard = result?.dashboard ?? null;
  const partialErrors = result?.partialErrors ?? [];
  const primaryPartialError = getPrimaryError(partialErrors);
  const documentsError = getResourceError(partialErrors, "documents");
  const expensesError = getResourceError(partialErrors, "expenses");
  const suppliersError = getResourceError(partialErrors, "suppliers");
  const subjectsError = getResourceError(partialErrors, "subjects");
  const bankTransactionsError = getResourceError(partialErrors, "bank-transactions");
  const todosError = getResourceError(partialErrors, "todos");
  const recurringError = getResourceError(partialErrors, "recurring-templates");
  const attachmentsError = getResourceError(partialErrors, "attachments");
  const inboxAttachments = useMemo(
    () =>
      (dashboard?.attachments ?? []).filter(
        (attachment) =>
          !attachment.invoiceId &&
          !attachment.expenseId &&
          !attachment.todoId &&
          !attachment.bankTransactionId,
      ),
    [dashboard?.attachments],
  );
  const moduleStats = getModuleStats(t, dashboard);
  const recentAuditEvents = dashboard ? getRecentAuditEvents(dashboard.auditEvents) : [];

  const localizedModules = useMemo(
    () =>
      accountingNewModuleRegistry
        .filter((entry) => entry.gridModuleId && accountingNewGridModuleIds.includes(entry.gridModuleId))
        .map((entry) =>
          mapRegistryEntryToModuleDefinition(
            entry,
            getAccountingNewTranslationValue(t, entry.labelKey),
            getAccountingNewTranslationValue(t, entry.descriptionKey),
          ),
        ),
    [t],
  );

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t.dashboard.badges.parallelSection}</Badge>
            <Badge variant="secondary">{t.dashboard.badges.readOnly}</Badge>
            <Badge variant="secondary">{t.dashboard.badges.noMigration}</Badge>
          </div>
          <div className="space-y-1">
            <CardTitle>{t.dashboard.title}</CardTitle>
            <CardDescription>{t.dashboard.description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm text-foreground">{t.dashboard.preservationNotice}</p>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-sm text-muted-foreground">{t.dashboard.progressNotice}</p>
          </div>
        </CardContent>
      </Card>

      {state.status === "auth" ? (
        <Alert>
          <AlertTitle>{t.auth.dashboardTitle}</AlertTitle>
          <AlertDescription>{t.auth.dashboardDescription}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>{t.errors.dashboardTitle}</AlertTitle>
          <AlertDescription>{translateAccountingNewApiError(t, state.error)}</AlertDescription>
        </Alert>
      ) : null}

      {primaryPartialError && state.status !== "auth" ? (
        <Alert>
          <AlertTitle>{t.errors.partialDataTitle}</AlertTitle>
          <AlertDescription>
            {translateAccountingNewApiError(t, primaryPartialError)} {t.errors.partialDataDescription}
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{t.dashboard.summaryTitle}</h2>
          <p className="text-sm text-muted-foreground">{t.dashboard.summaryDescription}</p>
        </div>

        {state.status === "loading" ? (
          <SummarySkeleton />
        ) : dashboard ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title={t.dashboard.documentsTitle}
              value={dashboard.metrics.documentsLoaded}
              description={formatAccountingNewTemplate(t.dashboard.documentsDescription, {
                count: dashboard.metrics.documentsWithRemainingBalance,
              })}
            />
            <SummaryCard
              title={t.dashboard.expensesTitle}
              value={dashboard.metrics.expensesLoaded}
              description={formatAccountingNewTemplate(t.dashboard.expensesDescription, {
                count: dashboard.metrics.expensesWithRemainingBalance,
              })}
            />
            <SummaryCard
              title={t.dashboard.todosTitle}
              value={dashboard.metrics.openTodos}
              description={formatAccountingNewTemplate(t.dashboard.todosDescription, {
                overdue: dashboard.metrics.overdueTodos,
                total: dashboard.metrics.todosLoaded,
              })}
            />
            <SummaryCard
              title={t.dashboard.bankTitle}
              value={dashboard.metrics.bankTransactionsLoaded}
              description={t.dashboard.bankDescription}
            />
            <SummaryCard
              title={t.dashboard.attachmentsTitle}
              value={dashboard.metrics.attachmentsLoaded}
              description={t.dashboard.attachmentsDescription}
            />
            <SummaryCard
              title={t.dashboard.auditTitle}
              value={dashboard.metrics.auditEventsLoaded}
              description={t.dashboard.auditDescription}
            />
            <SummaryCard
              title={t.dashboard.subjectsTitle}
              value={dashboard.metrics.subjectsLoaded}
              description={formatAccountingNewTemplate(t.dashboard.subjectsDescription, {
                count: dashboard.metrics.suppliersLoaded,
              })}
            />
            <SummaryCard
              title={t.dashboard.recurringTitle}
              value={dashboard.metrics.recurringTemplatesLoaded}
              description={t.dashboard.recurringDescription}
            />
          </div>
        ) : null}
      </section>

      <AccountingNewDocumentsPanel
        documents={dashboard?.invoices ?? []}
        isLoading={state.status === "loading"}
        authRequired={state.status === "auth"}
        error={documentsError}
      />

      <AccountingNewSubjectsPanel
        subjects={dashboard?.subjects ?? []}
        isLoading={state.status === "loading"}
        authRequired={state.status === "auth"}
        error={subjectsError}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <AccountingNewExpensesPanel
          expenses={dashboard?.expenses ?? []}
          isLoading={state.status === "loading"}
          authRequired={state.status === "auth"}
          error={expensesError}
        />

        <AccountingNewSuppliersPanel
          suppliers={dashboard?.suppliers ?? []}
          isLoading={state.status === "loading"}
          authRequired={state.status === "auth"}
          error={suppliersError}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AccountingNewBankTransactionsPanel
          transactions={dashboard?.bankTransactions ?? []}
          isLoading={state.status === "loading"}
          authRequired={state.status === "auth"}
          error={bankTransactionsError}
        />

        <AccountingNewPaymentMatchesPanel
          transactions={dashboard?.bankTransactions ?? []}
          isLoading={state.status === "loading"}
          authRequired={state.status === "auth"}
          error={bankTransactionsError}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AccountingNewTodosPanel
          todos={dashboard?.todos ?? []}
          isLoading={state.status === "loading"}
          authRequired={state.status === "auth"}
          error={todosError}
        />

        <AccountingNewRecurringTemplatesPanel
          templates={dashboard?.recurringTemplates ?? []}
          subjects={dashboard?.subjects ?? []}
          suppliers={dashboard?.suppliers ?? []}
          isLoading={state.status === "loading"}
          authRequired={state.status === "auth"}
          error={recurringError}
        />
      </div>

      <AccountingNewReminderEmailsPanel />

      <div className="grid gap-4 xl:grid-cols-2">
        <AccountingNewAttachmentsPanel
          attachments={dashboard?.attachments ?? []}
          isLoading={state.status === "loading"}
          authRequired={state.status === "auth"}
          error={attachmentsError}
        />

        <AccountingNewAttachmentInboxPanel
          attachments={inboxAttachments}
          isLoading={state.status === "loading"}
          authRequired={state.status === "auth"}
          error={attachmentsError}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr,1fr]">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>{t.dashboard.recentAuditTitle}</CardTitle>
            <CardDescription>{t.dashboard.recentAuditDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {state.status === "loading" ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : recentAuditEvents.length > 0 ? (
              <div className="space-y-3">
                {recentAuditEvents.map((event) => (
                  <div key={event.id} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{translateAccountingNewEntityType(t, event.entityType)}</Badge>
                      <Badge variant="secondary">{event.eventType}</Badge>
                    </div>
                    <p className="mt-3 text-sm text-foreground">{event.message ?? t.common.noAuditMessage}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatAccountingNewDateTime(event.createdAt, language, t.common.noValue)} ·{" "}
                      {formatAccountingNewTemplate(t.common.sourcePrefix, { value: event.source })}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t.empty.dashboardAudit}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>{t.dashboard.loadStateTitle}</CardTitle>
            <CardDescription>{t.dashboard.loadStateDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>{t.dashboard.loadStateSafeGet}</p>
            <p>{t.dashboard.loadStateAuth}</p>
            <p>
              {dashboard?.lastUpdatedAt
                ? formatAccountingNewTemplate(t.dashboard.lastRefresh, {
                    value: formatAccountingNewDateTime(dashboard.lastUpdatedAt, language, t.common.noValue),
                  })
                : t.common.noRefresh}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{t.dashboard.modulesTitle}</h2>
          <p className="text-sm text-muted-foreground">{t.dashboard.modulesDescription}</p>
        </div>
        <AccountingNewModuleGrid
          modules={localizedModules}
          stats={moduleStats}
          labels={{
            readOnly: t.common.readOnlyBadge,
            ready: t.common.readyBadge,
            noMetrics: t.common.noMetrics,
          }}
        />
      </section>
    </div>
  );
}
