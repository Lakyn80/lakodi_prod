"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ACCOUNTING_NEW_ROUTE,
  accountingNewModules,
  getAccountingNewDashboardData,
} from "@/lib/accountingNew";
import { AccountingNewModuleGrid, type AccountingNewModuleStat } from "@/components/admin/accounting-new/AccountingNewModuleGrid";
import type {
  AccountingNewApiError,
  AccountingNewAuditEventSummary,
  AccountingNewDashboardData,
  AccountingNewDashboardLoadResult,
} from "@/types/accountingNew";

type DashboardState =
  | { status: "loading" }
  | { status: "ready"; result: AccountingNewDashboardLoadResult }
  | { status: "auth"; result: AccountingNewDashboardLoadResult }
  | { status: "error"; error: AccountingNewApiError };

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Neznámý čas";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getModuleStats(data: AccountingNewDashboardData | null): Partial<Record<typeof accountingNewModules[number]["id"], AccountingNewModuleStat>> {
  if (!data) {
    return {};
  }

  return {
    dashboard: {
      badge: "Read-only data",
      detail: `${data.metrics.documentsLoaded} dokladů, ${data.metrics.openTodos} otevřených úkolů`,
    },
    documents: {
      badge: "Read-only data",
      detail: `${data.metrics.documentsLoaded} načtených dokladů`,
    },
    subjects: {
      badge: "Read-only data",
      detail: `${data.metrics.subjectsLoaded} subjektů`,
    },
    expenses: {
      badge: "Read-only data",
      detail: `${data.metrics.expensesLoaded} výdajů`,
    },
    suppliers: {
      badge: "Read-only data",
      detail: `${data.metrics.suppliersLoaded} dodavatelů`,
    },
    "bank-matching": {
      badge: "Read-only data",
      detail: `${data.metrics.bankTransactionsLoaded} transakcí`,
    },
    "todos-reminders": {
      badge: "Read-only data",
      detail: `${data.metrics.openTodos} otevřených / ${data.metrics.overdueTodos} po splatnosti`,
    },
    recurring: {
      badge: "Read-only data",
      detail: `${data.metrics.recurringTemplatesLoaded} šablon`,
    },
    attachments: {
      badge: "Read-only data",
      detail: `${data.metrics.attachmentsLoaded} příloh`,
    },
    audit: {
      badge: "Read-only data",
      detail: `${data.metrics.auditEventsLoaded} auditních událostí`,
    },
    settings: {
      badge: "Další krok",
      detail: "Write konfigurace zůstává mimo rozsah tohoto úkolu.",
    },
  };
}

