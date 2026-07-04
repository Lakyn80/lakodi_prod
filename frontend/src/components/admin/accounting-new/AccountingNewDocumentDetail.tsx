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
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ACCOUNTING_NEW_ROUTE,
  getAccountingNewDocument,
  getAccountingNewDocumentAuditEvents,
  getAccountingNewDocumentRelations,
} from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewDocumentDetail, AccountingNewDocumentDetailState } from "@/types/accountingNew";
import { AccountingNewDocumentActions } from "@/components/admin/accounting-new/AccountingNewDocumentActions";
import { AccountingNewDocumentPaymentForm } from "@/components/admin/accounting-new/AccountingNewDocumentPaymentForm";
import { AccountingNewDocumentStatusBadge } from "@/components/admin/accounting-new/AccountingNewDocumentStatusBadge";
import { canAccountingNewDocumentAddPayment } from "@/lib/accountingNewDocumentWrite";
import { AccountingNewMoney } from "@/components/admin/accounting-new/AccountingNewMoney";
import {
  formatAccountingNewDate,
  formatAccountingNewDateTime,
  formatAccountingNewTemplate,
  translateAccountingNewApiError,
  translateAccountingNewDocumentKind,
  translateAccountingNewEntityType,
  translateAccountingNewStatus,
} from "@/components/admin/accounting-new/accountingNewFormat";

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
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [state, setState] = useState<AccountingNewDocumentDetailState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

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
                message: error instanceof Error ? error.message : t.errors.documentDetailTitle,
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
  }, [documentId, t.errors.documentDetailTitle, reloadKey]);

  function handleDetailUpdated(detail: AccountingNewDocumentDetail) {
    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            detail,
          }
        : current,
    );
    setReloadKey((value) => value + 1);
  }

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
          <AlertTitle>{t.auth.documentDetailTitle}</AlertTitle>
          <AlertDescription>{t.auth.documentDetailDescription}</AlertDescription>
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
          <AlertTitle>{t.documentDetail.notFoundTitle}</AlertTitle>
          <AlertDescription>{t.documentDetail.notFoundDescription}</AlertDescription>
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
          <AlertTitle>{t.errors.documentDetailTitle}</AlertTitle>
          <AlertDescription>{translateAccountingNewApiError(t, state.error)}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { detail, relations, auditEvents } = state;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <Link href={ACCOUNTING_NEW_ROUTE}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Badge variant="secondary">{t.documentWrite.badgeFunctional}</Badge>
        <Badge variant="outline">{translateAccountingNewDocumentKind(t, detail.documentKind)}</Badge>
      </div>

      <AccountingNewDocumentActions detail={detail} onUpdated={handleDetailUpdated} />

      <Card className="border-border bg-card">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <AccountingNewDocumentStatusBadge label={detail.paymentStatus} />
            <AccountingNewDocumentStatusBadge label={detail.effectiveStatus} />
          </div>
          <div className="space-y-1">
            <CardTitle>{detail.invoiceNumber}</CardTitle>
            <CardDescription>{t.documentDetail.description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetaRow label={t.documentDetail.fields.documentKind} value={translateAccountingNewDocumentKind(t, detail.documentKind)} />
            <MetaRow label={t.documentDetail.fields.variableSymbol} value={detail.variableSymbol} />
            <MetaRow
              label={t.documentDetail.fields.issueDate}
              value={formatAccountingNewDate(detail.issueDate, language, t.common.noValue)}
            />
            <MetaRow
              label={t.documentDetail.fields.dueDate}
              value={formatAccountingNewDate(detail.dueDate, language, t.common.noValue)}
            />
            <MetaRow label={t.documentDetail.fields.businessMode} value={detail.businessMode} />
            <MetaRow label={t.documentDetail.fields.taxMode} value={detail.taxMode} />
            <MetaRow label={t.documentDetail.fields.status} value={translateAccountingNewStatus(t, detail.status)} />
            <MetaRow
              label={t.documentDetail.fields.createdAt}
              value={formatAccountingNewDateTime(detail.createdAt, language, t.common.noValue)}
            />
          </div>

          <Separator />

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{t.documentDetail.customerTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.documentDetail.customerDescription}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetaRow label={t.documentDetail.fields.customerName} value={detail.customerName} />
                <MetaRow label={t.documentDetail.fields.email} value={detail.customerEmail} />
                <MetaRow label={t.documentDetail.fields.phone} value={detail.customerPhone ?? t.common.noValue} />
                <MetaRow label={t.documentDetail.fields.address} value={detail.customerAddress ?? t.common.noValue} />
                <MetaRow label={t.documentDetail.fields.ico} value={detail.customerIco ?? t.common.noValue} />
                <MetaRow label={t.documentDetail.fields.dic} value={detail.customerDic ?? t.common.noValue} />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{t.documentDetail.issuerTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.documentDetail.issuerDescription}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetaRow label={t.documentDetail.fields.issuerName} value={detail.issuerName} />
                <MetaRow
                  label={t.documentDetail.fields.address}
                  value={`${detail.issuerAddress}, ${detail.issuerZip} ${detail.issuerCity}`}
                />
                <MetaRow label={t.documentDetail.fields.ico} value={detail.issuerIco} />
                <MetaRow label={t.documentDetail.fields.dic} value={detail.issuerDic} />
                <MetaRow label={t.documentDetail.fields.paymentMethod} value={detail.paymentMethod} />
                <MetaRow
                  label={t.documentDetail.fields.account}
                  value={`${detail.bankAccountPrefix ? `${detail.bankAccountPrefix}-` : ""}${detail.bankAccountNumber}/${detail.bankCode}`}
                />
              </div>
            </div>
          </div>

          {detail.note ? (
            <>
              <Separator />
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-foreground">{t.documentDetail.noteTitle}</h2>
                <p className="text-sm text-muted-foreground">{detail.note}</p>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {partialError ? (
        <Alert>
          <AlertTitle>{t.errors.supplementalTitle}</AlertTitle>
          <AlertDescription>{translateAccountingNewApiError(t, partialError)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.25fr,0.95fr]">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>{t.documentDetail.itemsTitle}</CardTitle>
            <CardDescription>{t.documentDetail.itemsDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {detail.items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.documentDetail.fields.description}</TableHead>
                    <TableHead className="text-right">{t.documentDetail.fields.quantity}</TableHead>
                    <TableHead className="text-right">{t.documentDetail.fields.unitPrice}</TableHead>
                    <TableHead className="text-right">{t.documentDetail.fields.total}</TableHead>
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
              <p className="text-sm text-muted-foreground">{t.empty.documentItems}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>{t.documentDetail.amountsTitle}</CardTitle>
            <CardDescription>{t.documentDetail.amountsDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MetaRow label={t.documentDetail.fields.subtotal} value={<AccountingNewMoney amount={detail.subtotal} currency={detail.currency} />} />
            <MetaRow label={t.documentDetail.fields.vat} value={<AccountingNewMoney amount={detail.vatAmount} currency={detail.currency} />} />
            <MetaRow
              label={t.documentDetail.fields.total}
              value={<AccountingNewMoney amount={detail.total} currency={detail.currency} className="font-semibold" />}
            />
            <MetaRow label={t.documentDetail.fields.totalPaid} value={<AccountingNewMoney amount={detail.totalPaid} currency={detail.currency} />} />
            <MetaRow
              label={t.documentDetail.fields.remainingAmount}
              value={<AccountingNewMoney amount={detail.remainingAmount} currency={detail.currency} className="font-semibold" />}
            />
            <MetaRow label={t.documentDetail.fields.vatRate} value={detail.vatRate !== null ? `${detail.vatRate} %` : t.common.noValue} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr,1fr]">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>{t.documentDetail.paymentsTitle}</CardTitle>
            <CardDescription>{t.documentDetail.paymentsDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {detail.payments.length > 0 ? (
              <div className="space-y-3">
                {detail.payments.map((payment) => (
                  <div key={payment.id} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <AccountingNewMoney amount={payment.amount} currency={detail.currency} className="font-medium text-foreground" />
                      <Badge variant="outline">{payment.paymentMethod}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatAccountingNewTemplate(t.common.paidAt, {
                        value: formatAccountingNewDate(payment.paidAt, language, t.common.noValue),
                      })}
                    </p>
                    {payment.note ? <p className="mt-2 text-sm text-foreground">{payment.note}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t.empty.documentPayments}</p>
            )}

            {canAccountingNewDocumentAddPayment(detail) ? (
              <AccountingNewDocumentPaymentForm detail={detail} onPaymentAdded={handleDetailUpdated} />
            ) : (
              <p className="text-sm text-muted-foreground">{t.documentWrite.payment.disabledHint}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>{t.documentDetail.relationsTitle}</CardTitle>
            <CardDescription>{t.documentDetail.relationsDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {relations && relations.allRelations.length > 0 ? (
              <div className="space-y-3">
                {relations.allRelations.map((relation) => (
                  <div key={relation.id} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{relation.relationType}</Badge>
                      <p className="text-sm text-muted-foreground">
                        {formatAccountingNewDateTime(relation.createdAt, language, t.common.noValue)}
                      </p>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <MetaRow
                        label={t.documentDetail.sourceLabel}
                        value={
                          relation.sourceDocument
                            ? formatAccountingNewTemplate(t.documentDetail.relationDocument, {
                                number: relation.sourceDocument.invoiceNumber,
                                kind: translateAccountingNewDocumentKind(t, relation.sourceDocument.documentKind),
                              })
                            : t.common.noValue
                        }
                      />
                      <MetaRow
                        label={t.documentDetail.targetLabel}
                        value={
                          relation.targetDocument
                            ? formatAccountingNewTemplate(t.documentDetail.relationDocument, {
                                number: relation.targetDocument.invoiceNumber,
                                kind: translateAccountingNewDocumentKind(t, relation.targetDocument.documentKind),
                              })
                            : t.common.noValue
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t.empty.documentRelations}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>{t.documentDetail.auditTitle}</CardTitle>
          <CardDescription>{t.documentDetail.auditDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {auditEvents.length > 0 ? (
            <div className="space-y-3">
              {auditEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{translateAccountingNewEntityType(t, event.entityType)}</Badge>
                    <Badge variant="secondary">{event.eventType}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-foreground">{event.message ?? t.common.noAuditMessage}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatAccountingNewDateTime(event.createdAt, language, t.common.noValue)} ·{" "}
                    {formatAccountingNewTemplate(t.common.sourcePrefix, { value: event.source })}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t.empty.documentAudit}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
