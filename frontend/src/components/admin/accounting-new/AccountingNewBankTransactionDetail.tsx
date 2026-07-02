"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ACCOUNTING_NEW_MATCH_CANDIDATES_DEFERRED_NOTE,
  ACCOUNTING_NEW_ROUTE,
  getAccountingNewBankTransaction,
  listAccountingNewBankTransactionMatches,
} from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewBankTransactionDetailState } from "@/types/accountingNew";
import { AccountingNewDocumentStatusBadge } from "@/components/admin/accounting-new/AccountingNewDocumentStatusBadge";
import { AccountingNewMatchCandidatesList } from "@/components/admin/accounting-new/AccountingNewMatchCandidatesList";
import { AccountingNewMoney } from "@/components/admin/accounting-new/AccountingNewMoney";
import { AccountingNewPaymentMatchesTable } from "@/components/admin/accounting-new/AccountingNewPaymentMatchesTable";
import { formatAccountingNewDate, formatAccountingNewDateTime } from "@/components/admin/accounting-new/accountingNewFormat";

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
          candidatesDeferredNote: ACCOUNTING_NEW_MATCH_CANDIDATES_DEFERRED_NOTE,
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
                message: error instanceof Error ? error.message : "Read-only detail bankovní transakce se nepodařilo načíst.",
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
  }, [transactionId]);

  const partialError = state.status === "ready" ? getFirstError(state.partialErrors) : null;

  if (state.status === "loading") {
    return <DetailLoading />;
  }

  if (state.status === "auth") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={ACCOUNTING_NEW_ROUTE}>Zpět do ÚčetnictvíNew</Link>
        </Button>
        <Alert>
          <AlertTitle>Pro read-only detail bankovní transakce je nutné přihlášení</AlertTitle>
          <AlertDescription>Bez aktivní admin session se detail bankovní transakce nenačte.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (state.status === "not_found") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={ACCOUNTING_NEW_ROUTE}>Zpět do ÚčetnictvíNew</Link>
        </Button>
        <Alert>
          <AlertTitle>Bankovní transakce nebyla nalezena</AlertTitle>
          <AlertDescription>Požadovaná read-only bankovní transakce nebyla na backendu nalezena.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={ACCOUNTING_NEW_ROUTE}>Zpět do ÚčetnictvíNew</Link>
        </Button>
        <Alert variant="destructive">
          <AlertTitle>Read-only detail bankovní transakce se nepodařilo načíst</AlertTitle>
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { detail, matches, candidatesDeferredNote } = state;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <Link href={ACCOUNTING_NEW_ROUTE}>Zpět do ÚčetnictvíNew</Link>
        </Button>
        <Badge variant="secondary">Read-only detail</Badge>
        <Badge variant="outline">Bankovní transakce</Badge>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <AccountingNewDocumentStatusBadge label={detail.status} />
            <Badge variant="secondary">Bez importu a bez apply matching</Badge>
          </div>
          <div className="space-y-1">
            <CardTitle>Transakce #{detail.id}</CardTitle>
            <CardDescription>
              Read-only detail bankovní transakce v nové paralelní sekci. Staré issued invoices zůstávají v{" "}
              <Link href="/admin/invoices" className="underline underline-offset-4">
                /admin/invoices
              </Link>
              .
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetaRow label="Datum transakce" value={formatAccountingNewDate(detail.transactionDate)} />
            <MetaRow label="Datum zaúčtování" value={formatAccountingNewDate(detail.bookedDate)} />
            <MetaRow label="Směr" value={detail.direction} />
            <MetaRow label="Stav párování" value={detail.status} />
            <MetaRow
              label="Částka"
              value={<AccountingNewMoney amount={detail.amount} currency={detail.currency} className="font-semibold" />}
            />
            <MetaRow label="Měna" value={detail.currency} />
            <MetaRow label="Externí ID" value={detail.externalId ?? "Neuvedeno"} />
            <MetaRow label="Vytvořeno" value={formatAccountingNewDateTime(detail.createdAt)} />
          </div>

          <Separator />

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Snapshot protistrany</h2>
                <p className="text-sm text-muted-foreground">Pouze read-only údaje vrácené detail endpointem.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetaRow label="Protistrana" value={detail.counterpartyName ?? "Neuvedeno"} />
                <MetaRow label="Účet protistrany" value={detail.counterpartyAccount ?? "Neuvedeno"} />
                <MetaRow label="IBAN protistrany" value={detail.counterpartyIban ?? "Neuvedeno"} />
                <MetaRow label="Zpráva / remittance info" value={detail.message ?? "Bez zprávy"} />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Účet a symboly</h2>
                <p className="text-sm text-muted-foreground">Žádné úpravy, žádné importy, žádné párovací akce.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetaRow label="IBAN účtu" value={detail.accountIban ?? "Neuvedeno"} />
                <MetaRow
                  label="Číslo účtu"
                  value={detail.accountNumber ? `${detail.accountNumber}/${detail.bankCode ?? ""}`.replace(/\/$/, "") : "Neuvedeno"}
                />
                <MetaRow label="Variabilní symbol" value={detail.variableSymbol ?? "Neuvedeno"} />
                <MetaRow label="Konstantní symbol" value={detail.constantSymbol ?? "Neuvedeno"} />
                <MetaRow label="Specifický symbol" value={detail.specificSymbol ?? "Neuvedeno"} />
                <MetaRow label="Aktualizováno" value={formatAccountingNewDateTime(detail.updatedAt)} />
              </div>
            </div>
          </div>

          {detail.rawPayload ? (
            <>
              <Separator />
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-foreground">Raw payload</h2>
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
          <AlertTitle>Část doplňkových read-only sekcí se nepodařilo načíst</AlertTitle>
          <AlertDescription>{partialError.message}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Existující payment matches</CardTitle>
          <CardDescription>Read-only seznam vrácený z `GET /api/admin/invoices/bank-transactions/{'{id}'}/matches`.</CardDescription>
        </CardHeader>
        <CardContent>
          {matches.length > 0 ? (
            <AccountingNewPaymentMatchesTable matches={matches} />
          ) : (
            <p className="text-sm text-muted-foreground">
              K této bankovní transakci zatím backend nevrátil žádné read-only match záznamy.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Matching candidates</CardTitle>
          <CardDescription>Kandidáti se zobrazují pouze pokud existuje bezpečný GET endpoint.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountingNewMatchCandidatesList deferredNote={candidatesDeferredNote ?? ACCOUNTING_NEW_MATCH_CANDIDATES_DEFERRED_NOTE} />
        </CardContent>
      </Card>
    </div>
  );
}
