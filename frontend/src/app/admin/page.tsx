"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { zakazkyUrl, apiFetchOptions } from "@/lib/api";

interface Zakazka {
  id: number;
  category: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  description?: string | null;
  repair_description?: string | null;
  status: string;
  estimated_price?: number | null;
  final_price?: number | null;
  answers?: Record<string, string>;
  photos?: string[];
  callback_requested?: boolean;
  completed_at?: string | null;
  created_at: string;
}

interface Stats {
  daily_revenue: number;
  monthly_revenue: number;
  yearly_revenue: number;
  completed_count: number;
}

const ORDER_STATUSES = new Set(["potvrzená objednávka", "hotovo"]);
const PAGE_SIZE = 20;
const TRI_ALL = "all";
const TRI_YES = "yes";
const TRI_NO = "no";

interface Filters {
  global: string;
  idFrom: string;
  idTo: string;
  name: string;
  category: string;
  status: string;
  email: string;
  phone: string;
  description: string;
  repairDescription: string;
  answersText: string;
  photoPath: string;
  estimatedPriceFrom: string;
  estimatedPriceTo: string;
  finalPriceFrom: string;
  finalPriceTo: string;
  callbackRequested: string;
  hasPhotos: string;
  hasAnswers: string;
  createdFrom: string;
  createdTo: string;
  completedFrom: string;
  completedTo: string;
}

const initialFilters: Filters = {
  global: "",
  idFrom: "",
  idTo: "",
  name: "",
  category: "",
  status: "",
  email: "",
  phone: "",
  description: "",
  repairDescription: "",
  answersText: "",
  photoPath: "",
  estimatedPriceFrom: "",
  estimatedPriceTo: "",
  finalPriceFrom: "",
  finalPriceTo: "",
  callbackRequested: TRI_ALL,
  hasPhotos: TRI_ALL,
  hasAnswers: TRI_ALL,
  createdFrom: "",
  createdTo: "",
  completedFrom: "",
  completedTo: "",
};

const formatCzk = (value: number) =>
  new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(value);

const contains = (value: string | null | undefined, query: string) => {
  if (!query.trim()) return true;
  return String(value ?? "")
    .toLowerCase()
    .includes(query.trim().toLowerCase());
};

const parseNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
};

const parseDateStart = (value: string) => {
  if (!value) return null;
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : null;
};

const parseDateEnd = (value: string) => {
  if (!value) return null;
  const time = new Date(`${value}T23:59:59.999`).getTime();
  return Number.isFinite(time) ? time : null;
};

const getDisplayOrderNumber = (z: Zakazka) => {
  const custom = String(z.answers?.admin_order_number ?? "").trim();
  return custom || String(z.id);
};

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage <= 1}
        className="rounded-md border border-border px-2 py-1 text-xs text-foreground disabled:opacity-40"
      >
        Předchozí
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
        <button
          key={page}
          type="button"
          onClick={() => onPageChange(page)}
          className={`rounded-md border px-2 py-1 text-xs ${
            page === currentPage
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-foreground"
          }`}
        >
          {page}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage >= totalPages}
        className="rounded-md border border-border px-2 py-1 text-xs text-foreground disabled:opacity-40"
      >
        Další
      </button>
    </div>
  );
}

