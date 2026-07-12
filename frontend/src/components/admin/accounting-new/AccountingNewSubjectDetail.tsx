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
import { ACCOUNTING_NEW_ROUTE, getAccountingNewSubject } from "@/lib/accountingNew";
import { getAccountingNewModuleRoute } from "@/lib/accountingNewModuleRoutes";
import type { AccountingNewApiError, AccountingNewSubjectDetailState } from "@/types/accountingNew";
import { formatAccountingNewDateTime, translateAccountingNewApiError } from "@/components/admin/accounting-new/accountingNewFormat";

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
      <div className="break-words text-sm text-foreground">{value}</div>
    </div>
  );
}

export function AccountingNewSubjectDetail({ subjectId }: { subjectId: string }) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [state, setState] = useState<AccountingNewSubjectDetailState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadDetail() {
      setState({ status: "loading" });

      try {
        const detail = await getAccountingNewSubject(subjectId, { signal: controller.signal });
        setState({ status: "ready", detail });
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
                resource: "subject-detail",
                message: error instanceof Error ? error.message : t.errors.subjectDetailTitle,
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
  }, [subjectId, t.errors.subjectDetailTitle]);

  if (state.status === "loading") {
    return <DetailLoading />;
  }

  if (state.status === "auth") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("subjects")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Alert>
          <AlertTitle>{t.auth.subjectDetailTitle}</AlertTitle>
          <AlertDescription>{t.auth.subjectDetailDescription}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (state.status === "not_found") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("subjects")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Alert>
          <AlertTitle>{t.subjectDetail.notFoundTitle}</AlertTitle>
          <AlertDescription>{t.subjectDetail.notFoundDescription}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("subjects")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Alert variant="destructive">
          <AlertTitle>{t.errors.subjectDetailTitle}</AlertTitle>
          <AlertDescription>{translateAccountingNewApiError(t, state.error)}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { detail } = state;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("subjects")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Badge variant="secondary">{t.subjectWrite.badgeFunctional}</Badge>
        <Badge variant="outline">{t.subjects.badge}</Badge>
        <Button asChild>
          <Link href={`${ACCOUNTING_NEW_ROUTE}/odberatele/${subjectId}/upravit`}>{t.subjectWrite.actions.editSubject}</Link>
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="space-y-3">
          <div className="space-y-1">
            <CardTitle>{detail.name}</CardTitle>
            <CardDescription>{t.subjectDetail.description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetaRow label={t.aresWrite.ico} value={detail.ico ?? t.common.noValue} />
            <MetaRow label={t.aresWrite.dic} value={detail.dic ?? t.common.noValue} />
            <MetaRow label={t.subjectWrite.fields.dataBox} value={detail.dataBox ?? t.common.noValue} />
            <MetaRow label={t.subjectWrite.fields.country} value={detail.country ?? t.common.noValue} />
            <MetaRow
              label={t.supplierDetail.fields.createdAt}
              value={formatAccountingNewDateTime(detail.createdAt, language, t.common.noValue)}
            />
            <MetaRow
              label={t.supplierDetail.fields.updatedAt}
              value={formatAccountingNewDateTime(detail.updatedAt, language, t.common.noValue)}
            />
          </div>

          <Separator />

          <div className="grid gap-6 lg:grid-cols-2">
            <MetaRow label={t.aresWrite.email} value={detail.email} />
            <MetaRow label={t.aresWrite.phone} value={detail.phone ?? t.common.noPhone} />
            <div className="md:col-span-2">
              <MetaRow label={t.aresWrite.address} value={detail.address} />
            </div>
          </div>

          {detail.note ? (
            <>
              <Separator />
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-foreground">{t.subjectWrite.fields.note}</h2>
                <p className="text-sm text-muted-foreground">{detail.note}</p>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
