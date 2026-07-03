"use client";

import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import type { AccountingNewAttachmentInboxItem } from "@/types/accountingNew";
import { AccountingNewAttachmentStatusBadge } from "@/components/admin/accounting-new/AccountingNewAttachmentStatusBadge";
import {
  formatAccountingNewDateTime,
  formatAccountingNewFileSize,
  translateAccountingNewAttachmentType,
} from "@/components/admin/accounting-new/accountingNewFormat";

export function AccountingNewAttachmentInboxTable({
  attachments,
}: {
  attachments: AccountingNewAttachmentInboxItem[];
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.attachmentInbox.table.fileName}</TableHead>
          <TableHead>{t.attachmentInbox.table.type}</TableHead>
          <TableHead>{t.attachmentInbox.table.size}</TableHead>
          <TableHead>{t.attachmentInbox.table.status}</TableHead>
          <TableHead>{t.attachmentInbox.table.createdAt}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {attachments.map((attachment) => (
          <TableRow key={attachment.id}>
            <TableCell className="align-top">
              <div className="space-y-1">
                <Link
                  href={`${ACCOUNTING_NEW_ROUTE}/prilohy/${attachment.id}`}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {attachment.originalFilename}
                </Link>
                <p className="text-xs text-muted-foreground">{attachment.contentType}</p>
              </div>
            </TableCell>
            <TableCell className="align-top text-sm text-foreground">
              {translateAccountingNewAttachmentType(t, attachment.attachmentType)}
            </TableCell>
            <TableCell className="align-top">
              {formatAccountingNewFileSize(attachment.sizeBytes, language, t.common.noValue)}
            </TableCell>
            <TableCell className="align-top">
              <AccountingNewAttachmentStatusBadge label={attachment.status} />
            </TableCell>
            <TableCell className="align-top">
              {formatAccountingNewDateTime(attachment.createdAt, language, t.common.noValue)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
