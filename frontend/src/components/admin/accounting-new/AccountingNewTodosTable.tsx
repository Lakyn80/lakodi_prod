"use client";

import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import type { AccountingNewTodoListItem } from "@/types/accountingNew";
import { AccountingNewTodoStatusBadge } from "@/components/admin/accounting-new/AccountingNewTodoStatusBadge";
import {
  formatAccountingNewDate,
  formatAccountingNewDateTime,
  formatAccountingNewTemplate,
  translateAccountingNewTodoType,
} from "@/components/admin/accounting-new/accountingNewFormat";

function renderRelatedLink(todo: AccountingNewTodoListItem, t: (typeof translations)["cs"]["accountingNew"]) {
  if (todo.invoiceId) {
    return (
      <Link
        href={`${ACCOUNTING_NEW_ROUTE}/doklady/${todo.invoiceId}`}
        className="text-foreground underline underline-offset-4"
      >
        {formatAccountingNewTemplate(t.todos.table.invoiceLinked, { id: todo.invoiceId })}
      </Link>
    );
  }

  if (todo.expenseId) {
    return (
      <Link
        href={`${ACCOUNTING_NEW_ROUTE}/vydaje/${todo.expenseId}`}
        className="text-foreground underline underline-offset-4"
      >
        {formatAccountingNewTemplate(t.todos.table.expenseLinked, { id: todo.expenseId })}
      </Link>
    );
  }

  return <span className="text-muted-foreground">{t.todos.table.noLink}</span>;
}

export function AccountingNewTodosTable({ todos }: { todos: AccountingNewTodoListItem[] }) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.todos.table.title}</TableHead>
          <TableHead>{t.todos.table.status}</TableHead>
          <TableHead>{t.todos.table.type}</TableHead>
          <TableHead>{t.todos.table.dueDate}</TableHead>
          <TableHead>{t.todos.table.relatedDocument}</TableHead>
          <TableHead>{t.todos.table.createdAt}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {todos.map((todo) => (
          <TableRow key={todo.id}>
            <TableCell className="align-top max-md:text-left" data-label={t.todos.table.title}>
              <div className="space-y-1">
                <Link
                  href={`${ACCOUNTING_NEW_ROUTE}/ukoly/${todo.id}`}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {todo.title}
                </Link>
                {todo.message ? <p className="text-xs text-muted-foreground line-clamp-2">{todo.message}</p> : null}
              </div>
            </TableCell>
            <TableCell className="align-top max-md:text-left" data-label={t.todos.table.status}>
              <AccountingNewTodoStatusBadge label={todo.status} />
            </TableCell>
            <TableCell className="align-top text-sm text-foreground" data-label={t.todos.table.type}>
              {translateAccountingNewTodoType(t, todo.todoType)}
            </TableCell>
            <TableCell className="align-top" data-label={t.todos.table.dueDate}>{formatAccountingNewDate(todo.dueDate, language, t.common.noValue)}</TableCell>
            <TableCell className="align-top max-md:text-left" data-label={t.todos.table.relatedDocument}>{renderRelatedLink(todo, t)}</TableCell>
            <TableCell className="align-top" data-label={t.todos.table.createdAt}>
              <div className="space-y-1">
                <p>{formatAccountingNewDateTime(todo.createdAt, language, t.common.noValue)}</p>
                {todo.completedAt ? (
                  <p className="text-xs text-muted-foreground">
                    {t.todos.table.completedAt}: {formatAccountingNewDateTime(todo.completedAt, language, t.common.noValue)}
                  </p>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
