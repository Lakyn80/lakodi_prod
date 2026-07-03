"use client";

import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import type { AccountingNewAttachmentListItem } from "@/types/accountingNew";
import { AccountingNewAttachmentStatusBadge } from "@/components/admin/accounting-new/AccountingNewAttachmentStatusBadge";
import {
  formatAccountingNewDateTime,
  formatAccountingNewFileSize,
  formatAccountingNewTemplate,
  translateAccountingNewAttachmentType,
} from "@/components/admin/accounting-new/accountingNewFormat";

function renderRelatedLink(
  attachment: AccountingNewAttachmentListItem,
  t: (typeof translations)["cs"]["accountingNew"],
) {
  if (attachment.invoiceId) {
    return (
      <Link
        href={`${ACCOUNTING_NEW_ROUTE}/doklady/${attachment.invoiceId}`}
        className="text-foreground underline underline-offset-4"
      >
        {formatAccountingNewTemplate(t.attachments.table.invoiceLinked, { id: attachment.invoiceId })}
      </Link>
    );
  }

  if (attachment.expenseId) {
    return (
      <Link
        href={`${ACCOUNTING_NEW_ROUTE}/vydaje/${attachment.expenseId}`}
        className="text-foreground underline underline-offset-4"
      >
        {formatAccountingNewTemplate(t.attachments.table.expenseLinked, { id: attachment.expenseId })}
      </Link>
    );
  }

  if (attachment.todoId) {
    return formatAccountingNewTemplate(t.attachments.table.todoLinked, { id: attachment.todoId });
  }

  if (attachment.bankTransactionId) {
    return (
      <Link
        href={`${ACCOUNTING_NEW_ROUTE}/bankovni-transakce/${attachment.bankTransactionId}`}
        className="text-foreground underline underline-offset-4"
      >
        {formatAccountingNewTemplate(t.attachments.table.bankTransactionLinked, {
          id: attachment.bankTransactionId,
        })}
      </Link>
    );
  }

  return <span className="text-muted-foreground">{t.attachments.table.noLink}</span>;
}

export function AccountingNewAttachmentsTable({
  attachments,
}: {
  attachments: AccountingNewAttachmentListItem[];
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.attachments.table.fileName}</TableHead>
          <TableHead>{t.attachments.table.type}</TableHead>
          <TableHead>{t.attachments.table.size}</TableHead>
          <TableHead>{t.attachments.table.status}</TableHead>
          <TableHead>{t.attachments.table.relatedEntity}</TableHead>
          <TableHead>{t.attachments.table.createdAt}</TableHead>
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
            <TableCell className="align-top">{renderRelatedLink(attachment, t)}</TableCell>
            <TableCell className="align-top">
              {formatAccountingNewDateTime(attachment.createdAt, language, t.common.noValue)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
