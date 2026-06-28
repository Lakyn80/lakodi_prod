import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCOUNTING_NEW_ROUTE, accountingNewModules } from "@/lib/accountingNew";
import { AccountingNewModuleGrid } from "@/components/admin/accounting-new/AccountingNewModuleGrid";

export function AccountingNewShell() {
  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Paralelní sekce</Badge>
            <Badge variant="secondary">Bez migrace</Badge>
          </div>
          <div className="space-y-1">
            <CardTitle>ÚčetnictvíNew</CardTitle>
            <CardDescription>
              Nová paralelní účetní sekce připravená pro postupnou frontend integraci nad nasazeným backendovým
              základem.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm text-foreground">
              Stávající vydané faktury a původní invoicing UI zůstávají zachované beze změny v sekci{" "}
              <Link href="/admin/invoices" className="font-medium underline underline-offset-4">
                /admin/invoices
              </Link>
              . Tato nová část zatím nic nemigruje ani neupravuje.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-sm text-muted-foreground">
              Aktuální krok vytváří pouze bezpečný shell na adrese <span className="font-medium text-foreground">{ACCOUNTING_NEW_ROUTE}</span>.
              Další úkoly sem budou postupně doplňovat read-only dashboard, seznamy dokladů a detailní moduly.
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Budoucí moduly</h2>
          <p className="text-sm text-muted-foreground">
            Všechny sekce níže jsou zatím pouze vizuální placeholdery bez načítání nebo zápisu účetních dat.
          </p>
        </div>
        <AccountingNewModuleGrid modules={accountingNewModules} />
      </section>
    </div>
  );
}
