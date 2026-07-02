"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE, getAccountingNewBankTransaction, listAccountingNewBankTransactionMatches } from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewBankTransactionDetailState } from "@/types/accountingNew";
import { AccountingNewDocumentStatusBadge } from "@/components/admin/accounting-new/AccountingNewDocumentStatusBadge";
import { AccountingNewMatchCandidatesList } from "@/components/admin/accounting-new/AccountingNewMatchCandidatesList";
import { AccountingNewMoney } from "@/components/admin/accounting-new/AccountingNewMoney";
import { AccountingNewPaymentMatchesTable } from "@/components/admin/accounting-new/AccountingNewPaymentMatchesTable";
import {
  formatAccountingNewDate,
  formatAccountingNewDateTime,
  formatAccountingNewTemplate,
  translateAccountingNewStatus,
  translateAccountingNewTransactionDirection,
} from "@/components/admin/accounting-new/accountingNewFormat";

function getFirstError(errors: AccountingNewApiError[]): AccountingNewApiError | null {
  return errors[0] ?? null;
}

function DetailLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-56" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

function MetaRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

export function AccountingNewBankTransactionDetail({
  transactionId,
}: {
  transactionId: string;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [state, setState] = useState<AccountingNewBankTransactionDetailState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadDetail() {
      setState({ status: "loading" });

      try {
        const detail = await getAccountingNewBankTransaction(transactionId, { signal: controller.signal });
        const matchesResult = await Promise.allSettled([
          listAccountingNewBankTransactionMatches(transactionId, { signal: controller.signal }),
        ]);

        const partialErrors: AccountingNewApiError[] = [];
        const matches = matchesResult[0].status === "fulfilled" ? matchesResult[0].value : [];

        if (matchesResult[0].status === "rejected" && matchesResult[0].reason?.apiError) {
          partialErrors.push(matchesResult[0].reason.apiError as AccountingNewApiError);
        }

        setState({
          status: "ready",
          detail,
          matches,
          partialErrors,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        const apiError =
          typeof error === "object" &&
          error !== null &&
          "apiError" in error &&
          typeof (error as { apiError?: unknown }).apiError === "object"
            ? ((error as { apiError: AccountingNewApiError }).apiError as AccountingNewApiError)
            : {
                resource: "bank-transaction-detail",
                message: error instanceof Error ? error.message : t.errors.bankTransactionDetailTitle,
                status: null,
                requiresLogin: false,
              };

        if (apiError.requiresLogin || apiError.status === 401) {
          setState({ status: "auth", error: apiError });
          return;
        }

        if (apiError.status === 404) {
          setState({ status: "not_found", error: apiError });
          return;
        }

        setState({ status: "error", error: apiError });
      }
    }

    void loadDetail();

    return () => controller.abort();
  }, [transactionId, t.errors.bankTransactionDetailTitle]);

  const partialError = state.status === "ready" ? getFirstError(state.partialErrors) : null;

  if (state.status === "loading") {
    return <DetailLoading />;
  }

  if (state.status === "auth") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={ACCOUNTING_NEW_ROUTE}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Alert>
          <AlertTitle>{t.auth.bankTransactionDetailTitle}</AlertTitle>
          <AlertDescription>{t.auth.bankTransactionDetailDescription}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (state.status === "not_found") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={ACCOUNTING_NEW_ROUTE}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Alert>
          <AlertTitle>{t.bankTransactionDetail.notFoundTitle}</AlertTitle>
          <AlertDescription>{t.bankTransactionDetail.notFoundDescription}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={ACCOUNTING_NEW_ROUTE}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Alert variant="destructive">
          <AlertTitle>{t.errors.bankTransactionDetailTitle}</AlertTitle>
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { detail, matches } = state;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <Link href={ACCOUNTING_NEW_ROUTE}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Badge variant="secondary">{t.common.readOnlyDetail}</Badge>
        <Badge variant="outline">{t.bankTransactions.badge}</Badge>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <AccountingNewDocumentStatusBadge label={detail.status} />
            <Badge variant="secondary">{t.bankTransactionDetail.importBadge}</Badge>
          </div>
          <div className="space-y-1">
            <CardTitle>{formatAccountingNewTemplate(t.bankTransactionDetail.title, { id: detail.id })}</CardTitle>
            <CardDescription>{t.bankTransactionDetail.description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetaRow label={t.bankTransactionDetail.fields.transactionDate} value={formatAccountingNewDate(detail.transactionDate, language, t.common.noValue)} />
            <MetaRow label={t.bankTransactionDetail.fields.bookedDate} value={formatAccountingNewDate(detail.bookedDate, language, t.common.noValue)} />
            <MetaRow label={t.bankTransactionDetail.fields.direction} value={translateAccountingNewTransactionDirection(t, detail.direction)} />
            <MetaRow label={t.bankTransactionDetail.fields.matchingStatus} value={translateAccountingNewStatus(t, detail.status)} />
            <MetaRow
              label={t.bankTransactionDetail.fields.amount}
              value={<AccountingNewMoney amount={detail.amount} currency={detail.currency} className="font-semibold" />}
            />
            <MetaRow label={t.bankTransactionDetail.fields.currency} value={detail.currency} />
            <MetaRow label={t.bankTransactionDetail.fields.externalId} value={detail.externalId ?? t.common.noValue} />
            <MetaRow label={t.bankTransactionDetail.fields.createdAt} value={formatAccountingNewDateTime(detail.createdAt, language, t.common.noValue)} />
          </div>

          <Separator />

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{t.bankTransactionDetail.counterpartyTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.bankTransactionDetail.counterpartyDescription}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetaRow label={t.bankTransactionDetail.fields.counterparty} value={detail.counterpartyName ?? t.common.noValue} />
                <MetaRow label={t.bankTransactionDetail.fields.counterpartyAccount} value={detail.counterpartyAccount ?? t.common.noValue} />
                <MetaRow label={t.bankTransactionDetail.fields.counterpartyIban} value={detail.counterpartyIban ?? t.common.noValue} />
                <MetaRow label={t.bankTransactionDetail.fields.remittanceInfo} value={detail.message ?? t.common.noMessage} />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{t.bankTransactionDetail.accountTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.bankTransactionDetail.accountDescription}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetaRow label={t.bankTransactionDetail.fields.accountIban} value={detail.accountIban ?? t.common.noValue} />
                <MetaRow
                  label={t.bankTransactionDetail.fields.accountNumber}
                  value={detail.accountNumber ? `${detail.accountNumber}/${detail.bankCode ?? ""}`.replace(/\/$/, "") : t.common.noValue}
                />
                <MetaRow label={t.bankTransactionDetail.fields.variableSymbol} value={detail.variableSymbol ?? t.common.noValue} />
                <MetaRow label={t.bankTransactionDetail.fields.constantSymbol} value={detail.constantSymbol ?? t.common.noValue} />
                <MetaRow label={t.bankTransactionDetail.fields.specificSymbol} value={detail.specificSymbol ?? t.common.noValue} />
                <MetaRow label={t.bankTransactionDetail.fields.updatedAt} value={formatAccountingNewDateTime(detail.updatedAt, language, t.common.noValue)} />
              </div>
            </div>
          </div>

          {detail.rawPayload ? (
            <>
              <Separator />
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-foreground">{t.bankTransactionDetail.rawPayloadTitle}</h2>
                <pre className="overflow-x-auto rounded-lg border border-border bg-background p-4 text-xs text-muted-foreground">
                  {detail.rawPayload}
                </pre>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {partialError ? (
        <Alert>
          <AlertTitle>{t.errors.supplementalTitle}</AlertTitle>
          <AlertDescription>{partialError.message}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>{t.bankTransactionDetail.matchesTitle}</CardTitle>
          <CardDescription>{t.bankTransactionDetail.matchesDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {matches.length > 0 ? (
            <AccountingNewPaymentMatchesTable matches={matches} />
          ) : (
            <p className="text-sm text-muted-foreground">{t.empty.bankTransactionMatches}</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>{t.bankTransactionDetail.candidatesTitle}</CardTitle>
          <CardDescription>{t.bankTransactionDetail.candidatesDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountingNewMatchCandidatesList deferredNote={t.paymentMatching.deferredDescription} />
        </CardContent>
      </Card>
    </div>
  );
}
