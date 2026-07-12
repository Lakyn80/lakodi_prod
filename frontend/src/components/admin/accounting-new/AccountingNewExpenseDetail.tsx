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
  getAccountingNewExpense,
  getAccountingNewExpenseAuditEvents,
  getAccountingNewExpensePayments,
} from "@/lib/accountingNew";
import { getAccountingNewModuleRoute } from "@/lib/accountingNewModuleRoutes";
import type { AccountingNewApiError, AccountingNewExpenseDetail, AccountingNewExpenseDetailState } from "@/types/accountingNew";
import { AccountingNewDocumentStatusBadge } from "@/components/admin/accounting-new/AccountingNewDocumentStatusBadge";
import { AccountingNewExpensePaymentForm } from "@/components/admin/accounting-new/AccountingNewExpensePaymentForm";
import { AccountingNewMoney } from "@/components/admin/accounting-new/AccountingNewMoney";
import { canAccountingNewExpenseAddPayment } from "@/lib/accountingNewExpenseWrite";
import {
  formatAccountingNewDate,
  formatAccountingNewDateTime,
  formatAccountingNewTemplate,
  translateAccountingNewApiError,
  translateAccountingNewAuditEvent,
  translateAccountingNewAuditSource,
  translateAccountingNewEntityType,
  translateAccountingNewPaymentMethod,
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
      <div className="break-words text-sm text-foreground">{value}</div>
    </div>
  );
}

