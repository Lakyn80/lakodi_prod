import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import type { AccountingNewExpenseListItem } from "@/types/accountingNew";
import { AccountingNewDocumentStatusBadge } from "@/components/admin/accounting-new/AccountingNewDocumentStatusBadge";
import { AccountingNewMoney } from "@/components/admin/accounting-new/AccountingNewMoney";
import { formatAccountingNewDate } from "@/components/admin/accounting-new/accountingNewFormat";

export function AccountingNewExpensesTable({
  expenses,
}: {
  expenses: AccountingNewExpenseListItem[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Výdaj</TableHead>
          <TableHead>Dodavatel</TableHead>
          <TableHead>Vystavení</TableHead>
          <TableHead>Přijetí / zdanění</TableHead>
          <TableHead>Splatnost</TableHead>
          <TableHead className="text-right">Celkem</TableHead>
          <TableHead>Stavy</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {expenses.map((expense) => (
          <TableRow key={expense.id}>
            <TableCell className="align-top">
              <div className="space-y-1">
                <Link
                  href={`${ACCOUNTING_NEW_ROUTE}/vydaje/${expense.id}`}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {expense.expenseNumber}
                </Link>
                <p className="text-xs text-muted-foreground">VS {expense.variableSymbol}</p>
              </div>
            </TableCell>
            <TableCell className="align-top">
              <div className="space-y-1">
                <p className="font-medium text-foreground">{expense.supplierName}</p>
                <p className="text-xs text-muted-foreground">{expense.supplierEmail}</p>
              </div>
            </TableCell>
            <TableCell className="align-top">{formatAccountingNewDate(expense.issueDate)}</TableCell>
            <TableCell className="align-top">
              <div className="space-y-1">
                <p>{formatAccountingNewDate(expense.receivedDate)}</p>
                <p className="text-xs text-muted-foreground">{formatAccountingNewDate(expense.taxableSupplyDate)}</p>
              </div>
            </TableCell>
            <TableCell className="align-top">{formatAccountingNewDate(expense.dueDate)}</TableCell>
            <TableCell className="text-right align-top">
              <div className="space-y-1">
                <AccountingNewMoney amount={expense.total} currency={expense.currency} className="font-medium text-foreground" />
                <p className="text-xs text-muted-foreground">{expense.currency}</p>
              </div>
            </TableCell>
            <TableCell className="align-top">
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
