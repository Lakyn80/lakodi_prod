"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ACCOUNTING_NEW_ROUTE, getAccountingNewSupplier } from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewSupplierDetailState } from "@/types/accountingNew";
import { formatAccountingNewDateTime } from "@/components/admin/accounting-new/accountingNewFormat";

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
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

export function AccountingNewSupplierDetail({
  supplierId,
}: {
  supplierId: string;
}) {
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
                message: error instanceof Error ? error.message : "Read-only detail dodavatele se nepodařilo načíst.",
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
  }, [supplierId]);

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
          <AlertTitle>Pro read-only detail dodavatele je nutné přihlášení</AlertTitle>
          <AlertDescription>
            Bez aktivní admin session se detail dodavatele nenačte. Legacy route `/admin/invoices` zůstává zachovaný.
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
          <AlertTitle>Dodavatel nebyl nalezen</AlertTitle>
          <AlertDescription>Požadovaný dodavatel nebyl na read-only endpointu nalezen.</AlertDescription>
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
          <AlertTitle>Read-only detail dodavatele se nepodařilo načíst</AlertTitle>
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { detail } = state;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <Link href={ACCOUNTING_NEW_ROUTE}>Zpět do ÚčetnictvíNew</Link>
        </Button>
        <Badge variant="secondary">Read-only detail</Badge>
        <Badge variant="outline">Dodavatel</Badge>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Bez write akcí</Badge>
            <Badge variant="outline">Read-only supplier</Badge>
          </div>
          <div className="space-y-1">
            <CardTitle>{detail.name}</CardTitle>
            <CardDescription>
              Read-only detail dodavatele v nové paralelní sekci. Staré issued invoices zůstávají v{" "}
              <Link href="/admin/invoices" className="underline underline-offset-4">
                /admin/invoices
              </Link>
              .
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetaRow label="IČO" value={detail.ico ?? "Neuvedeno"} />
            <MetaRow label="DIČ" value={detail.dic ?? "Neuvedeno"} />
            <MetaRow label="Datová schránka" value={detail.dataBox ?? "Neuvedeno"} />
            <MetaRow label="Země" value={detail.country ?? "Neuvedeno"} />
            <MetaRow label="Vytvořeno" value={formatAccountingNewDateTime(detail.createdAt)} />
            <MetaRow label="Aktualizováno" value={formatAccountingNewDateTime(detail.updatedAt)} />
          </div>

          <Separator />

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Identita a kontakt</h2>
                <p className="text-sm text-muted-foreground">Pouze údaje vrácené bezpečným GET endpointem.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <MetaRow label="Název" value={detail.name} />
                <MetaRow label="E-mail" value={detail.email} />
                <MetaRow label="Telefon" value={detail.phone ?? "Neuvedeno"} />
                <MetaRow label="Adresa" value={detail.address} />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Rozsah read-only detailu</h2>
                <p className="text-sm text-muted-foreground">Tato route záměrně neotevírá žádnou write nebo destruktivní akci.</p>
              </div>
              <div className="space-y-3 rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
                <p>Bez editace, bez mazání a bez změny bankovních dat na backendu.</p>
                <p>Bankovní údaje nejsou v aktuálním safe GET response pro dodavatele vracené, proto je detail nezobrazuje.</p>
                <p>Navázané výdaje zůstávají pro tuto fázi odložené, aby integrace zůstala konzervativní a nízkoriziková.</p>
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
    </div>
  );
}
