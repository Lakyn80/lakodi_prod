"use client";

import { useState } from "react";

import { AccountingNewConfirmDialog } from "@/components/admin/accounting-new/AccountingNewConfirmDialog";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  AiAccountingRequestError,
  approveAiAccountingAction,
  getAiAccountingAction,
  rejectAiAccountingAction,
} from "@/lib/aiAccountingAdmin";
import type { AiAccountingActionView, AiAccountingApiError } from "@/types/aiAccounting";

function isPendingAction(status: string): boolean {
  return status.trim().toLowerCase() === "pending";
}

export function AccountingNewAiActionCard({
  action,
  onUpdated,
}: {
  action: AiAccountingActionView;
  onUpdated: (next: AiAccountingActionView) => void;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew.aiChat;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<AiAccountingApiError | null>(null);

  const canDecide = isPendingAction(action.status) && pending === null;

  async function refreshAction() {
    const fresh = await getAiAccountingAction(action.action_id);
    onUpdated(fresh);
  }

  async function handleApprove() {
    if (pending) {
      return;
    }
    setPending("approve");
    setError(null);
    try {
      const updated = await approveAiAccountingAction(action.action_id);
      onUpdated(updated);
      setConfirmOpen(false);
    } catch (approveError) {
      setError(
        approveError instanceof AiAccountingRequestError
          ? approveError.apiError
          : {
              resource: "ai-action-approve",
              message: approveError instanceof Error ? approveError.message : t.actionApproveError,
              status: null,
              requiresLogin: false,
            },
      );
      try {
        await refreshAction();
      } catch {
        // Keep previous action view if refresh fails.
      }
    } finally {
      setPending(null);
    }
  }

  async function handleReject() {
    if (pending) {
      return;
    }
    setPending("reject");
    setError(null);
    try {
      const updated = await rejectAiAccountingAction(action.action_id, {});
      onUpdated(updated);
    } catch (rejectError) {
      setError(
        rejectError instanceof AiAccountingRequestError
          ? rejectError.apiError
          : {
              resource: "ai-action-reject",
              message: rejectError instanceof Error ? rejectError.message : t.actionRejectError,
              status: null,
              requiresLogin: false,
            },
      );
      try {
        await refreshAction();
      } catch {
        // Keep previous action view if refresh fails.
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <Card className="border-border bg-muted/30" data-testid="ai-action-card">
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" data-testid="ai-action-status">
            {t.actionStatusLabel}: {action.status}
          </Badge>
          <Badge variant="secondary">{action.operation_type}</Badge>
          <Badge variant="outline">{action.risk_level}</Badge>
        </div>
        <CardTitle className="text-base">{t.actionTitle}</CardTitle>
        <CardDescription data-testid="ai-action-summary">{action.safe_summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <AccountingNewMutationNotice error={error} /> : null}

        {isPendingAction(action.status) ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              data-testid="ai-action-approve"
              disabled={!canDecide}
              onClick={() => setConfirmOpen(true)}
            >
              {pending === "approve" ? t.actionApproving : t.actionApprove}
            </Button>
            <Button
              type="button"
              variant="outline"
              data-testid="ai-action-reject"
              disabled={!canDecide}
              onClick={() => void handleReject()}
            >
              {pending === "reject" ? t.actionRejecting : t.actionReject}
            </Button>
          </div>
        ) : (
          <Alert>
            <AlertTitle>{t.actionResolvedTitle}</AlertTitle>
            <AlertDescription>{t.actionResolvedDescription}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      <AccountingNewConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!pending) {
            setConfirmOpen(open);
          }
        }}
        title={t.actionApproveConfirmTitle}
        description={t.actionApproveConfirmDescription}
        confirmLabel={t.actionApproveConfirm}
        cancelLabel={t.actionApproveCancel}
        isPending={pending === "approve"}
        onConfirm={() => void handleApprove()}
      />
    </Card>
  );
}
