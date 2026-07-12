"use client";

import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import type { AccountingNewExpenseListItem } from "@/types/accountingNew";
import { AccountingNewDocumentStatusBadge } from "@/components/admin/accounting-new/AccountingNewDocumentStatusBadge";
import { AccountingNewMoney } from "@/components/admin/accounting-new/AccountingNewMoney";
import { formatAccountingNewDate, formatAccountingNewTemplate } from "@/components/admin/accounting-new/accountingNewFormat";

export function AccountingNewExpensesTable({
  expenses,
}: {
  expenses: AccountingNewExpenseListItem[];
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.expenses.table.expense}</TableHead>
          <TableHead>{t.expenses.table.supplier}</TableHead>
          <TableHead>{t.expenses.table.issueDate}</TableHead>
          <TableHead>{t.expenses.table.receivedAndTaxable}</TableHead>
          <TableHead>{t.expenses.table.dueDate}</TableHead>
          <TableHead className="text-right">{t.expenses.table.total}</TableHead>
          <TableHead>{t.expenses.table.statuses}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {expenses.map((expense) => (
          <TableRow key={expense.id}>
            <TableCell className="align-top max-md:text-left" data-label={t.expenses.table.expense}>
              <div className="space-y-1">
                <Link
                  href={`${ACCOUNTING_NEW_ROUTE}/vydaje/${expense.id}`}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {expense.expenseNumber}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {formatAccountingNewTemplate(t.expenses.table.variableSymbol, { value: expense.variableSymbol })}
                </p>
              </div>
            </TableCell>
            <TableCell className="align-top max-md:text-left" data-label={t.expenses.table.supplier}>
              <div className="space-y-1">
                <p className="font-medium text-foreground">{expense.supplierName}</p>
                <p className="text-xs text-muted-foreground">{expense.supplierEmail}</p>
              </div>
            </TableCell>
            <TableCell className="align-top" data-label={t.expenses.table.issueDate}>{formatAccountingNewDate(expense.issueDate, language, t.common.noValue)}</TableCell>
            <TableCell className="align-top" data-label={t.expenses.table.receivedAndTaxable}>
              <div className="space-y-1">
                <p>{formatAccountingNewDate(expense.receivedDate, language, t.common.noValue)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatAccountingNewDate(expense.taxableSupplyDate, language, t.common.noValue)}
                </p>
              </div>
            </TableCell>
            <TableCell className="align-top" data-label={t.expenses.table.dueDate}>{formatAccountingNewDate(expense.dueDate, language, t.common.noValue)}</TableCell>
            <TableCell className="text-right align-top" data-label={t.expenses.table.total}>
              <div className="space-y-1">
                <AccountingNewMoney amount={expense.total} currency={expense.currency} className="font-medium text-foreground" />
                <p className="text-xs text-muted-foreground">{expense.currency}</p>
              </div>
            </TableCell>
            <TableCell className="align-top max-md:text-left" data-label={t.expenses.table.statuses}>
              <div className="flex flex-wrap gap-2">
                <AccountingNewDocumentStatusBadge label={expense.paymentStatus} />
                <AccountingNewDocumentStatusBadge label={expense.status} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
