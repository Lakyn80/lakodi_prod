"use client";

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
import { AccountingNewHashRedirect } from "@/components/admin/accounting-new/AccountingNewHashRedirect";
import { AccountingNewModuleGrid, type AccountingNewModuleStat } from "@/components/admin/accounting-new/AccountingNewModuleGrid";
import {
  formatAccountingNewTemplate,
  getAccountingNewTranslationValue,
  translateAccountingNewApiError,
} from "@/components/admin/accounting-new/accountingNewFormat";
import type {
  AccountingNewApiError,
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
      badge: t.voice.labels.bankTransactions,
      detail: formatAccountingNewTemplate(t.dashboard.moduleStats.bankTransactions, {
        count: data.metrics.bankTransactionsLoaded,
      }),
    },
    "payment-matching": {
      badge: t.bankWrite.applyAction,
      detail: formatAccountingNewTemplate(t.dashboard.moduleStats.paymentMatching, {
        matched: data.bankTransactions.filter((item) => item.status === "matched").length,
        open: data.bankTransactions.filter((item) => item.status !== "matched" && item.status !== "ignored").length,
      }),
    },
    reminders: {
      badge: t.todoWrite.generateAction,
      detail: formatAccountingNewTemplate(t.dashboard.moduleStats.reminders, {
        open: data.metrics.openTodos,
        overdue: data.metrics.overdueTodos,
      }),
    },
    attachments: {
      badge: t.attachmentWrite.uploadAction,
      detail: formatAccountingNewTemplate(t.dashboard.moduleStats.attachments, {
        count: data.metrics.attachmentsLoaded,
      }),
    },
    recurring: {
      badge: t.recurringWrite.generateAction,
      detail: formatAccountingNewTemplate(t.dashboard.moduleStats.recurring, {
        count: data.metrics.recurringTemplatesLoaded,
      }),
    },
    exports: {
      badge: t.exportsWrite.badge,
      detail: t.dashboard.moduleStats.exports,
    },
    settings: {
      badge: t.settingsWrite.badge,
      detail: t.settingsWrite.title,
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
  const moduleStats = getModuleStats(t, dashboard);

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
    <div className="min-w-0 max-w-full space-y-6 overflow-x-hidden">
      <AccountingNewHashRedirect />

      <Card className="border-border bg-card">
        <CardHeader className="space-y-3">
          <div className="space-y-1">
            <CardTitle data-testid="accounting-new-dashboard-title">{t.dashboard.title}</CardTitle>
            <CardDescription>{t.dashboard.description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t.dashboard.preservationNotice}</p>
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

      <div className="flex flex-col gap-6">
        <section className="order-1 space-y-3 md:order-2">
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

        <section className="order-2 space-y-3 md:order-1">
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
                  count: dashboard.metrics.subjectsLoaded,
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
      </div>
    </div>
  );
}
