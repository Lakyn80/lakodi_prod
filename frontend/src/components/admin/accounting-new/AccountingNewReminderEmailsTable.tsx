"use client";

import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import type { AccountingNewReminderEmailListItem } from "@/types/accountingNew";
import { AccountingNewTodoStatusBadge } from "@/components/admin/accounting-new/AccountingNewTodoStatusBadge";
import {
  formatAccountingNewDateTime,
  formatAccountingNewTemplate,
} from "@/components/admin/accounting-new/accountingNewFormat";

export function AccountingNewReminderEmailsTable({
  emails,
}: {
  emails: AccountingNewReminderEmailListItem[];
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.reminderEmails.table.recipient}</TableHead>
          <TableHead>{t.reminderEmails.table.subject}</TableHead>
          <TableHead>{t.reminderEmails.table.relatedDocument}</TableHead>
          <TableHead>{t.reminderEmails.table.status}</TableHead>
          <TableHead>{t.reminderEmails.table.sentAt}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {emails.map((email) => (
          <TableRow key={email.id}>
            <TableCell className="align-top">
              <Link
                href={`${ACCOUNTING_NEW_ROUTE}/upominky-emaily/${email.id}?invoiceId=${email.invoiceId}`}
                className="font-medium text-foreground underline underline-offset-4"
              >
                {email.recipientEmail}
              </Link>
            </TableCell>
            <TableCell className="align-top">
              <div className="space-y-1">
                <p className="font-medium text-foreground">{email.subject}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{email.message}</p>
              </div>
            </TableCell>
            <TableCell className="align-top">
              {email.invoiceNumber ? (
                <Link
                  href={`${ACCOUNTING_NEW_ROUTE}/doklady/${email.invoiceId}`}
                  className="text-foreground underline underline-offset-4"
                >
                  {formatAccountingNewTemplate(t.reminderEmails.table.invoiceLinked, { number: email.invoiceNumber })}
                </Link>
              ) : (
                formatAccountingNewTemplate(t.reminderEmails.table.invoiceMissing, { id: email.invoiceId })
              )}
            </TableCell>
            <TableCell className="align-top">
              <div className="flex flex-wrap gap-2">
                <AccountingNewTodoStatusBadge label={email.status} />
                <AccountingNewTodoStatusBadge label={email.reminderType} />
              </div>
            </TableCell>
            <TableCell className="align-top">
              <div className="space-y-1">
                <p>{formatAccountingNewDateTime(email.sentAt ?? email.createdAt, language, t.common.noValue)}</p>
                <p className="text-xs text-muted-foreground">
                  {t.reminderEmails.table.createdAt}: {formatAccountingNewDateTime(email.createdAt, language, t.common.noValue)}
                </p>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
