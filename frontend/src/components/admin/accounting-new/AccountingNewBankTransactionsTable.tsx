import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import type { AccountingNewBankTransactionListItem } from "@/types/accountingNew";
import { AccountingNewDocumentStatusBadge } from "@/components/admin/accounting-new/AccountingNewDocumentStatusBadge";
import { AccountingNewMoney } from "@/components/admin/accounting-new/AccountingNewMoney";
import { formatAccountingNewDate } from "@/components/admin/accounting-new/accountingNewFormat";

export function AccountingNewBankTransactionsTable({
  transactions,
}: {
  transactions: AccountingNewBankTransactionListItem[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Datum</TableHead>
          <TableHead>Částka</TableHead>
          <TableHead>Směr</TableHead>
          <TableHead>Protistrana</TableHead>
          <TableHead>Účet / VS</TableHead>
          <TableHead>Zpráva</TableHead>
          <TableHead>Stav</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((transaction) => (
          <TableRow key={transaction.id}>
            <TableCell className="align-top">
              <div className="space-y-1">
                <Link
                  href={`${ACCOUNTING_NEW_ROUTE}/bankovni-transakce/${transaction.id}`}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {formatAccountingNewDate(transaction.transactionDate)}
                </Link>
                <p className="text-xs text-muted-foreground">
                  Zaúčtováno {formatAccountingNewDate(transaction.bookedDate)}
                </p>
              </div>
            </TableCell>
            <TableCell className="align-top">
              <div className="space-y-1">
                <AccountingNewMoney amount={transaction.amount} currency={transaction.currency} className="font-medium text-foreground" />
                <p className="text-xs text-muted-foreground">{transaction.currency}</p>
              </div>
            </TableCell>
            <TableCell className="align-top">{transaction.direction}</TableCell>
            <TableCell className="align-top">
              <div className="space-y-1">
                <p className="font-medium text-foreground">{transaction.counterpartyName ?? "Neuvedeno"}</p>
                <p className="text-xs text-muted-foreground">{transaction.counterpartyAccount ?? "Účet neuveden"}</p>
              </div>
            </TableCell>
            <TableCell className="align-top">
              <div className="space-y-1">
                <p>{transaction.variableSymbol ?? "VS neuveden"}</p>
                <p className="text-xs text-muted-foreground">
                  {transaction.constantSymbol ?? "KS -"} / {transaction.specificSymbol ?? "SS -"}
                </p>
              </div>
            </TableCell>
            <TableCell className="align-top">
              <p className="max-w-xs whitespace-pre-wrap text-sm text-foreground">
                {transaction.message ?? "Bez zprávy"}
              </p>
            </TableCell>
            <TableCell className="align-top">
              <AccountingNewDocumentStatusBadge label={transaction.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
