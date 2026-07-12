"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  AccountingNewRequestError,
  getAccountingNewRecurringTemplate,
  listAccountingNewRecurringTemplateGenerations,
  listAccountingNewSubjects,
  listAccountingNewSuppliers,
} from "@/lib/accountingNew";
import { getAccountingNewModuleRoute } from "@/lib/accountingNewModuleRoutes";
import type {
  AccountingNewApiError,
  AccountingNewRecurringTemplateDetailState,
  AccountingNewSubjectSummary,
  AccountingNewSupplierSummary,
} from "@/types/accountingNew";
import { AccountingNewMoney } from "@/components/admin/accounting-new/AccountingNewMoney";
import { AccountingNewRecurringGenerationsTable } from "@/components/admin/accounting-new/AccountingNewRecurringGenerationsTable";
import { AccountingNewRecurringStatusBadge } from "@/components/admin/accounting-new/AccountingNewRecurringStatusBadge";
import { AccountingNewRecurringTemplateActions } from "@/components/admin/accounting-new/AccountingNewRecurringTemplateActions";
import { canAccountingNewRecurringTemplateEdit } from "@/lib/accountingNewRecurringWrite";
import {
  formatAccountingNewDate,
  formatAccountingNewDateTime,
  formatAccountingNewTemplate,
  translateAccountingNewApiError,
  translateAccountingNewDocumentKind,
  translateAccountingNewRecurringFrequency,
  translateAccountingNewRecurringKind,
  translateAccountingNewStatus,
} from "@/components/admin/accounting-new/accountingNewFormat";

function getFirstError(errors: AccountingNewApiError[]): AccountingNewApiError | null {
  return errors[0] ?? null;
}

function getRecurringTemplateTotal(
  items: Array<{
    lineTotal: number;
  }>,
): number {
  return items.reduce((sum, item) => sum + item.lineTotal, 0);
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

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="break-words text-sm text-foreground">{value}</div>
    </div>
  );
}