function getPrimaryError(errors: AccountingNewApiError[]): AccountingNewApiError | null {
  return errors[0] ?? null;
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
          message: error instanceof Error ? error.message : "Read-only dashboard se nepodařilo načíst.",
          status: null,
          requiresLogin: false,
        };

        setState({ status: "error", error: fallbackError });
      }
    }

    void loadDashboard();

    return () => controller.abort();
  }, []);

  const result = state.status === "ready" || state.status === "auth" ? state.result : null;
  const dashboard = result?.dashboard ?? null;
  const partialErrors = result?.partialErrors ?? [];
  const primaryPartialError = getPrimaryError(partialErrors);
  const moduleStats = getModuleStats(dashboard);
  const recentAuditEvents = dashboard ? getRecentAuditEvents(dashboard.auditEvents) : [];

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Paralelní sekce</Badge>
            <Badge variant="secondary">Read-only dashboard</Badge>
            <Badge variant="secondary">Bez migrace</Badge>
          </div>
          <div className="space-y-1">
            <CardTitle>ÚčetnictvíNew</CardTitle>
            <CardDescription>
              Nová paralelní účetní sekce nyní načítá pouze bezpečná read-only data nad existujícím accounting backendem.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm text-foreground">
              Stávající vydané faktury a původní invoicing UI zůstávají zachované beze změny v sekci{" "}
              <Link href="/admin/invoices" className="font-medium underline underline-offset-4">
                /admin/invoices
              </Link>
              . Tato nová část nic nemigruje, nepřepisuje a nepouští žádné write akce.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-sm text-muted-foreground">
              Aktuální krok rozšiřuje bezpečný shell na adrese{" "}
              <span className="font-medium text-foreground">{ACCOUNTING_NEW_ROUTE}</span> o samostatný read-only API
              client, oddělené typy a konzervativní dashboardové metriky.
            </p>
          </div>
        </CardContent>
      </Card>

      {state.status === "auth" ? (
        <Alert>
          <AlertTitle>Pro read-only accounting dashboard je nutné přihlášení</AlertTitle>
          <AlertDescription>
            API vrátilo `401`, takže nové dashboardové přehledy nelze načíst bez aktivní admin session. Původní route
            `/admin/invoices` se tím nijak nemění.
          </AlertDescription>
        </Alert>
      ) : null}

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Read-only accounting dashboard se nepodařilo načíst</AlertTitle>
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}

      {primaryPartialError && state.status !== "auth" ? (
        <Alert>
          <AlertTitle>Část read-only dat se nepodařilo načíst</AlertTitle>
          <AlertDescription>
            {primaryPartialError.message} Dashboard proto zobrazuje jen bezpečná data, která backend skutečně vrátil.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Read-only přehled</h2>
          <p className="text-sm text-muted-foreground">
            Metriky níže vycházejí pouze z bezpečně načtených GET endpointů. Pokud některý zdroj chybí, dashboard
            raději nic nedopočítává agresivně.
          </p>
        </div>

        {state.status === "loading" ? (
          <SummarySkeleton />
        ) : dashboard ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Doklady"
              value={dashboard.metrics.documentsLoaded}
              description={`${dashboard.metrics.documentsWithRemainingBalance} s otevřeným zůstatkem`}
            />
            <SummaryCard
              title="Výdaje"
              value={dashboard.metrics.expensesLoaded}
              description={`${dashboard.metrics.expensesWithRemainingBalance} s otevřeným zůstatkem`}
            />
            <SummaryCard
              title="Úkoly"
              value={dashboard.metrics.openTodos}
              description={`${dashboard.metrics.overdueTodos} po splatnosti z ${dashboard.metrics.todosLoaded}`}
            />
            <SummaryCard
              title="Banka"
              value={dashboard.metrics.bankTransactionsLoaded}
              description="Pouze read-only načtené transakce"
            />
            <SummaryCard
              title="Přílohy"
              value={dashboard.metrics.attachmentsLoaded}
              description="Inbox a vazby bez archivace"
            />
            <SummaryCard
              title="Audit"
              value={dashboard.metrics.auditEventsLoaded}
              description="Poslední účetní události"
            />
            <SummaryCard
              title="Subjekty"
              value={dashboard.metrics.subjectsLoaded}
              description={`${dashboard.metrics.suppliersLoaded} dodavatelů v paralelní vrstvě`}
            />
            <SummaryCard
              title="Opakované"
              value={dashboard.metrics.recurringTemplatesLoaded}
              description="Šablony bez generování dokladů"
            />
          </div>
        ) : null}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.4fr,1fr]">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Nedávné auditní události</CardTitle>
            <CardDescription>
              Posledních pět read-only událostí vrácených z `/api/admin/invoices/audit-events`.
            </CardDescription>
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
                      <Badge variant="outline">{event.entityType}</Badge>
                      <Badge variant="secondary">{event.eventType}</Badge>
                    </div>
                    <p className="mt-3 text-sm text-foreground">
                      {event.message ?? "Backend neposlal detailní message, proto dashboard zobrazuje pouze typ události."}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDateTime(event.createdAt)} · zdroj {event.source}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Žádné auditní události se zatím nepodařilo načíst nebo backend vrátil prázdný seznam.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Stav načtení</CardTitle>
            <CardDescription>Dashboard je záměrně konzervativní a používá pouze read-only zdroje.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Nový klient používá pouze `GET` endpointy pod `/api/admin/invoices/*`, sdílí admin cookie session a
              neobsahuje žádné create/update/delete akce.
            </p>
            <p>
              Pokud backend vrátí `401`, stránka zobrazí bezpečný login-required stav místo pádu, automatického loginu
              nebo zásahu do legacy rout.
            </p>
            <p>
              {dashboard?.lastUpdatedAt
                ? `Poslední úspěšný refresh dashboardu: ${formatDateTime(dashboard.lastUpdatedAt)}.`
                : "Dashboard zatím nemá uložený úspěšný refresh."}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Moduly paralelního účetnictví</h2>
          <p className="text-sm text-muted-foreground">
            Níže jsou moduly nové paralelní sekce. Tato fáze přidává pouze read-only načítání a bezpečné počty.
          </p>
        </div>
        <AccountingNewModuleGrid modules={accountingNewModules} stats={moduleStats} />
      </section>
    </div>
  );
}
