"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import type { AccountingNewDocumentListItem } from "@/types/accountingNew";
import { AccountingNewDocumentStatusBadge } from "@/components/admin/accounting-new/AccountingNewDocumentStatusBadge";
import { AccountingNewMoney } from "@/components/admin/accounting-new/AccountingNewMoney";
import {
  formatAccountingNewDate,
  formatAccountingNewTemplate,
  translateAccountingNewDocumentKind,
} from "@/components/admin/accounting-new/accountingNewFormat";

export function AccountingNewDocumentsTable({
  documents,
}: {
  documents: AccountingNewDocumentListItem[];
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.documents.table.document}</TableHead>
          <TableHead>{t.documents.table.kind}</TableHead>
          <TableHead>{t.documents.table.customer}</TableHead>
          <TableHead>{t.documents.table.issueDate}</TableHead>
          <TableHead>{t.documents.table.dueDate}</TableHead>
          <TableHead className="text-right">{t.documents.table.total}</TableHead>
          <TableHead>{t.documents.table.statuses}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((document) => (
          <TableRow key={document.id}>
            <TableCell className="align-top">
              <div className="space-y-1">
                <Link
                  href={`${ACCOUNTING_NEW_ROUTE}/doklady/${document.id}`}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {document.invoiceNumber}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {formatAccountingNewTemplate(t.documents.table.variableSymbol, { value: document.variableSymbol })}
                </p>
              </div>
            </TableCell>
            <TableCell className="align-top">
              <Badge variant="outline">{translateAccountingNewDocumentKind(t, document.documentKind)}</Badge>
            </TableCell>
            <TableCell className="align-top">
              <div className="space-y-1">
                <p className="font-medium text-foreground">{document.customerName}</p>
                <p className="text-xs text-muted-foreground">{document.customerEmail}</p>
              </div>
            </TableCell>
            <TableCell className="align-top">{formatAccountingNewDate(document.issueDate, language, t.common.noValue)}</TableCell>
            <TableCell className="align-top">{formatAccountingNewDate(document.dueDate, language, t.common.noValue)}</TableCell>
            <TableCell className="text-right align-top">
              <div className="space-y-1">
                <AccountingNewMoney amount={document.total} currency={document.currency} className="font-medium text-foreground" />
                <p className="text-xs text-muted-foreground">{document.currency}</p>
              </div>
            </TableCell>
            <TableCell className="align-top">
              <div className="flex flex-wrap gap-2">
                <AccountingNewDocumentStatusBadge label={document.paymentStatus} />
                <AccountingNewDocumentStatusBadge label={document.effectiveStatus} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
