"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import type { AccountingNewPaymentMatchListItem } from "@/types/accountingNew";
import { AccountingNewDocumentStatusBadge } from "@/components/admin/accounting-new/AccountingNewDocumentStatusBadge";
import { formatAccountingNewDateTime, formatAccountingNewTemplate } from "@/components/admin/accounting-new/accountingNewFormat";

export function AccountingNewPaymentMatchesTable({
  matches,
}: {
  matches: AccountingNewPaymentMatchListItem[];
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.paymentMatching.table.type}</TableHead>
          <TableHead>{t.paymentMatching.table.link}</TableHead>
          <TableHead>{t.paymentMatching.table.confidence}</TableHead>
          <TableHead>{t.paymentMatching.table.status}</TableHead>
          <TableHead>{t.paymentMatching.table.reason}</TableHead>
          <TableHead>{t.paymentMatching.table.createdAt}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {matches.map((match) => (
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
