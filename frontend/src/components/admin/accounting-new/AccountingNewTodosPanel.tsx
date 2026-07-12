"use client";

import { useDeferredValue, useState } from "react";

import { useAccountingNewCollapsibleList } from "@/components/admin/accounting-new/useAccountingNewCollapsibleList";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import type { AccountingNewApiError, AccountingNewTodoListItem } from "@/types/accountingNew";
import { AccountingNewTodoGenerateButton } from "@/components/admin/accounting-new/AccountingNewTodoActions";
import { AccountingNewTodosTable } from "@/components/admin/accounting-new/AccountingNewTodosTable";
import {
  formatAccountingNewTemplate,
  getAccountingNewLocale,
  translateAccountingNewApiError,
  translateAccountingNewStatus,
  translateAccountingNewTodoType,
} from "@/components/admin/accounting-new/accountingNewFormat";

function normalizeFilterValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function matchesQuery(todo: AccountingNewTodoListItem, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [todo.title, todo.message, todo.todoType, todo.status]
    .map(normalizeFilterValue)
    .join(" ");

  return haystack.includes(query);
}

export function AccountingNewTodosPanel({
  todos,
  isLoading,
  authRequired,
  error,
  onUpdated,
  defaultExpanded = false,
}: {
  todos: AccountingNewTodoListItem[];
  isLoading: boolean;
  authRequired: boolean;
  error: AccountingNewApiError | null;
  onUpdated?: () => void;
  defaultExpanded?: boolean;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const locale = getAccountingNewLocale(language);
  const { expanded, toggle, isContentVisible } = useAccountingNewCollapsibleList(defaultExpanded);
  const contentVisible = isContentVisible(authRequired, error);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("open");
  const [todoType, setTodoType] = useState("all");
  const deferredQuery = useDeferredValue(query);

  const statusOptions = Array.from(new Set(todos.map((todo) => todo.status))).sort((left, right) =>
    left.localeCompare(right, locale),
  );
  const typeOptions = Array.from(new Set(todos.map((todo) => todo.todoType))).sort((left, right) =>
    left.localeCompare(right, locale),
  );

  const filteredTodos = todos.filter((todo) => {
    if (!matchesQuery(todo, normalizeFilterValue(deferredQuery))) {
      return false;
    }

    if (status !== "all" && todo.status !== status) {
      return false;
    }

    if (todoType !== "all" && todo.todoType !== todoType) {
      return false;
    }

    return true;
  });

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline">{t.todos.badge}</Badge>
          <Button type="button" variant="outline" size="sm" onClick={toggle}>
            {expanded ? t.todos.hideList : t.todos.showList}
          </Button>
        </div>
        <div className="space-y-1">
          <CardTitle>{t.todos.title}</CardTitle>
          <CardDescription>{t.todos.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {formatAccountingNewTemplate(t.todos.listCollapsed, { count: todos.length })}
        </p>

        {authRequired ? (
          <Alert>
            <AlertTitle>{t.auth.todosTitle}</AlertTitle>
            <AlertDescription>{t.auth.todosDescription}</AlertDescription>
          </Alert>
        ) : null}

        {error && !authRequired ? (
          <Alert variant="destructive">
            <AlertTitle>{t.errors.todosTitle}</AlertTitle>
            <AlertDescription>{translateAccountingNewApiError(t, error)}</AlertDescription>
          </Alert>
        ) : null}

        {contentVisible ? (
          <>
            {!authRequired ? <AccountingNewTodoGenerateButton onGenerated={onUpdated} /> : null}

            <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="todos-search">
              {t.todos.searchLabel}
            </label>
            <Input
              id="todos-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.todos.searchPlaceholder}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="todos-status">
              {t.todos.statusFilterLabel}
            </label>
            <select
              id="todos-status"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">{t.todos.statusAll}</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {translateAccountingNewStatus(t, option)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="todos-type">
              {t.todos.typeFilterLabel}
            </label>
            <select
              id="todos-type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={todoType}
              onChange={(event) => setTodoType(event.target.value)}
            >
              <option value="all">{t.todos.typeAll}</option>
              {typeOptions.map((option) => (
                <option key={option} value={option}>
                  {translateAccountingNewTodoType(t, option)}
                </option>
              ))}
            </select>
          </div>
        </div>

            <p className="text-sm text-muted-foreground">
              {formatAccountingNewTemplate(t.todos.shownCount, { count: filteredTodos.length })}
            </p>

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredTodos.length > 0 ? (
              <AccountingNewTodosTable todos={filteredTodos} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {todos.length > 0 ? t.empty.todosFiltered : t.empty.todos}
              </p>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
