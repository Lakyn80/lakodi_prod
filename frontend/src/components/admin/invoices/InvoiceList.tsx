"use client";

import { Eye, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  InvoiceSummary,
  formatInvoiceBusinessMode,
  formatInvoiceDate,
  formatInvoiceMoney,
  formatInvoiceStatus,
  formatInvoiceTaxMode,
} from "@/lib/invoices";

function modeBadgeVariant(value: string): "secondary" | "outline" {
  if (value === "reverse_charge") return "secondary";
  return "outline";
}

export function InvoiceList({
  invoices,
  loading,
  selectedInvoiceId,
  onSelect,
  onRefresh,
}: {
  invoices: InvoiceSummary[];
  loading: boolean;
  selectedInvoiceId: number | null;
  onSelect: (invoiceId: number) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Vystavené faktury</h2>
          <p className="text-sm text-muted-foreground">Seznam již vytvořených faktur.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Obnovit
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Načítám faktury…</p>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">Zatím nebyla vystavena žádná faktura.</p>
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {invoices.map((invoice) => {
              const isActive = invoice.id === selectedInvoiceId;
              return (
                <article
                  key={invoice.id}
                  className={`rounded-lg border p-4 ${
                    isActive ? "border-primary bg-primary/5" : "border-border bg-background"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Faktura {invoice.invoice_number}
                      </p>
                      <p className="mt-1 font-medium text-foreground">{invoice.customer_name}</p>
                    </div>
                    <Badge variant="outline">{formatInvoiceStatus(invoice.status)}</Badge>
                  </div>

                  <div className="mt-4 space-y-2 text-sm">
                    <p className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Vystaveno</span>
                      <span className="text-right text-foreground">
                        {formatInvoiceDate(invoice.issue_date)}
                      </span>
                    </p>
                    <p className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Splatnost</span>
                      <span className="text-right text-foreground">
                        {formatInvoiceDate(invoice.due_date)}
                      </span>
                    </p>
                    <p className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Celkem</span>
                      <span className="text-right font-medium text-foreground">
                        {formatInvoiceMoney(invoice.total, invoice.currency)}
                      </span>
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge variant={modeBadgeVariant(invoice.business_mode)}>
                      {formatInvoiceBusinessMode(invoice.business_mode)}
                    </Badge>
                    <Badge variant={modeBadgeVariant(invoice.tax_mode)}>
                      {formatInvoiceTaxMode(invoice.tax_mode)}
                    </Badge>
                  </div>

                  <Button
                    className="mt-4 w-full"
                    variant={isActive ? "default" : "outline"}
                    onClick={() => onSelect(invoice.id)}
                  >
                    <Eye className="h-4 w-4" />
                    Detail
                  </Button>
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Číslo faktury</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">Vystaveno</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">Splatnost</th>
                  <th className="px-3 py-2 font-medium">Odběratel</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">Režim</th>
                  <th className="px-3 py-2 font-medium">Celkem</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">Stav</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const isActive = invoice.id === selectedInvoiceId;
                  return (
                    <tr
                      key={invoice.id}
                      className={`rounded-lg border ${
                        isActive ? "border-primary bg-primary/5" : "border-border bg-background"
                      }`}
                    >
                      <td className="rounded-l-lg px-3 py-3 font-medium text-foreground">
                        {invoice.invoice_number}
                      </td>
                      <td className="hidden px-3 py-3 text-muted-foreground sm:table-cell">
                        {formatInvoiceDate(invoice.issue_date)}
                      </td>
                      <td className="hidden px-3 py-3 text-muted-foreground sm:table-cell">
                        {formatInvoiceDate(invoice.due_date)}
                      </td>
                      <td className="px-3 py-3 text-foreground">{invoice.customer_name}</td>
                      <td className="hidden px-3 py-3 md:table-cell">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={modeBadgeVariant(invoice.business_mode)}>
                            {formatInvoiceBusinessMode(invoice.business_mode)}
                          </Badge>
                          <Badge variant={modeBadgeVariant(invoice.tax_mode)}>
                            {formatInvoiceTaxMode(invoice.tax_mode)}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-medium text-foreground">
                        {formatInvoiceMoney(invoice.total, invoice.currency)}
                      </td>
                      <td className="hidden px-3 py-3 text-muted-foreground sm:table-cell">
                        {formatInvoiceStatus(invoice.status)}
                      </td>
                      <td className="rounded-r-lg px-3 py-3">
                        <Button
                          variant={isActive ? "default" : "outline"}
                          size="sm"
                          onClick={() => onSelect(invoice.id)}
                        >
                          <Eye className="h-4 w-4" />
                          Detail
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
