"use client";

import { useEffect, useState } from "react";
import { Download, Mail, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addInvoicePayment,
  AdminApiError,
  deleteInvoicePayment,
  InvoiceDetail as InvoiceDetailType,
  downloadInvoicePdf,
  formatInvoiceBusinessMode,
  formatInvoiceDate,
  formatInvoiceDateTime,
  formatInvoiceMoney,
  formatInvoicePaymentStatus,
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setToEmail(invoice?.customer_email ?? "");
    setPaymentAmount(invoice ? String(invoice.remaining_amount || "") : "");
    setPaymentDate(todayIso());
    setPaymentMethod(invoice?.payment_method ?? "");
    setPaymentNote("");
    setMessage("");
    setError("");
  }, [invoice]);

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

  const handleAddPayment = async () => {
    if (!invoice) return;
    setSavingPayment(true);
    setMessage("");
    setError("");
    try {
      await addInvoicePayment(invoice.id, {
        amount: Number(paymentAmount),
        paid_at: paymentDate,
        payment_method: paymentMethod,
        note: paymentNote || undefined,
      });
      setMessage("Platba byla zaevidována.");
      await onRefresh();
    } catch (err) {
      if (err instanceof AdminApiError || err instanceof Error) {
        setError(err.message);
      } else {
        setError("Platbu se nepodařilo uložit.");
      }
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!invoice) return;
    setDeletingPaymentId(paymentId);
    setMessage("");
    setError("");
    try {
      await deleteInvoicePayment(invoice.id, paymentId);
      setMessage("Platba byla smazána.");
      await onRefresh();
    } catch (err) {
      if (err instanceof AdminApiError || err instanceof Error) {
        setError(err.message);
      } else {
        setError("Platbu se nepodařilo smazat.");
      }
    } finally {
      setDeletingPaymentId(null);
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
  const canRegisterPayment = invoice.remaining_amount > 0 && invoice.effective_status !== "cancelled";

  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-5">
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
          <Badge variant="outline">{formatInvoiceStatus(invoice.effective_status)}</Badge>
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

        <div className="hidden sm:block">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="w-[52%] px-3 py-2 font-medium">Položka</th>
                <th className="w-[12%] px-3 py-2 font-medium text-right">Množství</th>
                <th className="w-[18%] px-3 py-2 font-medium text-right">Jednotková cena</th>
                <th className="w-[18%] px-3 py-2 font-medium text-right">Celkem</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id} className="border-b border-border/70 last:border-0">
                  <td className="break-words px-3 py-2 align-top text-foreground">{item.description}</td>
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

      <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-border bg-background p-4">
          <h3 className="mb-3 font-medium text-foreground">Platby</h3>
          <div className="space-y-2 text-sm">
            <p className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Platební stav</span>
              <span className="font-medium text-foreground">
                {formatInvoicePaymentStatus(invoice.payment_status)}
              </span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Uhrazeno</span>
              <span className="font-medium text-foreground">
                {formatInvoiceMoney(invoice.total_paid, invoice.currency)}
              </span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Zbývá uhradit</span>
              <span className="font-medium text-foreground">
                {formatInvoiceMoney(invoice.remaining_amount, invoice.currency)}
              </span>
            </p>
            <p className="flex items-center justify-between gap-3 border-t border-border pt-2">
              <span className="text-muted-foreground">Efektivní stav</span>
              <span className="font-medium text-foreground">
                {formatInvoiceStatus(invoice.effective_status)}
              </span>
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-medium text-foreground">Evidence plateb</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Přidejte ručně přijatou platbu a systém přepočítá zbývající částku.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={paymentAmount}
              onChange={(event) => setPaymentAmount(event.target.value)}
              placeholder="Částka platby"
              disabled={!canRegisterPayment || savingPayment}
            />
            <Input
              type="date"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
              disabled={!canRegisterPayment || savingPayment}
            />
            <Input
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
              placeholder="Způsob platby"
              disabled={!canRegisterPayment || savingPayment}
            />
            <Input
              value={paymentNote}
              onChange={(event) => setPaymentNote(event.target.value)}
              placeholder="Poznámka k platbě"
              disabled={!canRegisterPayment || savingPayment}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => void handleAddPayment()}
              disabled={
                savingPayment ||
                !canRegisterPayment ||
                !paymentAmount.trim() ||
                !paymentDate.trim() ||
                !paymentMethod.trim()
              }
            >
              {savingPayment ? "Ukládám platbu…" : "Zaevidovat platbu"}
            </Button>
            {!canRegisterPayment && (
              <p className="text-xs text-muted-foreground">
                {invoice.effective_status === "cancelled"
                  ? "Ke stornované faktuře nelze přidávat platby."
                  : "Faktura je už plně uhrazená."}
              </p>
            )}
          </div>

          <div className="mt-4 space-y-3">
            {invoice.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Zatím není zaevidována žádná platba.</p>
            ) : (
              invoice.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-col gap-3 rounded-lg border border-border/70 bg-card p-3 md:flex-row md:items-start md:justify-between"
                >
                  <div className="space-y-1 text-sm">
                    <p className="font-medium text-foreground">
                      {formatInvoiceMoney(payment.amount, invoice.currency)} • {payment.payment_method}
                    </p>
                    <p className="text-muted-foreground">Uhrazeno {formatInvoiceDate(payment.paid_at)}</p>
                    {payment.note && <p className="text-muted-foreground">{payment.note}</p>}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={deletingPaymentId === payment.id}
                    onClick={() => void handleDeletePayment(payment.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    {deletingPaymentId === payment.id ? "Mažu…" : "Smazat platbu"}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-border bg-background p-4">
        <h3 className="mb-3 font-medium text-foreground">Akce</h3>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
            <Button variant="secondary" className="md:flex-none" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
              Upravit fakturu
            </Button>
            <Input
              className="md:min-w-0 md:flex-[1_1_18rem]"
              type="email"
              value={toEmail}
              onChange={(event) => setToEmail(event.target.value)}
              placeholder="prijemce@firma.cz"
            />
            <Button className="md:flex-none" onClick={handleSend} disabled={sending || !toEmail.trim()}>
              <Mail className="h-4 w-4" />
              {sending ? "Odesílám e-mail…" : "Odeslat e-mailem"}
            </Button>
            <Button className="md:flex-none" variant="outline" onClick={handleDownload} disabled={downloading}>
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
