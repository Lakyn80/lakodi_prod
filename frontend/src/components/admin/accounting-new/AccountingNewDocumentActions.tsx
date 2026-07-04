"use client";

import Link from "next/link";
import { useState } from "react";

import { AccountingNewConfirmDialog } from "@/components/admin/accounting-new/AccountingNewConfirmDialog";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { Button } from "@/components/ui/button";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ACCOUNTING_NEW_ROUTE,
  AccountingNewRequestError,
  downloadAccountingNewDocumentPdf,
  finalizeAccountingNewDocument,
} from "@/lib/accountingNew";
import {
  buildAccountingNewDocumentWritePayloadFromDetail,
  canAccountingNewDocumentEdit,
  canAccountingNewDocumentIssue,
} from "@/lib/accountingNewDocumentWrite";
import type { AccountingNewApiError, AccountingNewDocumentDetail } from "@/types/accountingNew";

export function AccountingNewDocumentActions({
  detail,
  onUpdated,
}: {
  detail: AccountingNewDocumentDetail;
  onUpdated: (detail: AccountingNewDocumentDetail) => void;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [issueOpen, setIssueOpen] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [mutationError, setMutationError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canEdit = canAccountingNewDocumentEdit(detail);
  const canIssue = canAccountingNewDocumentIssue(detail);

  async function handleIssue() {
    setIsIssuing(true);
    setMutationError(null);
    setSuccessMessage(null);

    try {
      const payload = buildAccountingNewDocumentWritePayloadFromDetail(detail, "issued");
      const updated = await finalizeAccountingNewDocument(detail.id, payload);
      setSuccessMessage(t.documentWrite.issue.success);
      setIssueOpen(false);
      onUpdated(updated);
    } catch (error) {
      if (error instanceof AccountingNewRequestError) {
        setMutationError(error.apiError);
      }
    } finally {
      setIsIssuing(false);
    }
  }

  async function handleDownloadPdf() {
    setIsDownloading(true);
    setMutationError(null);

    try {
      await downloadAccountingNewDocumentPdf(detail.id);
    } catch (error) {
      if (error instanceof AccountingNewRequestError) {
        setMutationError(error.apiError);
      }
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <AccountingNewMutationNotice successMessage={successMessage} error={mutationError} />

      <div className="flex flex-wrap gap-3">
        {canEdit ? (
          <Button variant="outline" asChild>
            <Link href={`${ACCOUNTING_NEW_ROUTE}/doklady/${detail.id}/upravit`}>{t.documentWrite.actions.editDraft}</Link>
          </Button>
        ) : (
          <Button variant="outline" disabled title={t.documentWrite.actions.editDisabledHint}>
            {t.documentWrite.actions.editDraft}
          </Button>
        )}

        {canIssue ? (
          <Button onClick={() => setIssueOpen(true)} disabled={isIssuing}>
            {t.documentWrite.actions.issueDocument}
          </Button>
        ) : (
          <Button variant="secondary" disabled title={t.documentWrite.actions.issueDisabledHint}>
            {t.documentWrite.actions.issueDocument}
          </Button>
        )}

        <Button variant="outline" onClick={() => void handleDownloadPdf()} disabled={isDownloading}>
          {t.documentWrite.actions.downloadPdf}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">{t.documentWrite.emailDeferred}</p>

      <AccountingNewConfirmDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        title={t.documentWrite.issue.confirmTitle}
        description={t.documentWrite.issue.confirmDescription}
        confirmLabel={t.documentWrite.issue.confirmAction}
        cancelLabel={t.documentWrite.confirm.cancel}
        isPending={isIssuing}
        onConfirm={handleIssue}
      />
    </div>
  );
}
