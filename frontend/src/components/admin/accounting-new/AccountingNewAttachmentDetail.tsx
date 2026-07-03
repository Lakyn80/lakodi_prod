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
import {
  ACCOUNTING_NEW_ROUTE,
  AccountingNewRequestError,
  getAccountingNewAttachment,
  getAccountingNewAttachmentAuditEvents,
} from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewAttachmentDetailState } from "@/types/accountingNew";
import { AccountingNewAttachmentStatusBadge } from "@/components/admin/accounting-new/AccountingNewAttachmentStatusBadge";
import {
  formatAccountingNewDateTime,
  formatAccountingNewFileSize,
  formatAccountingNewTemplate,
  translateAccountingNewApiError,
  translateAccountingNewAttachmentType,
  translateAccountingNewEntityType,
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
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

export function AccountingNewAttachmentDetail({ attachmentId }: { attachmentId: string }) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [state, setState] = useState<AccountingNewAttachmentDetailState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadDetail() {
      setState({ status: "loading" });

      try {
        const detail = await getAccountingNewAttachment(attachmentId, { signal: controller.signal });
        const auditEventsResult = await Promise.allSettled([
          getAccountingNewAttachmentAuditEvents(attachmentId, { signal: controller.signal }),
        ]);

        const partialErrors: AccountingNewApiError[] = [];
        const auditEvents = auditEventsResult[0].status === "fulfilled" ? auditEventsResult[0].value : [];

        if (auditEventsResult[0].status === "rejected" && auditEventsResult[0].reason instanceof AccountingNewRequestError) {
          partialErrors.push(auditEventsResult[0].reason.apiError);
        }

        setState({
          status: "ready",
          detail,
          auditEvents,
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
            resource: "attachment-detail",
            message: error instanceof Error ? error.message : t.errors.attachmentDetailTitle,
            status: null,
            requiresLogin: false,
          },
        });
      }
    }

    void loadDetail();

    return () => controller.abort();
  }, [attachmentId, t.errors.attachmentDetailTitle]);

  if (state.status === "loading") {
    return <DetailLoading />;
  }

  if (state.status === "auth") {
    return (
      <Alert>
        <AlertTitle>{t.auth.attachmentDetailTitle}</AlertTitle>
        <AlertDescription>{t.auth.attachmentDetailDescription}</AlertDescription>
      </Alert>
    );
  }

  if (state.status === "not_found") {
    return (
      <Alert>
        <AlertTitle>{t.attachmentDetail.notFoundTitle}</AlertTitle>
        <AlertDescription>{t.attachmentDetail.notFoundDescription}</AlertDescription>
      </Alert>
    );
  }

  if (state.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.errors.attachmentDetailTitle}</AlertTitle>
        <AlertDescription>{translateAccountingNewApiError(t, state.error)}</AlertDescription>
      </Alert>
    );
  }

  const { detail, auditEvents, partialErrors } = state;
  const partialError = getFirstError(partialErrors);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline">
          <Link href={ACCOUNTING_NEW_ROUTE}>{t.attachmentDetail.backLabel}</Link>
        </Button>
        <Badge variant="outline">{t.attachmentDetail.badge}</Badge>
        <Badge variant="secondary">{t.common.readOnlyBadge}</Badge>
      </div>

      {partialError ? (
        <Alert>
          <AlertTitle>{t.errors.supplementalTitle}</AlertTitle>
          <AlertDescription>{translateAccountingNewApiError(t, partialError)}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>{detail.originalFilename}</CardTitle>
          <CardDescription>{t.attachmentDetail.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t.attachmentDetail.sections.summary}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MetaRow
                label={t.attachmentDetail.fields.attachmentType}
                value={translateAccountingNewAttachmentType(t, detail.attachmentType)}
              />
              <MetaRow
                label={t.attachmentDetail.fields.status}
                value={<AccountingNewAttachmentStatusBadge label={detail.status} />}
              />
              <MetaRow label={t.attachmentDetail.fields.mimeType} value={detail.contentType} />
              <MetaRow
                label={t.attachmentDetail.fields.fileSize}
                value={formatAccountingNewFileSize(detail.sizeBytes, language, t.common.noValue)}
              />
              <MetaRow
                label={t.attachmentDetail.fields.createdAt}
                value={formatAccountingNewDateTime(detail.createdAt, language, t.common.noValue)}
              />
              <MetaRow label={t.attachmentDetail.fields.checksum} value={detail.checksumSha256 ?? t.common.noValue} />
            </div>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t.attachmentDetail.sections.relations}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <MetaRow
                label={t.attachmentDetail.fields.invoice}
                value={
                  detail.invoiceId ? (
                    <Link href={`${ACCOUNTING_NEW_ROUTE}/doklady/${detail.invoiceId}`} className="underline underline-offset-4">
                      {formatAccountingNewTemplate(t.attachments.table.invoiceLinked, { id: detail.invoiceId })}
                    </Link>
                  ) : (
                    t.common.noValue
                  )
                }
              />
              <MetaRow
                label={t.attachmentDetail.fields.expense}
                value={
                  detail.expenseId ? (
                    <Link href={`${ACCOUNTING_NEW_ROUTE}/vydaje/${detail.expenseId}`} className="underline underline-offset-4">
                      {formatAccountingNewTemplate(t.attachments.table.expenseLinked, { id: detail.expenseId })}
                    </Link>
                  ) : (
                    t.common.noValue
                  )
                }
              />
              <MetaRow
                label={t.attachmentDetail.fields.todo}
                value={
                  detail.todoId
                    ? formatAccountingNewTemplate(t.attachments.table.todoLinked, { id: detail.todoId })
                    : t.common.noValue
                }
              />
              <MetaRow
                label={t.attachmentDetail.fields.bankTransaction}
                value={
                  detail.bankTransactionId ? (
                    <Link
                      href={`${ACCOUNTING_NEW_ROUTE}/bankovni-transakce/${detail.bankTransactionId}`}
                      className="underline underline-offset-4"
                    >
                      {formatAccountingNewTemplate(t.attachments.table.bankTransactionLinked, {
                        id: detail.bankTransactionId,
                      })}
                    </Link>
                  ) : (
                    t.common.noValue
                  )
                }
              />
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t.attachmentDetail.sections.note}
            </h2>
            <p className="text-sm text-foreground">{detail.note ?? t.common.noValue}</p>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t.attachmentDetail.sections.operations}
            </h2>
            <p className="text-sm text-muted-foreground">{t.attachmentDetail.operationsDescription}</p>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>{t.attachmentDetail.operationsItemOne}</li>
              <li>{t.attachmentDetail.operationsItemTwo}</li>
              <li>{t.attachmentDetail.operationsItemThree}</li>
            </ul>
            <p className="text-sm text-muted-foreground">{t.attachmentDetail.oldInvoicesDescription}</p>
          </section>

          {auditEvents.length > 0 ? (
            <>
              <Separator />
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.attachmentDetail.sections.audit}
                </h2>
                <div className="space-y-3">
                  {auditEvents.map((event) => (
                    <div key={event.id} className="rounded-lg border border-border bg-background p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{translateAccountingNewEntityType(t, event.entityType)}</Badge>
                        <Badge variant="secondary">{event.eventType}</Badge>
                      </div>
                      <p className="mt-3 text-sm text-foreground">{event.message ?? t.common.noAuditMessage}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatAccountingNewDateTime(event.createdAt, language, t.common.noValue)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
