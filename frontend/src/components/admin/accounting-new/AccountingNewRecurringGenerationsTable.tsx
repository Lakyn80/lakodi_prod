"use client";

import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import type { AccountingNewRecurringGenerationListItem } from "@/types/accountingNew";
import { AccountingNewRecurringStatusBadge } from "@/components/admin/accounting-new/AccountingNewRecurringStatusBadge";
import { formatAccountingNewDate, formatAccountingNewDateTime, formatAccountingNewTemplate } from "@/components/admin/accounting-new/accountingNewFormat";

export function AccountingNewRecurringGenerationsTable({
  generations,
}: {
  generations: AccountingNewRecurringGenerationListItem[];
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.recurringDetail.fields.runDate}</TableHead>
          <TableHead>{t.recurringDetail.fields.generatedAt}</TableHead>
          <TableHead>{t.recurringDetail.fields.generationStatus}</TableHead>
          <TableHead>{t.recurringDetail.fields.generatedDocument}</TableHead>
          <TableHead>{t.recurringDetail.fields.generatedExpense}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {generations.map((generation) => (
          <TableRow key={generation.id}>
            <TableCell data-label={t.recurringDetail.fields.runDate}>{formatAccountingNewDate(generation.runDate, language, t.common.noValue)}</TableCell>
            <TableCell data-label={t.recurringDetail.fields.generatedAt}>{formatAccountingNewDateTime(generation.generatedAt, language, t.common.noValue)}</TableCell>
            <TableCell className="max-md:text-left" data-label={t.recurringDetail.fields.generationStatus}>
              <AccountingNewRecurringStatusBadge label={generation.status} />
            </TableCell>
            <TableCell className="max-md:text-left" data-label={t.recurringDetail.fields.generatedDocument}>
              {generation.generatedInvoiceId ? (
                <Link
                  href={`${ACCOUNTING_NEW_ROUTE}/doklady/${generation.generatedInvoiceId}`}
                  className="underline underline-offset-4"
                >
                  {formatAccountingNewTemplate(t.recurringDetail.generatedInvoiceLinked, {
                    id: generation.generatedInvoiceId,
                  })}
                </Link>
              ) : (
                t.recurringDetail.generatedDocumentMissing
              )}
            </TableCell>
            <TableCell className="max-md:text-left" data-label={t.recurringDetail.fields.generatedExpense}>
              {generation.generatedExpenseId ? (
                <Link
                  href={`${ACCOUNTING_NEW_ROUTE}/vydaje/${generation.generatedExpenseId}`}
                  className="underline underline-offset-4"
                >
                  {formatAccountingNewTemplate(t.recurringDetail.generatedExpenseLinked, {
                    id: generation.generatedExpenseId,
                  })}
                </Link>
              ) : (
                t.recurringDetail.generatedExpenseMissing
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
