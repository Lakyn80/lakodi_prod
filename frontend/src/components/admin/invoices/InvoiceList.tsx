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
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Číslo faktury</th>
                <th className="px-3 py-2 font-medium">Vystaveno</th>
                <th className="px-3 py-2 font-medium">Splatnost</th>
                <th className="px-3 py-2 font-medium">Odběratel</th>
                <th className="px-3 py-2 font-medium">Režim</th>
                <th className="px-3 py-2 font-medium">Celkem</th>
                <th className="px-3 py-2 font-medium">Stav</th>
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
                    <td className="rounded-l-lg px-3 py-3 font-medium text-foreground">{invoice.invoice_number}</td>
                    <td className="px-3 py-3 text-muted-foreground">{formatInvoiceDate(invoice.issue_date)}</td>
                    <td className="px-3 py-3 text-muted-foreground">{formatInvoiceDate(invoice.due_date)}</td>
                    <td className="px-3 py-3 text-foreground">{invoice.customer_name}</td>
                    <td className="px-3 py-3">
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
                    <td className="px-3 py-3 text-muted-foreground">{formatInvoiceStatus(invoice.status)}</td>
                    <td className="rounded-r-lg px-3 py-3">
                      <Button variant={isActive ? "default" : "outline"} size="sm" onClick={() => onSelect(invoice.id)}>
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
      )}
    </section>
  );
}
