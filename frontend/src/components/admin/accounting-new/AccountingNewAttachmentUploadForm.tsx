"use client";

import { FormEvent, useRef, useState } from "react";

import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { AccountingNewRequestError, uploadAccountingNewAttachment } from "@/lib/accountingNew";
import type { AccountingNewApiError } from "@/types/accountingNew";

export function AccountingNewAttachmentUploadForm({ onUploaded }: { onUploaded?: () => void }) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await uploadAccountingNewAttachment({ file, note: note.trim() || null });
      setSuccessMessage(t.attachmentWrite.uploadSuccess);
      setNote("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      onUploaded?.();
    } catch (uploadError) {
      setError(
        uploadError instanceof AccountingNewRequestError
          ? uploadError.apiError
          : {
              resource: "attachment-upload",
              message: uploadError instanceof Error ? uploadError.message : t.errors.actionFailed,
              status: null,
              requiresLogin: false,
            },
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form className="space-y-3 rounded-lg border border-border bg-background p-4" onSubmit={handleSubmit}>
      <div>
        <p className="text-sm font-medium text-foreground">{t.attachmentWrite.uploadTitle}</p>
        <p className="text-sm text-muted-foreground">{t.attachmentWrite.uploadDescription}</p>
      </div>
      {error ? <AccountingNewMutationNotice error={error} /> : null}
      {successMessage ? (
        <Alert>
          <AlertTitle>{t.documentWrite.mutation.successTitle}</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="attachment-upload-file">{t.attachmentWrite.fields.file}</Label>
        <Input id="attachment-upload-file" ref={fileInputRef} type="file" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="attachment-upload-note">{t.attachmentWrite.fields.note}</Label>
        <Input id="attachment-upload-note" value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      <Button type="submit" disabled={isUploading}>
        {t.attachmentWrite.uploadAction}
      </Button>
    </form>
  );
}