export function AccountingNewExpenseDetail({
  expenseId,
}: {
  expenseId: string;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
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
                message: error instanceof Error ? error.message : t.errors.expenseDetailTitle,
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
  }, [expenseId, t.errors.expenseDetailTitle]);

  const partialError = state.status === "ready" ? getFirstError(state.partialErrors) : null;

  function handleDetailUpdated(updatedDetail: AccountingNewExpenseDetail) {
    setState((current) => {
      if (current.status !== "ready") {
        return current;
      }

      return {
        ...current,
        detail: updatedDetail,
        payments: updatedDetail.payments,
      };
    });
  }

  if (state.status === "loading") {
    return <DetailLoading />;
  }

  if (state.status === "auth") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("expenses")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Alert>
          <AlertTitle>{t.auth.expenseDetailTitle}</AlertTitle>
          <AlertDescription>{t.auth.expenseDetailDescription}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (state.status === "not_found") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("expenses")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Alert>
          <AlertTitle>{t.expenseDetail.notFoundTitle}</AlertTitle>
          <AlertDescription>{t.expenseDetail.notFoundDescription}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("expenses")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Alert variant="destructive">
          <AlertTitle>{t.errors.expenseDetailTitle}</AlertTitle>
          <AlertDescription>{translateAccountingNewApiError(t, state.error)}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { detail, payments, auditEvents } = state;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("expenses")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Badge variant="secondary">{t.expenseWrite.badgeFunctional}</Badge>
        <Badge variant="outline">{t.expenses.badge}</Badge>
        <Button asChild>
          <Link href={`${ACCOUNTING_NEW_ROUTE}/vydaje/${expenseId}/upravit`}>{t.expenseWrite.actions.editExpense}</Link>
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <AccountingNewDocumentStatusBadge label={detail.paymentStatus} />
            <AccountingNewDocumentStatusBadge label={detail.status} />
          </div>
          <div className="space-y-1">
            <CardTitle>{detail.expenseNumber}</CardTitle>
            <CardDescription>{t.expenseDetail.description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetaRow label={t.expenseDetail.fields.variableSymbol} value={detail.variableSymbol} />
            <MetaRow label={t.expenseDetail.fields.issueDate} value={formatAccountingNewDate(detail.issueDate, language, t.common.noValue)} />
            <MetaRow label={t.expenseDetail.fields.receivedDate} value={formatAccountingNewDate(detail.receivedDate, language, t.common.noValue)} />
            <MetaRow
              label={t.expenseDetail.fields.taxableSupplyDate}
              value={formatAccountingNewDate(detail.taxableSupplyDate, language, t.common.noValue)}
            />
            <MetaRow label={t.expenseDetail.fields.dueDate} value={formatAccountingNewDate(detail.dueDate, language, t.common.noValue)} />
            <MetaRow label={t.expenseDetail.fields.paymentMethod} value={translateAccountingNewPaymentMethod(t, detail.paymentMethod)} />
            <MetaRow label={t.expenseDetail.fields.expenseStatus} value={translateAccountingNewStatus(t, detail.status)} />
            <MetaRow
              label={t.expenseDetail.fields.createdAt}
              value={formatAccountingNewDateTime(detail.createdAt, language, t.common.noValue)}
            />
          </div>

          <Separator />

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{t.expenseDetail.supplierTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.expenseDetail.supplierDescription}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetaRow label={t.expenseDetail.fields.supplierName} value={detail.supplierName} />
                <MetaRow label={t.expenseDetail.fields.email} value={detail.supplierEmail} />
                <MetaRow label={t.expenseDetail.fields.phone} value={detail.supplierPhone ?? t.common.noValue} />
                <MetaRow label={t.expenseDetail.fields.address} value={detail.supplierAddress} />
                <MetaRow label={t.expenseDetail.fields.ico} value={detail.supplierIco ?? t.common.noValue} />
                <MetaRow label={t.expenseDetail.fields.dic} value={detail.supplierDic ?? t.common.noValue} />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{t.expenseDetail.paymentTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.expenseDetail.paymentDescription}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetaRow label={t.expenseDetail.fields.currency} value={detail.currency} />
                <MetaRow label={t.expenseDetail.fields.paymentStatus} value={translateAccountingNewStatus(t, detail.paymentStatus)} />
                <MetaRow
                  label={t.expenseDetail.fields.account}
                  value={`${detail.bankAccountPrefix ? `${detail.bankAccountPrefix}-` : ""}${detail.bankAccountNumber}/${detail.bankCode}`}
                />
                <MetaRow label={t.expenseDetail.fields.iban} value={detail.bankIban ?? t.common.noValue} />
                <MetaRow label={t.expenseDetail.fields.totalPaid} value={<AccountingNewMoney amount={detail.totalPaid} currency={detail.currency} />} />
                <MetaRow
                  label={t.expenseDetail.fields.remainingAmount}
                  value={<AccountingNewMoney amount={detail.remainingAmount} currency={detail.currency} className="font-semibold" />}
                />
              </div>
            </div>
          </div>

          {detail.note ? (
            <>
              <Separator />
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-foreground">{t.expenseDetail.noteTitle}</h2>
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
            <CardTitle>{t.expenseDetail.itemsTitle}</CardTitle>
            <CardDescription>{t.expenseDetail.itemsDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {detail.items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.expenseDetail.fields.description}</TableHead>
                    <TableHead className="text-right">{t.expenseDetail.fields.quantity}</TableHead>
                    <TableHead className="text-right">{t.expenseDetail.fields.unitPrice}</TableHead>
                    <TableHead className="text-right">{t.expenseDetail.fields.total}</TableHead>
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
              <p className="text-sm text-muted-foreground">{t.empty.expenseItems}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>{t.expenseDetail.amountsTitle}</CardTitle>
            <CardDescription>{t.expenseDetail.amountsDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MetaRow label={t.expenseDetail.fields.subtotal} value={<AccountingNewMoney amount={detail.subtotal} currency={detail.currency} />} />
            <MetaRow label={t.expenseDetail.fields.vat} value={<AccountingNewMoney amount={detail.vatAmount} currency={detail.currency} />} />
            <MetaRow
              label={t.expenseDetail.fields.total}
              value={<AccountingNewMoney amount={detail.total} currency={detail.currency} className="font-semibold" />}
            />
            <MetaRow label={t.expenseDetail.fields.totalPaid} value={<AccountingNewMoney amount={detail.totalPaid} currency={detail.currency} />} />
            <MetaRow
              label={t.expenseDetail.fields.remainingAmount}
              value={<AccountingNewMoney amount={detail.remainingAmount} currency={detail.currency} className="font-semibold" />}
            />
            <MetaRow label={t.expenseDetail.fields.vatRate} value={detail.vatRate !== null ? `${detail.vatRate} %` : t.common.noValue} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr,1fr]">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>{t.expenseDetail.paymentsTitle}</CardTitle>
            <CardDescription>{t.expenseDetail.paymentsDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {payments.length > 0 ? (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div key={payment.id} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <AccountingNewMoney amount={payment.amount} currency={detail.currency} className="font-medium text-foreground" />
                      <Badge variant="outline">{translateAccountingNewPaymentMethod(t, payment.paymentMethod)}</Badge>
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
              <p className="text-sm text-muted-foreground">{t.empty.expensePayments}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>{t.expenseDetail.operationsTitle}</CardTitle>
            <CardDescription>{t.expenseDetail.operationsDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canAccountingNewExpenseAddPayment(detail) ? (
              <AccountingNewExpensePaymentForm detail={detail} onPaymentAdded={handleDetailUpdated} />
            ) : (
              <p className="text-sm text-muted-foreground">{t.expenseWrite.payment.disabledHint}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>{t.expenseDetail.auditTitle}</CardTitle>
          <CardDescription>{t.expenseDetail.auditDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {auditEvents.length > 0 ? (
            <div className="space-y-3">
              {auditEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{translateAccountingNewEntityType(t, event.entityType)}</Badge>
                    <Badge variant="secondary">{translateAccountingNewAuditEvent(t, event.eventType)}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-foreground">{event.message ?? t.common.noAuditMessage}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatAccountingNewDateTime(event.createdAt, language, t.common.noValue)} ·{" "}
                    {translateAccountingNewAuditSource(t, event.source)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t.empty.expenseAudit}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
