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
import { ACCOUNTING_NEW_ROUTE, getAccountingNewSupplier } from "@/lib/accountingNew";
import { getAccountingNewModuleRoute } from "@/lib/accountingNewModuleRoutes";
import type { AccountingNewApiError, AccountingNewSupplierDetailState } from "@/types/accountingNew";
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

export function AccountingNewSupplierDetail({
  supplierId,
}: {
  supplierId: string;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [state, setState] = useState<AccountingNewSupplierDetailState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadDetail() {
      setState({ status: "loading" });

      try {
        const detail = await getAccountingNewSupplier(supplierId, { signal: controller.signal });
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
                resource: "supplier-detail",
                message: error instanceof Error ? error.message : t.errors.supplierDetailTitle,
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
  }, [supplierId, t.errors.supplierDetailTitle]);

  if (state.status === "loading") {
    return <DetailLoading />;
  }

  if (state.status === "auth") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("suppliers")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Alert>
          <AlertTitle>{t.auth.supplierDetailTitle}</AlertTitle>
          <AlertDescription>{t.auth.supplierDetailDescription}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (state.status === "not_found") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("suppliers")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Alert>
          <AlertTitle>{t.supplierDetail.notFoundTitle}</AlertTitle>
          <AlertDescription>{t.supplierDetail.notFoundDescription}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("suppliers")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Alert variant="destructive">
          <AlertTitle>{t.errors.supplierDetailTitle}</AlertTitle>
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
          <Link href={getAccountingNewModuleRoute("suppliers")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Badge variant="secondary">{t.supplierWrite.badgeFunctional}</Badge>
        <Badge variant="outline">{t.suppliers.badge}</Badge>
        <Button asChild>
          <Link href={`${ACCOUNTING_NEW_ROUTE}/dodavatele/${supplierId}/upravit`}>{t.supplierWrite.actions.editSupplier}</Link>
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t.suppliers.badge}</Badge>
          </div>
          <div className="space-y-1">
            <CardTitle>{detail.name}</CardTitle>
            <CardDescription>{t.supplierDetail.description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetaRow label={t.supplierDetail.fields.ico} value={detail.ico ?? t.common.noValue} />
            <MetaRow label={t.supplierDetail.fields.dic} value={detail.dic ?? t.common.noValue} />
            <MetaRow label={t.supplierDetail.fields.dataBox} value={detail.dataBox ?? t.common.noValue} />
            <MetaRow label={t.supplierDetail.fields.country} value={detail.country ?? t.common.noValue} />
            <MetaRow label={t.supplierDetail.fields.createdAt} value={formatAccountingNewDateTime(detail.createdAt, language, t.common.noValue)} />
            <MetaRow label={t.supplierDetail.fields.updatedAt} value={formatAccountingNewDateTime(detail.updatedAt, language, t.common.noValue)} />
          </div>

          <Separator />

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{t.supplierDetail.identityTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.supplierDetail.identityDescription}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetaRow label={t.supplierDetail.fields.name} value={detail.name} />
                <MetaRow label={t.supplierDetail.fields.email} value={detail.email} />
                <MetaRow label={t.supplierDetail.fields.phone} value={detail.phone ?? t.common.noValue} />
                <MetaRow label={t.supplierDetail.fields.address} value={detail.address} />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{t.supplierDetail.scopeTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.supplierDetail.scopeDescription}</p>
              </div>
              <div className="space-y-3 rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
                <p>{t.supplierDetail.scopeItemOne}</p>
                <p>{t.supplierDetail.scopeItemTwo}</p>
                <p>{t.supplierDetail.scopeItemThree}</p>
              </div>
            </div>
          </div>

          {detail.note ? (
            <>
              <Separator />
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-foreground">{t.supplierDetail.noteTitle}</h2>
                <p className="text-sm text-muted-foreground">{detail.note}</p>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