export default function AdminPage() {
  const [zakazky, setZakazky] = useState<Zakazka[]>([]);
  const [stats, setStats] = useState<Stats>({
    daily_revenue: 0,
    monthly_revenue: 0,
    yearly_revenue: 0,
    completed_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [poptavkyPage, setPoptavkyPage] = useState(1);
  const [objednavkyPage, setObjednavkyPage] = useState(1);

  useEffect(() => {
    Promise.all([
      fetch(zakazkyUrl(""), apiFetchOptions).then((r) => {
        if (r.status === 401) {
          window.location.href = "/admin/login";
          return [];
        }
        return r.json();
      }),
      fetch(zakazkyUrl("/stats"), apiFetchOptions).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([listData, statsData]) => {
        setZakazky(Array.isArray(listData) ? listData : []);
        if (statsData) {
          setStats(statsData);
        }
      })
      .catch(() => {
        setZakazky([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setPoptavkyPage(1);
    setObjednavkyPage(1);
  }, [filters]);

  const categoryOptions = useMemo(
    () =>
      Array.from(new Set(zakazky.map((z) => z.category).filter((v) => String(v ?? "").trim())))
        .map(String)
        .sort((a, b) => a.localeCompare(b, "cs")),
    [zakazky]
  );

  const statusOptions = useMemo(
    () =>
      Array.from(new Set(zakazky.map((z) => z.status).filter((v) => String(v ?? "").trim())))
        .map(String)
        .sort((a, b) => a.localeCompare(b, "cs")),
    [zakazky]
  );

  const filteredZakazky = useMemo(() => {
    const idFrom = parseNumber(filters.idFrom);
    const idTo = parseNumber(filters.idTo);
    const estimatedFrom = parseNumber(filters.estimatedPriceFrom);
    const estimatedTo = parseNumber(filters.estimatedPriceTo);
    const finalFrom = parseNumber(filters.finalPriceFrom);
    const finalTo = parseNumber(filters.finalPriceTo);
    const createdFrom = parseDateStart(filters.createdFrom);
    const createdTo = parseDateEnd(filters.createdTo);
    const completedFrom = parseDateStart(filters.completedFrom);
    const completedTo = parseDateEnd(filters.completedTo);

    return zakazky.filter((z) => {
      const answersText = JSON.stringify(z.answers ?? {});
      const photos = Array.isArray(z.photos) ? z.photos : [];
      const photosText = photos.join(" ");
      const globalHaystack = [
        z.id,
        z.category,
        z.name,
        z.email,
        z.phone,
        z.description,
        z.repair_description,
        z.status,
        z.estimated_price,
        z.final_price,
        z.callback_requested,
        z.created_at,
        z.completed_at,
        answersText,
        photosText,
      ]
        .map((v) => String(v ?? ""))
        .join(" ");

      if (filters.global.trim() && !contains(globalHaystack, filters.global)) return false;
      if (idFrom !== null && z.id < idFrom) return false;
      if (idTo !== null && z.id > idTo) return false;
      if (!contains(z.name, filters.name)) return false;
      if (filters.category && z.category !== filters.category) return false;
      if (filters.status && z.status !== filters.status) return false;
      if (!contains(z.email, filters.email)) return false;
      if (!contains(z.phone, filters.phone)) return false;
      if (!contains(z.description, filters.description)) return false;
      if (!contains(z.repair_description, filters.repairDescription)) return false;
      if (!contains(answersText, filters.answersText)) return false;
      if (!contains(photosText, filters.photoPath)) return false;

      const estimated = z.estimated_price ?? null;
      if (estimatedFrom !== null && (estimated === null || estimated < estimatedFrom)) return false;
      if (estimatedTo !== null && (estimated === null || estimated > estimatedTo)) return false;

      const finalPrice = z.final_price ?? null;
      if (finalFrom !== null && (finalPrice === null || finalPrice < finalFrom)) return false;
      if (finalTo !== null && (finalPrice === null || finalPrice > finalTo)) return false;

      if (filters.callbackRequested === TRI_YES && !z.callback_requested) return false;
      if (filters.callbackRequested === TRI_NO && z.callback_requested) return false;

      const hasPhotos = photos.length > 0;
      if (filters.hasPhotos === TRI_YES && !hasPhotos) return false;
      if (filters.hasPhotos === TRI_NO && hasPhotos) return false;

      const hasAnswers = Object.keys(z.answers ?? {}).length > 0;
      if (filters.hasAnswers === TRI_YES && !hasAnswers) return false;
      if (filters.hasAnswers === TRI_NO && hasAnswers) return false;

      const createdAt = z.created_at ? new Date(z.created_at).getTime() : null;
      if (createdFrom !== null && (createdAt === null || createdAt < createdFrom)) return false;
      if (createdTo !== null && (createdAt === null || createdAt > createdTo)) return false;

      const completedAt = z.completed_at ? new Date(z.completed_at).getTime() : null;
      if (completedFrom !== null && (completedAt === null || completedAt < completedFrom)) return false;
      if (completedTo !== null && (completedAt === null || completedAt > completedTo)) return false;

      return true;
    });
  }, [zakazky, filters]);

  const objednavky = filteredZakazky.filter((z) => ORDER_STATUSES.has(z.status));
  const poptavky = filteredZakazky.filter((z) => !ORDER_STATUSES.has(z.status));

  const poptavkyTotalPages = Math.max(1, Math.ceil(poptavky.length / PAGE_SIZE));
  const objednavkyTotalPages = Math.max(1, Math.ceil(objednavky.length / PAGE_SIZE));
  const poptavkyCurrentPage = Math.min(poptavkyPage, poptavkyTotalPages);
  const objednavkyCurrentPage = Math.min(objednavkyPage, objednavkyTotalPages);

  const poptavkyStart = (poptavkyCurrentPage - 1) * PAGE_SIZE;
  const objednavkyStart = (objednavkyCurrentPage - 1) * PAGE_SIZE;
  const poptavkyPageItems = poptavky.slice(poptavkyStart, poptavkyStart + PAGE_SIZE);
  const objednavkyPageItems = objednavky.slice(objednavkyStart, objednavkyStart + PAGE_SIZE);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <p className="text-muted-foreground">Načítání…</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-foreground">Administrace</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/invoices"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:border-primary/50"
          >
            Fakturace
          </Link>
          <Link
            href="/admin/kalendar"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:border-primary/50"
          >
            Kalendář rezervací
          </Link>
        </div>
      </div>

      <section className="mb-6 rounded-xl border border-border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Statistiky</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">Denní obrat</p>
            <p className="text-lg font-semibold text-foreground">{formatCzk(stats.daily_revenue)}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">Měsíční obrat</p>
            <p className="text-lg font-semibold text-foreground">{formatCzk(stats.monthly_revenue)}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">Roční obrat</p>
            <p className="text-lg font-semibold text-foreground">{formatCzk(stats.yearly_revenue)}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">Dokončené zakázky</p>
            <p className="text-lg font-semibold text-foreground">{stats.completed_count}</p>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-xl border border-border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Detailní filtry</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Vyhledat ve všech polích"
            value={filters.global}
            onChange={(e) => setFilters((f) => ({ ...f, global: e.target.value }))}
          />
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Jméno"
            value={filters.name}
            onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
          />
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={filters.category}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
          >
            <option value="">Kategorie: všechny</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">Stav: všechny</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="ID od"
            value={filters.idFrom}
            onChange={(e) => setFilters((f) => ({ ...f, idFrom: e.target.value }))}
          />
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="ID do"
            value={filters.idTo}
            onChange={(e) => setFilters((f) => ({ ...f, idTo: e.target.value }))}
          />
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Email"
            value={filters.email}
            onChange={(e) => setFilters((f) => ({ ...f, email: e.target.value }))}
          />
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Telefon"
            value={filters.phone}
            onChange={(e) => setFilters((f) => ({ ...f, phone: e.target.value }))}
          />

          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Popis závady"
            value={filters.description}
            onChange={(e) => setFilters((f) => ({ ...f, description: e.target.value }))}
          />
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Popis opravy"
            value={filters.repairDescription}
            onChange={(e) => setFilters((f) => ({ ...f, repairDescription: e.target.value }))}
          />
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Odpovědi obsahují"
            value={filters.answersText}
            onChange={(e) => setFilters((f) => ({ ...f, answersText: e.target.value }))}
          />
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Cesta k fotce obsahuje"
            value={filters.photoPath}
            onChange={(e) => setFilters((f) => ({ ...f, photoPath: e.target.value }))}
          />

          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Předběžná cena od"
            value={filters.estimatedPriceFrom}
            onChange={(e) => setFilters((f) => ({ ...f, estimatedPriceFrom: e.target.value }))}
          />
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Předběžná cena do"
            value={filters.estimatedPriceTo}
            onChange={(e) => setFilters((f) => ({ ...f, estimatedPriceTo: e.target.value }))}
          />
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Konečná cena od"
            value={filters.finalPriceFrom}
            onChange={(e) => setFilters((f) => ({ ...f, finalPriceFrom: e.target.value }))}
          />
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Konečná cena do"
            value={filters.finalPriceTo}
            onChange={(e) => setFilters((f) => ({ ...f, finalPriceTo: e.target.value }))}
          />

          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={filters.callbackRequested}
            onChange={(e) => setFilters((f) => ({ ...f, callbackRequested: e.target.value }))}
          >
            <option value={TRI_ALL}>Zpětné volání: vše</option>
            <option value={TRI_YES}>Zpětné volání: ano</option>
            <option value={TRI_NO}>Zpětné volání: ne</option>
          </select>
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={filters.hasPhotos}
            onChange={(e) => setFilters((f) => ({ ...f, hasPhotos: e.target.value }))}
          >
            <option value={TRI_ALL}>Fotky: vše</option>
            <option value={TRI_YES}>Fotky: má</option>
            <option value={TRI_NO}>Fotky: nemá</option>
          </select>
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={filters.hasAnswers}
            onChange={(e) => setFilters((f) => ({ ...f, hasAnswers: e.target.value }))}
          >
            <option value={TRI_ALL}>Odpovědi: vše</option>
            <option value={TRI_YES}>Odpovědi: má</option>
            <option value={TRI_NO}>Odpovědi: nemá</option>
          </select>
          <button
            type="button"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
            onClick={() => setFilters(initialFilters)}
          >
            Vymazat filtry
          </button>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Vytvořeno od
            <input
              type="date"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              value={filters.createdFrom}
              onChange={(e) => setFilters((f) => ({ ...f, createdFrom: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Vytvořeno do
            <input
              type="date"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              value={filters.createdTo}
              onChange={(e) => setFilters((f) => ({ ...f, createdTo: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Dokončeno od
            <input
              type="date"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              value={filters.completedFrom}
              onChange={(e) => setFilters((f) => ({ ...f, completedFrom: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Dokončeno do
            <input
              type="date"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              value={filters.completedTo}
              onChange={(e) => setFilters((f) => ({ ...f, completedTo: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-xl font-semibold text-foreground">Poptávky</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Celkem: {poptavky.length} | Strana {poptavkyCurrentPage}/{poptavkyTotalPages} | Na stránce max {PAGE_SIZE}
          </p>
          <div className="space-y-3">
            {poptavky.length === 0 ? (
              <p className="text-sm text-muted-foreground">Žádné poptávky.</p>
            ) : (
              poptavkyPageItems.map((z) => (
                <Link
                  key={z.id}
                  href={`/admin/zakazky/${z.id}`}
                  className="block rounded-lg border border-border bg-background p-3 hover:border-primary/50"
                >
                  <p className="font-medium text-foreground">{z.name}</p>
                  <p className="text-sm text-muted-foreground">{z.category}</p>
                  <p className="text-xs text-muted-foreground">Číslo objednávky: {getDisplayOrderNumber(z)}</p>
                  <p className="text-xs text-muted-foreground">Stav: {z.status}</p>
                </Link>
              ))
            )}
          </div>
          <Pagination currentPage={poptavkyCurrentPage} totalPages={poptavkyTotalPages} onPageChange={setPoptavkyPage} />
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-xl font-semibold text-foreground">Objednávky</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Celkem: {objednavky.length} | Strana {objednavkyCurrentPage}/{objednavkyTotalPages} | Na stránce max {PAGE_SIZE}
          </p>
          <div className="space-y-3">
            {objednavky.length === 0 ? (
              <p className="text-sm text-muted-foreground">Žádné objednávky.</p>
            ) : (
              objednavkyPageItems.map((z) => (
                <Link
                  key={z.id}
                  href={`/admin/zakazky/${z.id}`}
                  className="block rounded-lg border border-border bg-background p-3 hover:border-primary/50"
                >
                  <p className="font-medium text-foreground">{z.name}</p>
                  <p className="text-sm text-muted-foreground">{z.category}</p>
                  <p className="text-xs text-muted-foreground">Číslo objednávky: {getDisplayOrderNumber(z)}</p>
                  <p className="text-xs text-muted-foreground">Stav: {z.status}</p>
                </Link>
              ))
            )}
          </div>
          <Pagination currentPage={objednavkyCurrentPage} totalPages={objednavkyTotalPages} onPageChange={setObjednavkyPage} />
        </section>
      </div>
    </div>
  );
}
