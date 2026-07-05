"use client";

import { useState } from "react";

import { AccountingNewConfirmDialog } from "@/components/admin/accounting-new/AccountingNewConfirmDialog";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  AccountingNewRequestError,
  applyAccountingNewBankTransactionMatch,
  rejectAccountingNewBankTransactionMatch,
} from "@/lib/accountingNew";
import { canApplyAccountingNewPaymentMatch, canRejectAccountingNewPaymentMatch } from "@/lib/accountingNewSettingsWrite";
import type { AccountingNewApiError, AccountingNewPaymentMatchListItem } from "@/types/accountingNew";
import { AccountingNewDocumentStatusBadge } from "@/components/admin/accounting-new/AccountingNewDocumentStatusBadge";
import { formatAccountingNewDateTime, formatAccountingNewTemplate } from "@/components/admin/accounting-new/accountingNewFormat";

type PendingAction = { matchId: number; action: "apply" | "reject" } | null;

export function AccountingNewPaymentMatchesTable({
  matches,
  transactionId,
  onMatchApplied,
}: {
  matches: AccountingNewPaymentMatchListItem[];
  transactionId?: string;
  onMatchApplied?: () => void;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [confirmAction, setConfirmAction] = useState<PendingAction>(null);
  const [error, setError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleConfirmedAction() {
    if (!transactionId || !confirmAction) {
      return;
    }

    setPendingAction(confirmAction);
    setError(null);
    setSuccessMessage(null);

    try {
      if (confirmAction.action === "apply") {
        await applyAccountingNewBankTransactionMatch(transactionId, confirmAction.matchId);
        setSuccessMessage(t.bankWrite.applySuccess);
      } else {
        await rejectAccountingNewBankTransactionMatch(transactionId, confirmAction.matchId);
        setSuccessMessage(t.bankWrite.rejectSuccess);
      }
      setConfirmAction(null);
      onMatchApplied?.();
    } catch (actionError) {
      setError(
        actionError instanceof AccountingNewRequestError
          ? actionError.apiError
          : {
              resource: "bank-match-action",
              message: actionError instanceof Error ? actionError.message : t.errors.actionFailed,
              status: null,
              requiresLogin: false,
            },
      );
      setConfirmAction(null);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <>
      {error ? (
        <div className="mb-3">
          <AccountingNewMutationNotice error={error} />
        </div>
      ) : null}
      {successMessage ? (
        <Alert className="mb-3">
          <AlertTitle>{t.documentWrite.mutation.successTitle}</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.paymentMatching.table.type}</TableHead>
            <TableHead>{t.paymentMatching.table.link}</TableHead>
            <TableHead>{t.paymentMatching.table.confidence}</TableHead>
            <TableHead>{t.paymentMatching.table.status}</TableHead>
            <TableHead>{t.paymentMatching.table.reason}</TableHead>
            <TableHead>{t.paymentMatching.table.createdAt}</TableHead>
            {transactionId ? <TableHead>{t.bankWrite.actionsColumn}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {matches.map((match) => {
            const canApply = Boolean(transactionId) && canApplyAccountingNewPaymentMatch(match);
            const canReject = Boolean(transactionId) && canRejectAccountingNewPaymentMatch(match);

            return (
              <TableRow key={match.id}>
                <TableCell className="align-top">{match.matchType}</TableCell>
                <TableCell className="align-top">
                  <div className="space-y-1">
                    <p>
                      {match.invoiceId !== null
                        ? formatAccountingNewTemplate(t.paymentMatching.table.invoiceLinked, { id: match.invoiceId })
                        : t.paymentMatching.table.invoiceMissing}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {match.expenseId !== null
                        ? formatAccountingNewTemplate(t.paymentMatching.table.expenseLinked, { id: match.expenseId })
                        : t.paymentMatching.table.expenseMissing}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="align-top">{match.confidence}</TableCell>
                <TableCell className="align-top">
                  <AccountingNewDocumentStatusBadge label={match.status} />
                </TableCell>
                <TableCell className="align-top">{match.reason ?? t.common.noReason}</TableCell>
                <TableCell className="align-top">
                  <div className="space-y-1">
                    <p>{formatAccountingNewDateTime(match.createdAt, language, t.common.noValue)}</p>
                    <p className="text-xs text-muted-foreground">
                      {match.appliedAt
                        ? formatAccountingNewTemplate(t.common.appliedAt, {
                            value: formatAccountingNewDateTime(match.appliedAt, language, t.common.noValue),
                          })
                        : t.common.noValue}
                    </p>
                  </div>
                </TableCell>
                {transactionId ? (
                  <TableCell className="align-top">
                    <div className="flex flex-wrap gap-2">
                      {canApply ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pendingAction !== null}
                          onClick={() => setConfirmAction({ matchId: match.id, action: "apply" })}
                        >
                          {t.bankWrite.applyAction}
                        </Button>
                      ) : null}
                      {canReject ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pendingAction !== null}
                          onClick={() => setConfirmAction({ matchId: match.id, action: "reject" })}
                        >
                          {t.bankWrite.rejectAction}
                        </Button>
                      ) : null}
                      {!canApply && !canReject ? (
                        <p className="text-xs text-muted-foreground">{t.bankWrite.applyDisabledHint}</p>
                      ) : null}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AccountingNewConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
          }
        }}
        title={confirmAction?.action === "reject" ? t.bankWrite.rejectConfirmTitle : t.bankWrite.applyConfirmTitle}
        description={
          confirmAction?.action === "reject" ? t.bankWrite.rejectConfirmDescription : t.bankWrite.applyConfirmDescription
        }
        confirmLabel={confirmAction?.action === "reject" ? t.bankWrite.rejectAction : t.bankWrite.applyConfirmAction}
        cancelLabel={t.documentWrite.confirm.cancel}
        isPending={pendingAction !== null}
        onConfirm={() => void handleConfirmedAction()}
      />
    </>
  );
}
