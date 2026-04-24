"use client";

import { useEffect, useState } from "react";
import { Download, Mail, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdminApiError,
  InvoiceDetail as InvoiceDetailType,
  downloadInvoicePdf,
  formatInvoiceBusinessMode,
  formatInvoiceDate,
  formatInvoiceDateTime,
  formatInvoiceMoney,
  formatInvoiceStatus,
  formatInvoiceTaxMode,
  formatReverseChargeReason,
  sendInvoiceEmail,
} from "@/lib/invoices";

function buildFullAddress(address: string, zipCode: string, city: string) {
  const normalizePart = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("cs-CZ");
  const parts = [address.trim()].filter(Boolean);
  const zipCity = [zipCode, city].filter(Boolean).join(" ").trim();

  if (zipCity && !normalizePart(parts.join(", ")).includes(normalizePart(zipCity))) {
    parts.push(zipCity);
  }

  return parts.join(", ");
}

export function InvoiceDetail({
  invoice,
  loading,
  onEdit,
  onRefresh,
}: {
  invoice: InvoiceDetailType | null;
  loading: boolean;
  onEdit: () => void;
  onRefresh: () => void;
}) {
  const [toEmail, setToEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setToEmail(invoice?.customer_email ?? "");
    setMessage("");
    setError("");
  }, [invoice?.id, invoice?.customer_email]);

  const handleSend = async () => {
    if (!invoice) return;
    setSending(true);
    setMessage("");
    setError("");
    try {
      const result = await sendInvoiceEmail(invoice.id, { to_email: toEmail || undefined });
      const copiedTo =
        result.copied_to.length > 0 ? ` Kopie odešla také na ${result.copied_to.join(", ")}.` : "";
      setMessage(`Faktura byla odeslána na adresu ${result.sent_to}.${copiedTo}`);
      onRefresh();
    } catch (err) {
      if (err instanceof AdminApiError || err instanceof Error) {
        setError(err.message);
      } else {
        setError("Fakturu se nepodařilo odeslat e-mailem.");
      }
    } finally {
      setSending(false);
    }
  };

  const handleDownload = async () => {
    if (!invoice) return;
    setDownloading(true);
    setMessage("");
    setError("");
    try {
      await downloadInvoicePdf(invoice.id);
    } catch (err) {
      if (err instanceof AdminApiError || err instanceof Error) {
        setError(err.message);
      } else {
        setError("Nepodařilo se stáhnout PDF faktury.");
      }
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Načítám detail faktury…</p>
      </section>
    );
  }

  if (!invoice) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-xl font-semibold text-foreground">Detail faktury</h2>
        <p className="mt-2 text-sm text-muted-foreground">Vyberte fakturu ze seznamu nebo vytvořte novou.</p>
      </section>
    );
  }

  const reverseChargeReason = formatReverseChargeReason(invoice.reverse_charge_reason);
  const issuerFullAddress = buildFullAddress(invoice.issuer_address, invoice.issuer_zip, invoice.issuer_city);

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Detail faktury {invoice.invoice_number}</h2>
          <p className="text-sm text-muted-foreground">
            Vystaveno {formatInvoiceDate(invoice.issue_date)} • vytvořeno {formatInvoiceDateTime(invoice.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{formatInvoiceBusinessMode(invoice.business_mode)}</Badge>
          <Badge variant="secondary">{formatInvoiceTaxMode(invoice.tax_mode)}</Badge>
          <Badge variant="outline">{formatInvoiceStatus(invoice.status)}</Badge>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-4">
          <h3 className="mb-3 font-medium text-foreground">Dodavatel</h3>
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">{invoice.issuer_name}</p>
            <p className="text-muted-foreground">{issuerFullAddress}</p>
            <p className="text-muted-foreground">IČO: {invoice.issuer_ico}</p>
            <p className="text-muted-foreground">DIČ: {invoice.issuer_dic}</p>
            {invoice.issuer_data_box && <p className="text-muted-foreground">Datová schránka: {invoice.issuer_data_box}</p>}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <h3 className="mb-3 font-medium text-foreground">Odběratel</h3>
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">{invoice.customer_name}</p>
            <p className="break-all text-muted-foreground">{invoice.customer_email}</p>
            {invoice.customer_phone && <p className="text-muted-foreground">{invoice.customer_phone}</p>}
            <p className="text-muted-foreground">{invoice.customer_address || "Adresa odběratele není vyplněná."}</p>
            {invoice.customer_ico && <p className="text-muted-foreground">IČO: {invoice.customer_ico}</p>}
            {invoice.customer_dic && <p className="text-muted-foreground">DIČ: {invoice.customer_dic}</p>}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-border bg-background p-4">
        <div className="space-y-3 sm:hidden">
          {invoice.items.map((item) => (
            <div key={item.id} className="rounded-lg border border-border/70 bg-card p-3">
              <p className="font-medium text-foreground">{item.description}</p>
              <div className="mt-3 space-y-2 text-sm">
                <p className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Množství</span>
                  <span className="text-foreground">{item.quantity}</span>
                </p>
                <p className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Jednotková cena</span>
                  <span className="text-right text-foreground">
                    {formatInvoiceMoney(item.unit_price, invoice.currency)}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Celkem</span>
                  <span className="text-right font-medium text-foreground">
                    {formatInvoiceMoney(item.line_total, invoice.currency)}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Položka</th>
                <th className="px-3 py-2 font-medium text-right">Množství</th>
                <th className="px-3 py-2 font-medium text-right">Jednotková cena</th>
                <th className="px-3 py-2 font-medium text-right">Celkem</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id} className="border-b border-border/70 last:border-0">
                  <td className="px-3 py-2 text-foreground">{item.description}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{item.quantity}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {formatInvoiceMoney(item.unit_price, invoice.currency)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">
                    {formatInvoiceMoney(item.line_total, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-lg border border-border bg-background p-4">
          <h3 className="mb-3 font-medium text-foreground">Doplňující informace</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Datum splatnosti:</span> {formatInvoiceDate(invoice.due_date)}
            </p>
            <p>
              <span className="font-medium text-foreground">Variabilní symbol:</span> {invoice.variable_symbol}
            </p>
            <p>
              <span className="font-medium text-foreground">Způsob platby:</span> {invoice.payment_method}
            </p>
            <p>
              <span className="font-medium text-foreground">Bankovní účet:</span>{" "}
              {invoice.bank_account_prefix
                ? `${invoice.bank_account_prefix}-${invoice.bank_account_number}/${invoice.bank_code}`
                : `${invoice.bank_account_number}/${invoice.bank_code}`}
            </p>
            <p className="break-all">
              <span className="font-medium text-foreground">IBAN:</span> {invoice.bank_iban}
            </p>
            {invoice.note && (
              <p>
                <span className="font-medium text-foreground">Poznámka:</span> {invoice.note}
              </p>
            )}
            {reverseChargeReason && (
              <p>
                <span className="font-medium text-foreground">Důvod režimu:</span> {reverseChargeReason}
              </p>
            )}
            {invoice.reverse_charge_text && (
              <p>
                <span className="font-medium text-foreground">Text k přenesené daňové povinnosti:</span>{" "}
                {invoice.reverse_charge_text}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <h3 className="mb-3 font-medium text-foreground">Souhrn</h3>
          <div className="space-y-2 text-sm">
            <p className="flex items-center justify-between">
              <span className="text-muted-foreground">Mezisoučet</span>
              <span className="font-medium text-foreground">{formatInvoiceMoney(invoice.subtotal, invoice.currency)}</span>
            </p>
            <p className="flex items-center justify-between">
              <span className="text-muted-foreground">
                DPH{invoice.vat_rate != null ? ` (${invoice.vat_rate} %)` : ""}
              </span>
              <span className="font-medium text-foreground">{formatInvoiceMoney(invoice.vat_amount, invoice.currency)}</span>
            </p>
            <p className="flex items-center justify-between border-t border-border pt-2">
              <span className="font-medium text-foreground">Celkem</span>
              <span className="text-lg font-semibold text-foreground">{formatInvoiceMoney(invoice.total, invoice.currency)}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-border bg-background p-4">
        <h3 className="mb-3 font-medium text-foreground">Akce</h3>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 md:flex-row">
            <Button variant="secondary" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
              Upravit fakturu
            </Button>
            <Input
              type="email"
              value={toEmail}
              onChange={(event) => setToEmail(event.target.value)}
              placeholder="prijemce@firma.cz"
            />
            <Button onClick={handleSend} disabled={sending || !toEmail.trim()}>
              <Mail className="h-4 w-4" />
              {sending ? "Odesílám e-mail…" : "Odeslat e-mailem"}
            </Button>
            <Button variant="outline" onClick={handleDownload} disabled={downloading}>
              <Download className="h-4 w-4" />
              {downloading ? "Stahuji PDF…" : "Stáhnout PDF"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            E-mail se odesílá s PDF fakturou v příloze a skrytou kopií pro majitele.
          </p>
        </div>
        {message && <p className="mt-3 text-sm text-green-600">{message}</p>}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </div>
    </section>
  );
}
