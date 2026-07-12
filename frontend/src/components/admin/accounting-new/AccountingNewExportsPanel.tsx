"use client";

import { useState } from "react";

import { useAccountingNewCollapsibleList } from "@/components/admin/accounting-new/useAccountingNewCollapsibleList";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { AccountingNewRequestError, downloadAccountingNewExport } from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewExportKind } from "@/types/accountingNew";

const EXPORT_BUTTONS: Array<{ kind: AccountingNewExportKind; labelKey: keyof typeof translations.cs.accountingNew.exportsWrite }> = [
  { kind: "outgoing-csv", labelKey: "outgoingCsv" },
  { kind: "outgoing-xlsx", labelKey: "outgoingXlsx" },
  { kind: "expenses-csv", labelKey: "expensesCsv" },
  { kind: "expenses-xlsx", labelKey: "expensesXlsx" },
];

export function AccountingNewExportsPanel({ defaultExpanded = false }: { defaultExpanded?: boolean } = {}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const { expanded, toggle, isContentVisible } = useAccountingNewCollapsibleList(defaultExpanded);
  const contentVisible = isContentVisible(false, null);
  const [pendingKind, setPendingKind] = useState<AccountingNewExportKind | null>(null);
  const [error, setError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleDownload(kind: AccountingNewExportKind) {
    setPendingKind(kind);
    setError(null);
    setSuccessMessage(null);

    try {
      await downloadAccountingNewExport(kind);
      setSuccessMessage(t.exportsWrite.downloadSuccess);
    } catch (downloadError) {
      setError(
        downloadError instanceof AccountingNewRequestError
          ? downloadError.apiError
          : {
              resource: `export-${kind}`,
              message: downloadError instanceof Error ? downloadError.message : t.exportsWrite.downloadErrorTitle,
              status: null,
              requiresLogin: false,
            },
      );
    } finally {
      setPendingKind(null);
    }
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline">{t.exportsWrite.badge}</Badge>
          <Button type="button" variant="outline" size="sm" onClick={toggle}>
            {expanded ? t.exportsWrite.hideSection : t.exportsWrite.showSection}
          </Button>
        </div>
        <div className="space-y-1">
          <CardTitle>{t.exportsWrite.title}</CardTitle>
          <CardDescription>{t.exportsWrite.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t.exportsWrite.sectionCollapsed}</p>

        {error ? <AccountingNewMutationNotice error={error} /> : null}

        {contentVisible ? (
          <>
            {successMessage ? (
              <Alert>
                <AlertTitle>{t.documentWrite.mutation.successTitle}</AlertTitle>
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {EXPORT_BUTTONS.map(({ kind, labelKey }) => (
                <Button
                  key={kind}
                  variant="outline"
                  disabled={pendingKind !== null}
                  onClick={() => void handleDownload(kind)}
                >
                  {t.exportsWrite[labelKey]}
                </Button>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
