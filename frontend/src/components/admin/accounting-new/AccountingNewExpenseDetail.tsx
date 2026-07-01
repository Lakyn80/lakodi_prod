"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ACCOUNTING_NEW_ROUTE,
  getAccountingNewExpense,
  getAccountingNewExpenseAuditEvents,
  getAccountingNewExpensePayments,
} from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewExpenseDetailState } from "@/types/accountingNew";
import { AccountingNewDocumentStatusBadge } from "@/components/admin/accounting-new/AccountingNewDocumentStatusBadge";
import { AccountingNewMoney } from "@/components/admin/accounting-new/AccountingNewMoney";
import { formatAccountingNewDate, formatAccountingNewDateTime } from "@/components/admin/accounting-new/accountingNewFormat";

function getFirstError(errors: AccountingNewApiError[]): AccountingNewApiError | null {
  return errors[0] ?? null;
}

function DetailLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-48" />
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

export function AccountingNewExpenseDetail({
  expenseId,
}: {
  expenseId: string;
}) {
  const [state, setState] = useState<AccountingNewExpenseDetailState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadDetail() {
      setState({ status: "loading" });

      try {
        const detail = await getAccountingNewExpense(expenseId, { signal: controller.signal });
        const [paymentsResult, auditEventsResult] = await Promise.allSettled([
          getAccountingNewExpensePayments(expenseId, { signal: controller.signal }),
          getAccountingNewExpenseAuditEvents(expenseId, { signal: controller.signal }),
        ]);

        const partialErrors: AccountingNewApiError[] = [];
        const payments = paymentsResult.status === "fulfilled" ? paymentsResult.value : detail.payments;
        const auditEvents = auditEventsResult.status === "fulfilled" ? auditEventsResult.value : [];

        if (paymentsResult.status === "rejected" && paymentsResult.reason?.apiError) {
          partialErrors.push(paymentsResult.reason.apiError as AccountingNewApiError);
        }

        if (auditEventsResult.status === "rejected" && auditEventsResult.reason?.apiError) {
          partialErrors.push(auditEventsResult.reason.apiError as AccountingNewApiError);
        }

        setState({
          status: "ready",
          detail,
          payments,
          auditEvents,
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
                resource: "expense-detail",
                message: error instanceof Error ? error.message : "Read-only detail výdaje se nepodařilo načíst.",
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
  }, [expenseId]);

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
          <AlertTitle>Pro read-only detail výdaje je nutné přihlášení</AlertTitle>
          <AlertDescription>
            Bez aktivní admin session se detail přijatého dokladu nenačte. Původní issued invoices v `/admin/invoices` zůstávají beze změny.
          </AlertDescription>
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
          <AlertTitle>Výdaj nebyl nalezen</AlertTitle>
          <AlertDescription>
            Požadovaný read-only výdaj nebyl na backendu nalezen. Původní sekce `/admin/invoices` zůstává nedotčená.
          </AlertDescription>
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
          <AlertTitle>Read-only detail výdaje se nepodařilo načíst</AlertTitle>
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { detail, payments, auditEvents } = state;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <Link href={ACCOUNTING_NEW_ROUTE}>Zpět do ÚčetnictvíNew</Link>
        </Button>
        <Badge variant="secondary">Read-only detail</Badge>
        <Badge variant="outline">Výdaj</Badge>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <AccountingNewDocumentStatusBadge label={detail.paymentStatus} />
            <AccountingNewDocumentStatusBadge label={detail.status} />
            <Badge variant="secondary">Bez write akcí</Badge>
          </div>
          <div className="space-y-1">
            <CardTitle>{detail.expenseNumber}</CardTitle>
            <CardDescription>
              Read-only detail přijatého dokladu v nové paralelní sekci. Staré vydané faktury zůstávají v{" "}
              <Link href="/admin/invoices" className="underline underline-offset-4">
                /admin/invoices
              </Link>
              .
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetaRow label="Variabilní symbol" value={detail.variableSymbol} />
            <MetaRow label="Datum vystavení" value={formatAccountingNewDate(detail.issueDate)} />
            <MetaRow label="Datum přijetí" value={formatAccountingNewDate(detail.receivedDate)} />
            <MetaRow label="Datum zdanění" value={formatAccountingNewDate(detail.taxableSupplyDate)} />
            <MetaRow label="Datum splatnosti" value={formatAccountingNewDate(detail.dueDate)} />
            <MetaRow label="Způsob platby" value={detail.paymentMethod} />
            <MetaRow label="Stav výdaje" value={detail.status} />
            <MetaRow label="Vytvořeno" value={formatAccountingNewDateTime(detail.createdAt)} />
          </div>

          <Separator />

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Snapshot dodavatele</h2>
                <p className="text-sm text-muted-foreground">Pouze read-only zobrazení uložených údajů přijatého dokladu.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetaRow label="Jméno / firma" value={detail.supplierName} />
                <MetaRow label="E-mail" value={detail.supplierEmail} />
                <MetaRow label="Telefon" value={detail.supplierPhone ?? "Neuvedeno"} />
                <MetaRow label="Adresa" value={detail.supplierAddress} />
                <MetaRow label="IČO" value={detail.supplierIco ?? "Neuvedeno"} />
                <MetaRow label="DIČ" value={detail.supplierDic ?? "Neuvedeno"} />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Platba a částky</h2>
                <p className="text-sm text-muted-foreground">Žádné editace, žádné apply payment, pouze uložený stav backendu.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetaRow label="Měna" value={detail.currency} />
                <MetaRow label="Platební stav" value={detail.paymentStatus} />
                <MetaRow
                  label="Účet"
                  value={`${detail.bankAccountPrefix ? `${detail.bankAccountPrefix}-` : ""}${detail.bankAccountNumber}/${detail.bankCode}`}
                />
                <MetaRow label="IBAN" value={detail.bankIban ?? "Neuvedeno"} />
                <MetaRow label="Uhrazeno" value={<AccountingNewMoney amount={detail.totalPaid} currency={detail.currency} />} />
                <MetaRow
                  label="Zbývá uhradit"
                  value={<AccountingNewMoney amount={detail.remainingAmount} currency={detail.currency} className="font-semibold" />}
                />
              </div>
            </div>
          </div>

          {detail.note ? (
            <>
              <Separator />
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-foreground">Poznámka</h2>
                <p className="text-sm text-muted-foreground">{detail.note}</p>
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

      <div className="grid gap-4 xl:grid-cols-[1.25fr,0.95fr]">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Položky výdaje</CardTitle>
            <CardDescription>Read-only přehled položek vrácených detail endpointem.</CardDescription>
          </CardHeader>
          <CardContent>
            {detail.items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Popis</TableHead>
                    <TableHead className="text-right">Množství</TableHead>
                    <TableHead className="text-right">Cena za jednotku</TableHead>
                    <TableHead className="text-right">Celkem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">
                        <AccountingNewMoney amount={item.unitPrice} currency={detail.currency} />
                      </TableCell>
                      <TableCell className="text-right">
                        <AccountingNewMoney amount={item.lineTotal} currency={detail.currency} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">Tento výdaj zatím neobsahuje žádné položky v read-only detailu.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Souhrn částek</CardTitle>
            <CardDescription>Bez editace, bez mazání, bez párování plateb.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MetaRow label="Mezisoučet" value={<AccountingNewMoney amount={detail.subtotal} currency={detail.currency} />} />
            <MetaRow label="DPH" value={<AccountingNewMoney amount={detail.vatAmount} currency={detail.currency} />} />
            <MetaRow label="Celkem" value={<AccountingNewMoney amount={detail.total} currency={detail.currency} className="font-semibold" />} />
            <MetaRow label="Sazba DPH" value={detail.vatRate !== null ? `${detail.vatRate} %` : "Neuvedeno"} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr,1fr]">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Platby výdaje</CardTitle>
            <CardDescription>Read-only seznam plateb vrácený detail nebo payment endpointem.</CardDescription>
          </CardHeader>
          <CardContent>
            {payments.length > 0 ? (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div key={payment.id} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <AccountingNewMoney amount={payment.amount} currency={detail.currency} className="font-medium text-foreground" />
                      <Badge variant="outline">{payment.paymentMethod}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">Uhrazeno {formatAccountingNewDate(payment.paidAt)}</p>
                    {payment.note ? <p className="mt-2 text-sm text-foreground">{payment.note}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">K tomuto výdaji zatím backend nevrátil žádné platby.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Read-only provozní poznámka</CardTitle>
            <CardDescription>Tato detailní route je záměrně pouze pro bezpečné čtení.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>Nejsou zde žádná tlačítka pro editaci, smazání, apply payment, upload ani archivaci.</p>
            <p>Staré vydané faktury zůstávají dostupné pouze v legacy sekci `/admin/invoices`.</p>
            <p>Pokud backend vrátí `401` nebo `404`, route zobrazí bezpečný stav místo pádu nebo přesměrování.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Nedávné auditní události</CardTitle>
          <CardDescription>Volitelná read-only sekce nad `GET /api/admin/invoices/expenses/{'{id}'}/audit-events`.</CardDescription>
        </CardHeader>
        <CardContent>
          {auditEvents.length > 0 ? (
            <div className="space-y-3">
              {auditEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{event.entityType}</Badge>
                    <Badge variant="secondary">{event.eventType}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-foreground">
                    {event.message ?? "Backend neposlal textovou zprávu, proto detail zobrazuje pouze typ události."}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatAccountingNewDateTime(event.createdAt)} · zdroj {event.source}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Žádné auditní události se pro tento výdaj zatím nepodařilo načíst.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
