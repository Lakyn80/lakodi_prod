"use client";

import Link from "next/link";
import { useState } from "react";

import { AccountingNewConfirmDialog } from "@/components/admin/accounting-new/AccountingNewConfirmDialog";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { formatAccountingNewTemplate } from "@/components/admin/accounting-new/accountingNewFormat";
import { Button } from "@/components/ui/button";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ACCOUNTING_NEW_ROUTE,
  AccountingNewRequestError,
  downloadAccountingNewDocumentPdf,
  finalizeAccountingNewDocument,
  listAccountingNewSubjects,
  sendAccountingNewDocumentEmail,
} from "@/lib/accountingNew";
import {
  buildAccountingNewCustomerInputFromDocumentDetail,
  resolveOrCreateAccountingNewCustomer,
} from "@/lib/accountingNewCustomerPersistence";
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
  const [emailOpen, setEmailOpen] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [mutationError, setMutationError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canEdit = canAccountingNewDocumentEdit(detail);
  const canIssue = canAccountingNewDocumentIssue(detail);
  const emailT = t.documentWrite.email ??
    t.emailWrite ?? {
      sendAction: "Odeslat doklad e-mailem",
      sendConfirmTitle: "Potvrdit odeslání dokladu",
      sendConfirmDescription: "Doklad se odešle na e-mail odběratele.",
      sendSuccess: "Doklad byl odeslán",
    };

  async function handleIssue() {
    setIsIssuing(true);
    setMutationError(null);
    setSuccessMessage(null);

    try {
      let payload = buildAccountingNewDocumentWritePayloadFromDetail(detail, "issued");
      let issueSuccessMessage = t.documentWrite.issue.success;

      if (!detail.subjectId) {
        const subjects = await listAccountingNewSubjects();
        const persistence = await resolveOrCreateAccountingNewCustomer(
          subjects,
          buildAccountingNewCustomerInputFromDocumentDetail(detail),
        );

        if (persistence.status === "ambiguous") {
          setMutationError({
            resource: "customer-persistence",
            message: formatAccountingNewTemplate(t.customerPersistence.ambiguousCustomerMatch, {
              count: persistence.matches.length,
            }),
            status: null,
            requiresLogin: false,
          });
          return;
        }

        if (persistence.status === "failed") {
          setMutationError(persistence.error);
          return;
        }

        if (persistence.status === "skipped") {
          setMutationError({
            resource: "customer-persistence",
            message: t.customerPersistence.customerPersistenceRequired,
            status: null,
            requiresLogin: false,
          });
          return;
        }

        payload = {
          ...payload,
          subject_id: persistence.subject.id,
          customer_name: null,
          customer_email: null,
          customer_address: null,
        };

        if (persistence.status === "created") {
          issueSuccessMessage = t.customerPersistence.customerSaved;
        } else if (persistence.matchField === "ico") {
          issueSuccessMessage = t.customerPersistence.existingCustomerReused;
        } else {
          issueSuccessMessage = t.customerPersistence.duplicateCustomerFound;
        }
      }

      const updated = await finalizeAccountingNewDocument(detail.id, payload);
      setSuccessMessage(issueSuccessMessage);
      setIssueOpen(false);
      onUpdated(updated);
    } catch (error) {
      if (error instanceof AccountingNewRequestError) {
        setMutationError(error.apiError);
      } else {
        setMutationError({
          resource: "document-actions",
          message: t.errors.actionFailed,
          status: null,
          requiresLogin: false,
        });
      }
    } finally {
      setIsIssuing(false);
    }
  }

  async function handleSendEmail() {
    setIsSendingEmail(true);
    setMutationError(null);
    setSuccessMessage(null);

    try {
      const result = await sendAccountingNewDocumentEmail(detail.id, {
        to_email: detail.customerEmail,
      });
      setSuccessMessage(`${emailT.sendSuccess} (${result.sentTo})`);
      setEmailOpen(false);
    } catch (error) {
      if (error instanceof AccountingNewRequestError) {
        setMutationError(error.apiError);
      } else {
        setMutationError({
          resource: "document-email",
          message: t.errors.actionFailed,
          status: null,
          requiresLogin: false,
        });
      }
      setEmailOpen(false);
    } finally {
      setIsSendingEmail(false);
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
            <Link href={`${ACCOUNTING_NEW_ROUTE}/doklady/${detail.id}/upravit`}>{t.documentWrite.actions.editDocument}</Link>
          </Button>
        ) : (
          <Button variant="outline" disabled title={t.documentWrite.actions.editDisabledHint}>
            {t.documentWrite.actions.editDocument}
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

        {detail.status !== "draft" ? (
          <Button variant="outline" onClick={() => setEmailOpen(true)} disabled={isSendingEmail}>
            {emailT.sendAction}
          </Button>
        ) : null}
      </div>

      <AccountingNewConfirmDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        title={emailT.sendConfirmTitle}
        description={emailT.sendConfirmDescription}
        confirmLabel={emailT.sendAction}
        cancelLabel={t.documentWrite.confirm.cancel}
        isPending={isSendingEmail}
        onConfirm={() => void handleSendEmail()}
      />

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
