"use client";

import { FormEvent, useEffect, useState } from "react";

import { AccountingNewConfirmDialog } from "@/components/admin/accounting-new/AccountingNewConfirmDialog";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  AccountingNewRequestError,
  previewAccountingNewReminderEmail,
  sendAccountingNewReminderEmail,
} from "@/lib/accountingNew";
import type { AccountingNewApiError } from "@/types/accountingNew";

export function AccountingNewReminderSendForm({
  invoiceId,
  todoId,
  defaultEmail,
  onSent,
}: {
  invoiceId: number;
  todoId?: number | null;
  defaultEmail?: string | null;
  onSent?: () => void;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [toEmail, setToEmail] = useState(defaultEmail ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPreview() {
      setIsLoadingPreview(true);
      setError(null);

      try {
        const preview = await previewAccountingNewReminderEmail(invoiceId, {
          signal: controller.signal,
          todoId: todoId ?? null,
          toEmail: toEmail.trim() || null,
        });
        setToEmail(preview.recipientEmail);
        setSubject(preview.subject);
        setMessage(preview.message);
      } catch (previewError) {
        if (controller.signal.aborted) return;
        if (previewError instanceof AccountingNewRequestError) {
          setError(previewError.apiError);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingPreview(false);
        }
      }
    }

    void loadPreview();
    return () => controller.abort();
  }, [invoiceId, todoId]);

  async function submitSend() {
    setIsSending(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await sendAccountingNewReminderEmail(invoiceId, {
        to_email: toEmail.trim() || null,
        todo_id: todoId ?? null,
        subject: subject.trim() || null,
        message: message.trim() || null,
      });
      setSuccessMessage(`${t.reminderWrite.sendSuccess} (${result.sentTo})`);
      setConfirmOpen(false);
      onSent?.();
    } catch (sendError) {
      setError(
        sendError instanceof AccountingNewRequestError
          ? sendError.apiError
          : {
              resource: "reminder-send",
              message: sendError instanceof Error ? sendError.message : t.errors.actionFailed,
              status: null,
              requiresLogin: false,
            },
      );
      setConfirmOpen(false);
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmOpen(true);
  }

  return (
    <>
      <form className="space-y-3 rounded-lg border border-border bg-background p-4" onSubmit={handleSubmit}>
        <div>
          <p className="text-sm font-medium text-foreground">{t.reminderWrite.sendTitle}</p>
          <p className="text-sm text-muted-foreground">{t.reminderWrite.sendDescription}</p>
        </div>
        {error ? <AccountingNewMutationNotice error={error} /> : null}
        {successMessage ? (
          <Alert>
            <AlertTitle>{t.documentWrite.mutation.successTitle}</AlertTitle>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="reminder-to-email">{t.reminderWrite.fields.toEmail}</Label>
          <Input id="reminder-to-email" value={toEmail} onChange={(event) => setToEmail(event.target.value)} disabled={isLoadingPreview} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reminder-subject">{t.reminderWrite.fields.subject}</Label>
          <Input id="reminder-subject" value={subject} onChange={(event) => setSubject(event.target.value)} disabled={isLoadingPreview} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reminder-message">{t.reminderWrite.fields.message}</Label>
          <Textarea id="reminder-message" value={message} onChange={(event) => setMessage(event.target.value)} disabled={isLoadingPreview} />
        </div>
        <Button type="submit" disabled={isSending || isLoadingPreview}>
          {t.reminderWrite.sendAction}
        </Button>
      </form>

      <AccountingNewConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t.reminderWrite.sendConfirmTitle}
        description={t.reminderWrite.sendConfirmDescription}
        confirmLabel={t.reminderWrite.sendAction}
        cancelLabel={t.documentWrite.confirm.cancel}
        isPending={isSending}
        onConfirm={() => void submitSend()}
      />
    </>
  );
}
