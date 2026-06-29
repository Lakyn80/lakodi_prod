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
  getAccountingNewDocument,
  getAccountingNewDocumentAuditEvents,
  getAccountingNewDocumentRelations,
} from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewDocumentDetailState } from "@/types/accountingNew";
import { AccountingNewDocumentStatusBadge } from "@/components/admin/accounting-new/AccountingNewDocumentStatusBadge";
import { AccountingNewMoney } from "@/components/admin/accounting-new/AccountingNewMoney";

function formatDate(value: string | null): string {
  if (!value) {
    return "Neuvedeno";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" }).format(date);
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Neuvedeno";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

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

export function AccountingNewDocumentDetail({
  documentId,
}: {
  documentId: string;
}) {
  const [state, setState] = useState<AccountingNewDocumentDetailState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadDetail() {
      setState({ status: "loading" });

      try {
        const detail = await getAccountingNewDocument(documentId, { signal: controller.signal });
        const [relationsResult, auditEventsResult] = await Promise.allSettled([
          getAccountingNewDocumentRelations(documentId, { signal: controller.signal }),
          getAccountingNewDocumentAuditEvents(documentId, { signal: controller.signal }),
        ]);

        const partialErrors: AccountingNewApiError[] = [];
        const relations = relationsResult.status === "fulfilled" ? relationsResult.value : null;
        const auditEvents = auditEventsResult.status === "fulfilled" ? auditEventsResult.value : [];

        if (relationsResult.status === "rejected" && relationsResult.reason?.apiError) {
          partialErrors.push(relationsResult.reason.apiError as AccountingNewApiError);
        }

        if (auditEventsResult.status === "rejected" && auditEventsResult.reason?.apiError) {
          partialErrors.push(auditEventsResult.reason.apiError as AccountingNewApiError);
        }

        setState({
          status: "ready",
          detail,
          relations,
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
                resource: "document-detail",
                message: error instanceof Error ? error.message : "Read-only detail dokumentu se nepodařilo načíst.",
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
  }, [documentId]);

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
          <AlertTitle>Pro read-only detail dokumentu je nutné přihlášení</AlertTitle>
          <AlertDescription>
            Bez aktivní admin session se detail nového paralelního accounting dokumentu nenačte. Starý route `/admin/invoices`
            tím zůstává beze změny.
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
          <AlertTitle>Doklad nebyl nalezen</AlertTitle>
          <AlertDescription>
            Požadovaný accounting dokument nebyl na read-only endpointu nalezen. Stávající vydané faktury v `/admin/invoices`
            zůstávají nedotčené.
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
          <AlertTitle>Read-only detail dokumentu se nepodařilo načíst</AlertTitle>
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { detail, relations, auditEvents } = state;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <Link href={ACCOUNTING_NEW_ROUTE}>Zpět do ÚčetnictvíNew</Link>
        </Button>
        <Badge variant="secondary">Read-only detail</Badge>
        <Badge variant="outline">{detail.documentKind}</Badge>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <AccountingNewDocumentStatusBadge label={detail.paymentStatus} />
            <AccountingNewDocumentStatusBadge label={detail.effectiveStatus} />
            <Badge variant="secondary">Bez write akcí</Badge>
          </div>
          <div className="space-y-1">
            <CardTitle>{detail.invoiceNumber}</CardTitle>
            <CardDescription>
              Read-only accounting detail v nové paralelní sekci. Původní issued invoices v `/admin/invoices` zůstávají zachované beze změny.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetaRow label="Druh dokumentu" value={detail.documentKind} />
            <MetaRow label="Variabilní symbol" value={detail.variableSymbol} />
            <MetaRow label="Datum vystavení" value={formatDate(detail.issueDate)} />
            <MetaRow label="Datum splatnosti" value={formatDate(detail.dueDate)} />
            <MetaRow label="Business mode" value={detail.businessMode} />
            <MetaRow label="Tax mode" value={detail.taxMode} />
            <MetaRow label="Stav" value={detail.status} />
            <MetaRow label="Vytvořeno" value={formatDateTime(detail.createdAt)} />
          </div>

          <Separator />

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Snapshot odběratele</h2>
                <p className="text-sm text-muted-foreground">Pouze read-only zobrazení uložených údajů dokumentu.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetaRow label="Jméno / firma" value={detail.customerName} />
                <MetaRow label="E-mail" value={detail.customerEmail} />
                <MetaRow label="Telefon" value={detail.customerPhone ?? "Neuvedeno"} />
                <MetaRow label="Adresa" value={detail.customerAddress ?? "Neuvedeno"} />
                <MetaRow label="IČO" value={detail.customerIco ?? "Neuvedeno"} />
                <MetaRow label="DIČ" value={detail.customerDic ?? "Neuvedeno"} />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Snapshot vystavitele a platby</h2>
                <p className="text-sm text-muted-foreground">Zobrazené údaje jsou převzaté z dokumentu, bez editace.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetaRow label="Vystavitel" value={detail.issuerName} />
                <MetaRow
                  label="Adresa"
                  value={`${detail.issuerAddress}, ${detail.issuerZip} ${detail.issuerCity}`}
                />
                <MetaRow label="IČO" value={detail.issuerIco} />
                <MetaRow label="DIČ" value={detail.issuerDic} />
                <MetaRow label="Způsob platby" value={detail.paymentMethod} />
                <MetaRow
                  label="Účet"
                  value={`${detail.bankAccountPrefix ? `${detail.bankAccountPrefix}-` : ""}${detail.bankAccountNumber}/${detail.bankCode}`}
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
            <CardTitle>Položky dokumentu</CardTitle>
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
              <p className="text-sm text-muted-foreground">Tento dokument zatím neobsahuje žádné položky v read-only detailu.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Souhrn částek</CardTitle>
            <CardDescription>Žádné write akce, pouze stav uložený na backendu.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MetaRow label="Mezisoučet" value={<AccountingNewMoney amount={detail.subtotal} currency={detail.currency} />} />
            <MetaRow label="DPH" value={<AccountingNewMoney amount={detail.vatAmount} currency={detail.currency} />} />
            <MetaRow label="Celkem" value={<AccountingNewMoney amount={detail.total} currency={detail.currency} className="font-semibold" />} />
            <MetaRow label="Uhrazeno" value={<AccountingNewMoney amount={detail.totalPaid} currency={detail.currency} />} />
            <MetaRow
              label="Zbývá uhradit"
              value={<AccountingNewMoney amount={detail.remainingAmount} currency={detail.currency} className="font-semibold" />}
            />
            <MetaRow label="Sazba DPH" value={detail.vatRate !== null ? `${detail.vatRate} %` : "Neuvedeno"} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr,1fr]">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Platby</CardTitle>
            <CardDescription>Read-only seznam plateb vrácených detail endpointem.</CardDescription>
          </CardHeader>
          <CardContent>
            {detail.payments.length > 0 ? (
              <div className="space-y-3">
                {detail.payments.map((payment) => (
                  <div key={payment.id} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <AccountingNewMoney amount={payment.amount} currency={detail.currency} className="font-medium text-foreground" />
                      <Badge variant="outline">{payment.paymentMethod}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">Uhrazeno {formatDate(payment.paidAt)}</p>
                    {payment.note ? <p className="mt-2 text-sm text-foreground">{payment.note}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">K tomuto dokumentu zatím backend nevrátil žádné platby.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Relace dokumentu</CardTitle>
            <CardDescription>Volitelná read-only sekce nad `GET /api/admin/invoices/{'{id}'}/relations`.</CardDescription>
          </CardHeader>
          <CardContent>
            {relations && relations.allRelations.length > 0 ? (
              <div className="space-y-3">
                {relations.allRelations.map((relation) => (
                  <div key={relation.id} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{relation.relationType}</Badge>
                      <p className="text-sm text-muted-foreground">{formatDateTime(relation.createdAt)}</p>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <MetaRow
                        label="Zdroj"
                        value={relation.sourceDocument ? `${relation.sourceDocument.invoiceNumber} · ${relation.sourceDocument.documentKind}` : "Neuvedeno"}
                      />
                      <MetaRow
                        label="Cíl"
                        value={relation.targetDocument ? `${relation.targetDocument.invoiceNumber} · ${relation.targetDocument.documentKind}` : "Neuvedeno"}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">K tomuto dokumentu zatím nebyly načteny žádné read-only relace.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Nedávné auditní události</CardTitle>
          <CardDescription>Volitelná read-only sekce nad `GET /api/admin/invoices/{'{id}'}/audit-events`.</CardDescription>
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
                    {formatDateTime(event.createdAt)} · zdroj {event.source}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Žádné auditní události se pro tento dokument zatím nepodařilo načíst.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
