"use client";

import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import type { AccountingNewBankTransactionListItem } from "@/types/accountingNew";
import { AccountingNewDocumentStatusBadge } from "@/components/admin/accounting-new/AccountingNewDocumentStatusBadge";
import { AccountingNewMoney } from "@/components/admin/accounting-new/AccountingNewMoney";
import {
  formatAccountingNewDate,
  formatAccountingNewTemplate,
  translateAccountingNewTransactionDirection,
} from "@/components/admin/accounting-new/accountingNewFormat";

export function AccountingNewBankTransactionsTable({
  transactions,
}: {
  transactions: AccountingNewBankTransactionListItem[];
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.bankTransactions.table.date}</TableHead>
          <TableHead>{t.bankTransactions.table.amount}</TableHead>
          <TableHead>{t.bankTransactions.table.direction}</TableHead>
          <TableHead>{t.bankTransactions.table.counterparty}</TableHead>
          <TableHead>{t.bankTransactions.table.accountAndSymbols}</TableHead>
          <TableHead>{t.bankTransactions.table.message}</TableHead>
          <TableHead>{t.bankTransactions.table.status}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((transaction) => (
          <TableRow key={transaction.id}>
            <TableCell className="align-top max-md:text-left" data-label={t.bankTransactions.table.date}>
              <div className="space-y-1">
                <Link
                  href={`${ACCOUNTING_NEW_ROUTE}/bankovni-transakce/${transaction.id}`}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {formatAccountingNewDate(transaction.transactionDate, language, t.common.noValue)}
                </Link>
                {transaction.bookedDate ? (
                  <p className="text-xs text-muted-foreground">
                    {formatAccountingNewTemplate(t.bankTransactions.table.bookedDate, {
                      value: formatAccountingNewDate(transaction.bookedDate, language, t.common.noValue),
                    })}
                  </p>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="align-top" data-label={t.bankTransactions.table.amount}>
              <div className="space-y-1">
                <AccountingNewMoney amount={transaction.amount} currency={transaction.currency} className="font-medium text-foreground" />
                <p className="text-xs text-muted-foreground">{transaction.currency}</p>
              </div>
            </TableCell>
            <TableCell className="align-top" data-label={t.bankTransactions.table.direction}>{translateAccountingNewTransactionDirection(t, transaction.direction)}</TableCell>
            <TableCell className="align-top max-md:text-left" data-label={t.bankTransactions.table.counterparty}>
              <div className="space-y-1">
                <p className="font-medium text-foreground">{transaction.counterpartyName ?? t.common.noValue}</p>
                <p className="text-xs text-muted-foreground">{transaction.counterpartyAccount ?? t.common.noAccount}</p>
              </div>
            </TableCell>
            <TableCell className="align-top max-md:text-left" data-label={t.bankTransactions.table.accountAndSymbols}>
              <div className="space-y-1">
                <p>{transaction.variableSymbol ?? t.common.noVariableSymbol}</p>
                <p className="text-xs text-muted-foreground">
                  {transaction.constantSymbol ?? t.common.noConstantSymbol} / {transaction.specificSymbol ?? t.common.noSpecificSymbol}
                </p>
              </div>
            </TableCell>
            <TableCell className="align-top max-md:text-left" data-label={t.bankTransactions.table.message}>
              <p className="max-w-xs whitespace-pre-wrap text-sm text-foreground">
                {transaction.message ?? t.common.noMessage}
              </p>
            </TableCell>
            <TableCell className="align-top max-md:text-left" data-label={t.bankTransactions.table.status}>
              <AccountingNewDocumentStatusBadge label={transaction.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
