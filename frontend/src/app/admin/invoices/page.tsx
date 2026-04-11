"use client";

import { useEffect, useState } from "react";

import { InvoiceDetail } from "@/components/admin/invoices/InvoiceDetail";
import { InvoiceForm } from "@/components/admin/invoices/InvoiceForm";
import { InvoiceList } from "@/components/admin/invoices/InvoiceList";
import { InvoiceSettingsForm } from "@/components/admin/invoices/InvoiceSettingsForm";
import {
  AdminApiError,
  InvoiceDetail as InvoiceDetailType,
  InvoiceSummary,
  getInvoiceDetail,
  listInvoices,
} from "@/lib/invoices";

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetailType | null>(null);
  const [listError, setListError] = useState("");

  const refreshInvoices = async (preferredInvoiceId?: number | null) => {
    setListLoading(true);
    setListError("");
    try {
      const items = await listInvoices();
      setInvoices(items);

      const nextSelectedId = preferredInvoiceId ?? selectedInvoiceId ?? (items.length > 0 ? items[0].id : null);

      if (nextSelectedId && items.some((invoice) => invoice.id === nextSelectedId)) {
        setSelectedInvoiceId(nextSelectedId);
        await loadInvoiceDetail(nextSelectedId);
      } else {
        setSelectedInvoiceId(null);
        setSelectedInvoice(null);
      }
    } catch (err) {
      if (err instanceof AdminApiError || err instanceof Error) {
        setListError(err.message);
      } else {
        setListError("Faktury se nepodařilo načíst.");
      }
    } finally {
      setListLoading(false);
    }
  };

  const loadInvoiceDetail = async (invoiceId: number) => {
    setDetailLoading(true);
    try {
      const detail = await getInvoiceDetail(invoiceId);
      setSelectedInvoice(detail);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 404) {
        setSelectedInvoice(null);
        return;
      }
      throw err;
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void refreshInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreated = async (invoice: InvoiceDetailType) => {
    setSelectedInvoice(invoice);
    setSelectedInvoiceId(invoice.id);
    await refreshInvoices(invoice.id);
  };

  const handleSelectInvoice = async (invoiceId: number) => {
    setSelectedInvoiceId(invoiceId);
    try {
      await loadInvoiceDetail(invoiceId);
    } catch (err) {
      if (err instanceof AdminApiError || err instanceof Error) {
        setListError(err.message);
      } else {
        setListError("Detail faktury se nepodařilo načíst.");
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h1 className="text-2xl font-bold text-foreground">Fakturace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kompletní správa faktur v administraci včetně ARES, PDF exportu a odeslání e-mailem.
        </p>
      </div>

      <InvoiceSettingsForm />

      <InvoiceForm onCreated={handleCreated} />

      {listError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {listError}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <InvoiceList
          invoices={invoices}
          loading={listLoading}
          selectedInvoiceId={selectedInvoiceId}
          onSelect={(invoiceId) => void handleSelectInvoice(invoiceId)}
          onRefresh={() => void refreshInvoices(selectedInvoiceId)}
        />
        <InvoiceDetail
          invoice={selectedInvoice}
          loading={detailLoading}
          onRefresh={() => void refreshInvoices(selectedInvoiceId)}
        />
      </div>
    </div>
  );
}
