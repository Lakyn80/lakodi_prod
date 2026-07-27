"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { getAccountingNewDashboardData } from "@/lib/accountingNew";
import { accountingNewModuleRegistry } from "@/lib/accountingNewModules";
import { ACCOUNTING_NEW_BASE_ROUTE } from "@/lib/accountingNewModuleRoutes";
import type {
  AccountingNewApiError,
  AccountingNewDashboardData,
  AccountingNewDashboardLoadResult,
  AccountingNewModuleId,
} from "@/types/accountingNew";
import { AccountingNewDocumentsPanel } from "@/components/admin/accounting-new/AccountingNewDocumentsPanel";
import { AccountingNewSubjectsPanel } from "@/components/admin/accounting-new/AccountingNewSubjectsPanel";
import { AccountingNewExpensesPanel } from "@/components/admin/accounting-new/AccountingNewExpensesPanel";
import { AccountingNewSuppliersPanel } from "@/components/admin/accounting-new/AccountingNewSuppliersPanel";
import { AccountingNewBankTransactionsPanel } from "@/components/admin/accounting-new/AccountingNewBankTransactionsPanel";
import { AccountingNewPaymentMatchesPanel } from "@/components/admin/accounting-new/AccountingNewPaymentMatchesPanel";
import { AccountingNewTodosPanel } from "@/components/admin/accounting-new/AccountingNewTodosPanel";
import { AccountingNewRecurringTemplatesPanel } from "@/components/admin/accounting-new/AccountingNewRecurringTemplatesPanel";
import { AccountingNewAttachmentsPanel } from "@/components/admin/accounting-new/AccountingNewAttachmentsPanel";
import { AccountingNewAttachmentInboxPanel } from "@/components/admin/accounting-new/AccountingNewAttachmentInboxPanel";
import { AccountingNewReminderEmailsPanel } from "@/components/admin/accounting-new/AccountingNewReminderEmailsPanel";
import { AccountingNewSettingsPanel } from "@/components/admin/accounting-new/AccountingNewSettingsPanel";
import { AccountingNewExportsPanel } from "@/components/admin/accounting-new/AccountingNewExportsPanel";
import { AccountingNewAuditPanel } from "@/components/admin/accounting-new/AccountingNewAuditPanel";
import {
  getAccountingNewTranslationValue,
  translateAccountingNewApiError,
} from "@/components/admin/accounting-new/accountingNewFormat";

type ModulePageState =
  | { status: "loading" }
  | { status: "ready"; result: AccountingNewDashboardLoadResult }
  | { status: "auth"; result: AccountingNewDashboardLoadResult }
  | { status: "error"; error: AccountingNewApiError };

function getResourceError(errors: AccountingNewApiError[], resource: string): AccountingNewApiError | null {
  return errors.find((error) => error.resource === resource) ?? null;
}

function getModuleLabels(t: (typeof translations)["cs"]["accountingNew"], moduleId: AccountingNewModuleId) {
  const entry = accountingNewModuleRegistry.find((item) => item.gridModuleId === moduleId);
  if (!entry) {
    return { title: t.navigation.section, description: "" };
  }

  return {
    title: getAccountingNewTranslationValue(t, entry.labelKey),
    description: getAccountingNewTranslationValue(t, entry.descriptionKey),
  };
}

