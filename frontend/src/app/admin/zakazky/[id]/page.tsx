"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { zakazkyUrl, uploadsUrl, apiFetchOptions } from "@/lib/api";
import { downloadZakazkovyListPdfForZakazka } from "@/lib/zakazkovyListPdf";
import { Button } from "@/components/ui/button";

interface Zakazka {
  id: number;
  category: string;
  name: string;
  email: string | null;
  phone: string;
  description: string;
  repair_description: string | null;
  status: string;
  estimated_price: number | null;
  final_price: number | null;
  answers: Record<string, string>;
  photos: string[];
  callback_requested: boolean;
  completed_at: string | null;
  created_at: string;
}

const STATUS_OPTIONS = ["poptávka", "odeslaná nabídka", "potvrzená objednávka", "hotovo"] as const;
const getAnswerValue = (answers: Record<string, string> | undefined, key: string) =>
  String(answers?.[key] ?? "");
const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export default function ZakazkaDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string;
  const backToCalendar = searchParams?.get("back") === "kalendar";
  const backHref = backToCalendar ? "/admin/kalendar" : "/admin";
  const backLabel = backToCalendar ? "Zpět na kalendář" : "Zpět na seznam";
  const [zakazka, setZakazka] = useState<Zakazka | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("poptávka");
  const [repairDescription, setRepairDescription] = useState("");
  const [estimatedPrice, setEstimatedPrice] = useState("");
  const [finalPrice, setFinalPrice] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [message, setMessage] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(zakazkyUrl(`/${id}`), apiFetchOptions)
      .then((r) => {
        if (r.status === 401) {
          window.location.href = "/admin/login";
          return null;
        }
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setZakazka(d);
        setStatus(d.status || "poptávka");
        setRepairDescription(d.repair_description || "");
        setEstimatedPrice(d.estimated_price != null ? String(d.estimated_price) : "");
        setFinalPrice(d.final_price != null ? String(d.final_price) : "");
        setOrderNumber(getAnswerValue(d.answers, "admin_order_number"));
        setPreferredDate(getAnswerValue(d.answers, "preferred_date"));
        setPreferredTime(getAnswerValue(d.answers, "preferred_time"));
      })
      .catch(() => setZakazka(null))
      .finally(() => setLoading(false));

    fetch(zakazkyUrl(`/${id}/whatsapp-link`), apiFetchOptions)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.url) setWhatsappUrl(d.url);
      })
      .catch(() => {});
  }, [id]);

  const handleSave = async () => {
    if (!id || !zakazka) return;
    if (status === "hotovo" && !finalPrice.trim()) {
      setMessage("Pro status hotovo zadejte konečnou cenu.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(zakazkyUrl(`/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          status,
          repair_description: repairDescription,
          estimated_price: estimatedPrice.trim() ? Number(estimatedPrice) : null,
          final_price: finalPrice.trim() ? Number(finalPrice) : null,
          admin_order_number: orderNumber,
          preferred_date: preferredDate,
          preferred_time: preferredTime,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(data.detail || "Nepodařilo se uložit změny.");
        return;
      }
      const data = await res.json();
      setZakazka(data);
      setStatus(data.status || "poptávka");
      setRepairDescription(data.repair_description || "");
      setEstimatedPrice(data.estimated_price != null ? String(data.estimated_price) : "");
      setFinalPrice(data.final_price != null ? String(data.final_price) : "");
      setOrderNumber(getAnswerValue(data.answers, "admin_order_number"));
      setPreferredDate(getAnswerValue(data.answers, "preferred_date"));
      setPreferredTime(getAnswerValue(data.answers, "preferred_time"));
      setMessage("Uloženo.");
      const wa = await fetch(zakazkyUrl(`/${id}/whatsapp-link`), apiFetchOptions).then((r) =>
        r.ok ? r.json() : null
      );
      if (wa?.url) setWhatsappUrl(wa.url);
    } catch {
      setMessage("Chyba připojení.");
    } finally {
      setSaving(false);
    }
  };

  const handleSendEmail = async () => {
    if (!id) return;
    setSending(true);
    setMessage("");
    try {
      const res = await fetch(zakazkyUrl(`/${id}/send-email`), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(data.detail || "Nepodařilo se odeslat email.");
        return;
      }
      setMessage("Email zákazníkovi byl odeslán.");
    } catch {
      setMessage("Chyba připojení.");
    } finally {
      setSending(false);
    }
  };

  const handleDownloadZakazkovyList = async () => {
    if (!id) return;
    setDownloadingPdf(true);
    setMessage("");
    try {
      await downloadZakazkovyListPdfForZakazka(id);
      setMessage("Zakázkový list PDF byl stažen.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDF se nepodařilo stáhnout.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <p className="text-muted-foreground">Načítání…</p>
      </div>
    );
  }

  if (!zakazka) {
    return (
      <div className="container mx-auto px-4 py-12">
        <p className="text-muted-foreground">Zakázka nenalezena.</p>
        <Link href={backHref} className="mt-4 inline-block text-primary underline">
          ← {backLabel}
        </Link>
      </div>
    );
  }
  const displayOrderNumber = orderNumber.trim() || String(zakazka.id);

  return (
    <div className="container mx-auto px-4 py-12">
      <Link href={backHref} className="mb-6 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6">
        <h1 className="mb-6 text-2xl font-bold text-foreground">Zakázka #{displayOrderNumber}</h1>

        <dl className="space-y-3">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Kategorie</dt>
            <dd className="text-foreground">{zakazka.category}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Jméno</dt>
            <dd className="text-foreground">{zakazka.name}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Email</dt>
            <dd className="text-foreground">{zakazka.email || "—"}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Telefon</dt>
            <dd>
              <a href={`tel:${zakazka.phone}`} className="text-primary underline">
                {zakazka.phone}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Přijato</dt>
            <dd className="text-foreground">{formatDateTime(zakazka.created_at)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Původní popis</dt>
            <dd className="whitespace-pre-wrap text-foreground">{zakazka.description}</dd>
          </div>
        </dl>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">Stav</label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">Číslo objednávky</label>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">Datum termínu</label>
            <input
              type="date"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">Čas termínu</label>
            <input
              type="time"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={preferredTime}
              onChange={(e) => setPreferredTime(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">Předběžná cena (Kč)</label>
            <input
              type="number"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={estimatedPrice}
              onChange={(e) => setEstimatedPrice(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">Konečná cena (Kč)</label>
            <input
              type="number"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={finalPrice}
              onChange={(e) => setFinalPrice(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm font-medium text-muted-foreground">Popis opravy</label>
            <textarea
              className="min-h-[120px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={repairDescription}
              onChange={(e) => setRepairDescription(e.target.value)}
            />
          </div>
        </div>

        {zakazka.completed_at && (
          <p className="mt-3 text-sm text-muted-foreground">
            Dokončeno: {formatDateTime(zakazka.completed_at)}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Ukládám…" : "Uložit"}
          </Button>
          <Button variant="secondary" onClick={handleSendEmail} disabled={sending || !zakazka.email}>
            {sending ? "Odesílám…" : "Odeslat email zákazníkovi"}
          </Button>
          <Button variant="outline" onClick={() => void handleDownloadZakazkovyList()} disabled={downloadingPdf}>
            {downloadingPdf ? "Stahuji PDF…" : "Stáhnout zakázkový list"}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/zakazkovy-list">Otevřít dokument</Link>
          </Button>
          {whatsappUrl && (
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              <Button variant="outline">Odkaz na WhatsApp</Button>
            </a>
          )}
        </div>
        {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}

        {zakazka.answers && Object.keys(zakazka.answers).length > 0 && (
          <div className="mt-8">
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Odpovědi na otázky</h3>
            <div className="space-y-1">
              {Object.entries(zakazka.answers).map(([k, v]) =>
                v ? (
                  <p key={k} className="text-sm">
                    <span className="text-muted-foreground">{k}:</span> {v}
                  </p>
                ) : null
              )}
            </div>
          </div>
        )}

        {zakazka.photos && zakazka.photos.length > 0 && (
          <div className="mt-8">
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">Fotky</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {zakazka.photos.map((filename) => (
                <a
                  key={filename}
                  href={uploadsUrl(filename)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative block aspect-square overflow-hidden rounded-lg border border-border bg-secondary"
                >
                  <img src={uploadsUrl(filename)} alt="" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