export function AccountingNewRecurringTemplateDetail({
  templateId,
}: {
  templateId: string;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [state, setState] = useState<AccountingNewRecurringTemplateDetailState>({ status: "loading" });
  const [subjects, setSubjects] = useState<AccountingNewSubjectSummary[]>([]);
  const [suppliers, setSuppliers] = useState<AccountingNewSupplierSummary[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDetail() {
      setState({ status: "loading" });
      setSubjects([]);
      setSuppliers([]);

      try {
        const detail = await getAccountingNewRecurringTemplate(templateId, {
          signal: controller.signal,
        });

        const [generationsResult, subjectsResult, suppliersResult] = await Promise.allSettled([
          listAccountingNewRecurringTemplateGenerations(templateId, { signal: controller.signal }),
          listAccountingNewSubjects({ signal: controller.signal }),
          listAccountingNewSuppliers({}, { signal: controller.signal }),
        ]);

        const partialErrors: AccountingNewApiError[] = [];

        if (generationsResult.status === "rejected" && generationsResult.reason instanceof AccountingNewRequestError) {
          partialErrors.push(generationsResult.reason.apiError);
        }

        if (subjectsResult.status === "rejected" && subjectsResult.reason instanceof AccountingNewRequestError) {
          partialErrors.push(subjectsResult.reason.apiError);
        }

        if (suppliersResult.status === "rejected" && suppliersResult.reason instanceof AccountingNewRequestError) {
          partialErrors.push(suppliersResult.reason.apiError);
        }

        setSubjects(subjectsResult.status === "fulfilled" ? subjectsResult.value : []);
        setSuppliers(suppliersResult.status === "fulfilled" ? suppliersResult.value : []);
        setState({
          status: "ready",
          detail,
          generations: generationsResult.status === "fulfilled" ? generationsResult.value : [],
          partialErrors,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof AccountingNewRequestError) {
          if (error.apiError.requiresLogin) {
            setState({ status: "auth", error: error.apiError });
            return;
          }

          if (error.apiError.status === 404) {
            setState({ status: "not_found", error: error.apiError });
            return;
          }

          setState({ status: "error", error: error.apiError });
          return;
        }

        setState({
          status: "error",
          error: {
            resource: "recurring-detail",
            message: error instanceof Error ? error.message : t.errors.recurringDetailTitle,
            status: null,
            requiresLogin: false,
          },
        });
      }
    }

    void loadDetail();

    return () => controller.abort();
  }, [t.errors.recurringDetailTitle, templateId]);

  const partialError = state.status === "ready" ? getFirstError(state.partialErrors) : null;
  const subjectLabels = useMemo(
    () => Object.fromEntries(subjects.map((subject) => [subject.id, subject.name])),
    [subjects],
  );
  const supplierLabels = useMemo(
    () => Object.fromEntries(suppliers.map((supplier) => [supplier.id, supplier.name])),
    [suppliers],
  );

  if (state.status === "loading") {
    return <DetailLoading />;
  }

  if (state.status === "auth") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("recurring")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Alert>
          <AlertTitle>{t.auth.recurringDetailTitle}</AlertTitle>
          <AlertDescription>{t.auth.recurringDetailDescription}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (state.status === "not_found") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("recurring")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Alert>
          <AlertTitle>{t.recurringDetail.notFoundTitle}</AlertTitle>
          <AlertDescription>{t.recurringDetail.notFoundDescription}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("recurring")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Alert variant="destructive">
          <AlertTitle>{t.errors.recurringDetailTitle}</AlertTitle>
          <AlertDescription>{translateAccountingNewApiError(t, state.error)}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { detail, generations } = state;
  const totalAmount = getRecurringTemplateTotal(detail.items);
  const relatedSubject =
    detail.templateType === "invoice" && detail.subjectId
      ? subjectLabels[detail.subjectId] ?? formatAccountingNewTemplate(t.recurring.relatedSubject, { id: detail.subjectId })
      : t.common.noValue;
  const relatedSupplier =
    detail.templateType === "expense" && detail.supplierId
      ? supplierLabels[detail.supplierId] ?? formatAccountingNewTemplate(t.recurring.relatedSupplier, { id: detail.supplierId })
      : t.common.noValue;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("recurring")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Badge variant="outline">{t.recurringDetail.badge}</Badge>
      </div>

      <AccountingNewRecurringTemplateActions
        template={detail}
        onUpdated={(updated) => setState((current) => (current.status === "ready" ? { ...current, detail: updated } : current))}
      />

      {canAccountingNewRecurringTemplateEdit(detail) ? (
        <Button variant="outline" asChild className="min-h-11">
          <Link href={`${ACCOUNTING_NEW_ROUTE}/opakovane/${detail.id}/upravit`}>{t.recurringForm.editAction}</Link>
        </Button>
      ) : null}

      <Card className="border-border bg-card">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <AccountingNewRecurringStatusBadge label={detail.status} />
            <Badge variant="outline">{translateAccountingNewRecurringKind(t, detail.templateType)}</Badge>
          </div>
          <div className="space-y-1">
            <CardTitle>{detail.name}</CardTitle>
            <CardDescription>{t.recurringDetail.description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetaRow
              label={t.recurringDetail.fields.templateType}
              value={translateAccountingNewRecurringKind(t, detail.templateType)}
            />
            <MetaRow
              label={t.recurringDetail.fields.documentKind}
              value={detail.documentKind ? translateAccountingNewDocumentKind(t, detail.documentKind) : t.common.noValue}
            />
            <MetaRow label={t.recurringDetail.fields.status} value={translateAccountingNewStatus(t, detail.status)} />
            <MetaRow
              label={t.recurringDetail.fields.nextRunDate}
              value={formatAccountingNewDate(detail.nextRunDate, language, t.common.noValue)}
            />
            <MetaRow
              label={t.recurringDetail.fields.lastRunDate}
              value={formatAccountingNewDate(detail.lastRunDate, language, t.common.noValue)}
            />
            <MetaRow
              label={t.recurringDetail.fields.createdAt}
              value={formatAccountingNewDateTime(detail.createdAt, language, t.common.noValue)}
            />
            <MetaRow
              label={t.recurringDetail.fields.updatedAt}
              value={formatAccountingNewDateTime(detail.updatedAt, language, t.common.noValue)}
            />
            <MetaRow
              label={t.recurringDetail.fields.templateNumber}
              value={formatAccountingNewTemplate(t.recurring.table.templateNumber, { id: detail.id })}
            />
          </div>

          <Separator />

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{t.recurringDetail.recurrenceTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.recurringDetail.recurrenceDescription}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetaRow
                  label={t.recurringDetail.fields.recurrenceInterval}
                  value={translateAccountingNewRecurringFrequency(t, detail.recurrenceInterval)}
                />
                <MetaRow label={t.recurringDetail.fields.recurrenceCount} value={detail.recurrenceCount} />
                <MetaRow label={t.recurringDetail.fields.businessMode} value={detail.businessMode ?? t.common.noValue} />
                <MetaRow label={t.recurringDetail.fields.taxMode} value={detail.taxMode ?? t.common.noValue} />
              </div>
              <p className="text-sm text-muted-foreground">{t.recurringDetail.scheduleWindowDeferred}</p>
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{t.recurringDetail.relatedTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.recurringDetail.relatedDescription}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetaRow label={t.recurringDetail.fields.subject} value={relatedSubject} />
                <MetaRow label={t.recurringDetail.fields.supplier} value={relatedSupplier} />
                <MetaRow label={t.recurringDetail.fields.currency} value={detail.currency} />
                <MetaRow label={t.recurringDetail.fields.vatRate} value={detail.vatRate !== null ? `${detail.vatRate} %` : t.common.noValue} />
              </div>
            </div>
          </div>

          {detail.note ? (
            <>
              <Separator />
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-foreground">{t.recurringDetail.noteTitle}</h2>
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
            <CardTitle>{t.recurringDetail.itemsTitle}</CardTitle>
            <CardDescription>{t.recurringDetail.itemsDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {detail.items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.recurringDetail.fields.description}</TableHead>
                    <TableHead className="text-right">{t.recurringDetail.fields.quantity}</TableHead>
                    <TableHead className="text-right">{t.recurringDetail.fields.unitPrice}</TableHead>
                    <TableHead className="text-right">{t.recurringDetail.fields.total}</TableHead>
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
              <p className="text-sm text-muted-foreground">{t.empty.recurringItems}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>{t.recurringDetail.amountsTitle}</CardTitle>
            <CardDescription>{t.recurringDetail.amountsDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MetaRow
              label={t.recurringDetail.fields.subtotal}
              value={<AccountingNewMoney amount={totalAmount} currency={detail.currency} />}
            />
            <MetaRow
              label={t.recurringDetail.fields.total}
              value={<AccountingNewMoney amount={totalAmount} currency={detail.currency} className="font-semibold" />}
            />
            <MetaRow label={t.recurringDetail.fields.currency} value={detail.currency} />
            <MetaRow label={t.recurringDetail.fields.vatRate} value={detail.vatRate !== null ? `${detail.vatRate} %` : t.common.noValue} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr,1fr]">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>{t.recurringDetail.paymentTitle}</CardTitle>
            <CardDescription>{t.recurringDetail.paymentDescription}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <MetaRow label={t.recurringDetail.fields.paymentMethod} value={detail.paymentMethod ?? t.common.noValue} />
            <MetaRow
              label={t.recurringDetail.fields.account}
              value={
                detail.bankAccountNumber && detail.bankCode
                  ? `${detail.bankAccountPrefix ? `${detail.bankAccountPrefix}-` : ""}${detail.bankAccountNumber}/${detail.bankCode}`
                  : t.common.noValue
              }
            />
            <MetaRow label={t.recurringDetail.fields.iban} value={detail.bankIban ?? t.common.noValue} />
            <MetaRow
              label={t.recurringDetail.fields.oldInvoicesNote}
              value={<span className="text-muted-foreground">{t.recurringDetail.oldInvoicesDescription}</span>}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>{t.recurringDetail.generationsTitle}</CardTitle>
          <CardDescription>{t.recurringDetail.generationsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {generations.length > 0 ? (
            <AccountingNewRecurringGenerationsTable generations={generations} />
          ) : (
            <p className="text-sm text-muted-foreground">{t.empty.recurringGenerations}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