export function AccountingNewModulePageShell({ moduleId }: { moduleId: AccountingNewModuleId }) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [state, setState] = useState<ModulePageState>({ status: "loading" });
  const [dashboardReloadKey, setDashboardReloadKey] = useState(0);

  const labels = useMemo(() => getModuleLabels(t, moduleId), [moduleId, t]);

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

        setState({
          status: "error",
          error: {
            resource: "dashboard",
            message: error instanceof Error ? error.message : t.errors.dashboardTitle,
            status: null,
            requiresLogin: false,
          },
        });
      }
    }

    void loadDashboard();
    return () => controller.abort();
  }, [t.errors.dashboardTitle, dashboardReloadKey]);

  const result = state.status === "ready" || state.status === "auth" ? state.result : null;
  const dashboard: AccountingNewDashboardData | null = result?.dashboard ?? null;
  const partialErrors = result?.partialErrors ?? [];
  const authRequired = state.status === "auth";
  const isLoading = state.status === "loading";

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

  const panelProps = {
    isLoading,
    authRequired,
  };

  function renderModulePanel() {
    switch (moduleId) {
      case "documents":
        return (
          <AccountingNewDocumentsPanel
            documents={dashboard?.invoices ?? []}
            error={getResourceError(partialErrors, "documents")}
            defaultExpanded
            {...panelProps}
          />
        );
      case "subjects":
        return (
          <AccountingNewSubjectsPanel
            subjects={dashboard?.subjects ?? []}
            error={getResourceError(partialErrors, "subjects")}
            defaultExpanded
            {...panelProps}
          />
        );
      case "expenses":
        return (
          <AccountingNewExpensesPanel
            expenses={dashboard?.expenses ?? []}
            error={getResourceError(partialErrors, "expenses")}
            defaultExpanded
            {...panelProps}
          />
        );
      case "suppliers":
        return (
          <AccountingNewSuppliersPanel
            suppliers={dashboard?.suppliers ?? []}
            error={getResourceError(partialErrors, "suppliers")}
            defaultExpanded
            {...panelProps}
          />
        );
      case "bank-transactions":
        return (
          <AccountingNewBankTransactionsPanel
            transactions={dashboard?.bankTransactions ?? []}
            error={getResourceError(partialErrors, "bank-transactions")}
            defaultExpanded
            onImported={() => setDashboardReloadKey((current) => current + 1)}
            {...panelProps}
          />
        );
      case "payment-matching":
        return (
          <AccountingNewPaymentMatchesPanel
            transactions={dashboard?.bankTransactions ?? []}
            error={getResourceError(partialErrors, "bank-transactions")}
            reloadKey={dashboardReloadKey}
            defaultExpanded
            onStateChanged={() => setDashboardReloadKey((current) => current + 1)}
            {...panelProps}
          />
        );
      case "reminders":
        return (
          <div className="space-y-6">
            <AccountingNewTodosPanel
              todos={dashboard?.todos ?? []}
              error={getResourceError(partialErrors, "todos")}
              defaultExpanded
              onUpdated={() => setDashboardReloadKey((current) => current + 1)}
              {...panelProps}
            />
            <AccountingNewReminderEmailsPanel defaultExpanded />
          </div>
        );
      case "attachments":
        return (
          <div className="space-y-6">
            <AccountingNewAttachmentsPanel
              attachments={dashboard?.attachments ?? []}
              error={getResourceError(partialErrors, "attachments")}
              defaultExpanded
              {...panelProps}
            />
            <AccountingNewAttachmentInboxPanel
              attachments={inboxAttachments}
              error={getResourceError(partialErrors, "attachments")}
              defaultExpanded
              onUploaded={() => setDashboardReloadKey((current) => current + 1)}
              {...panelProps}
            />
          </div>
        );
      case "recurring":
        return (
          <AccountingNewRecurringTemplatesPanel
            templates={dashboard?.recurringTemplates ?? []}
            subjects={dashboard?.subjects ?? []}
            suppliers={dashboard?.suppliers ?? []}
            error={getResourceError(partialErrors, "recurring-templates")}
            defaultExpanded
            {...panelProps}
          />
        );
      case "settings":
        return <AccountingNewSettingsPanel defaultExpanded />;
      case "exports":
        return <AccountingNewExportsPanel defaultExpanded />;
      case "audit":
        return <AccountingNewAuditPanel defaultExpanded />;
      default:
        return null;
    }
  }

  return (
    <div className="min-w-0 max-w-full space-y-6 overflow-x-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Button asChild variant="outline" size="sm">
            <Link href={ACCOUNTING_NEW_BASE_ROUTE}>{t.navigation.backToModules}</Link>
          </Button>
          <h1
            className="text-2xl font-semibold text-foreground"
            data-testid={`accounting-new-module-title-${moduleId}`}
          >
            {labels.title}
          </h1>
          <p className="text-sm text-muted-foreground">{labels.description}</p>
        </div>
      </div>

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>{t.errors.dashboardTitle}</AlertTitle>
          <AlertDescription>{translateAccountingNewApiError(t, state.error)}</AlertDescription>
        </Alert>
      ) : null}

      {renderModulePanel()}
    </div>
  );
}
