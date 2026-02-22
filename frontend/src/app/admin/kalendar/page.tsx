"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { zakazkyUrl, apiFetchOptions } from "@/lib/api";
import { googleCalendarPlugin } from "@/lib/google-calendar-plugin";

interface Zakazka {
  id: number;
  name: string;
  category: string;
  status: string;
  created_at: string;
  answers?: Record<string, string>;
}

interface ReservationItem {
  id: number;
  name: string;
  repairType: string;
  startsAt: Date;
}

type CalendarViewMode = "year" | "month" | "week" | "day";

const ORDER_STATUSES = new Set(["potvrzená objednávka", "hotovo"]);
const HOURS = Array.from({ length: 12 }, (_, i) => i + 9);
const WEEKDAY_NAMES = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfWeek(value: Date) {
  const date = startOfDay(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function endOfWeek(value: Date) {
  const date = startOfWeek(value);
  date.setDate(date.getDate() + 6);
  return date;
}

function startOfMonth(value: Date) {
  const date = startOfDay(value);
  date.setDate(1);
  return date;
}

function endOfMonth(value: Date) {
  const date = startOfMonth(value);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  return date;
}

function addDays(value: Date, amount: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function addMonths(value: Date, amount: number) {
  const date = new Date(value);
  date.setMonth(date.getMonth() + amount);
  return date;
}

function addYears(value: Date, amount: number) {
  const date = new Date(value);
  date.setFullYear(date.getFullYear() + amount);
  return date;
}

function getWeekDays(base: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(base);
    date.setDate(base.getDate() + i);
    return date;
  });
}

function getDaysInRange(from: Date, to: Date) {
  const days: Date[] = [];
  const cursor = startOfDay(from);
  const end = startOfDay(to);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function parseReservationDate(z: Zakazka) {
  const preferredDate = z.answers?.preferred_date?.trim();
  const preferredTime = z.answers?.preferred_time?.trim() || "09:00";
  if (preferredDate) {
    const value = new Date(`${preferredDate}T${preferredTime}:00`);
    if (!Number.isNaN(value.getTime())) {
      return value;
    }
  }
  const fallback = new Date(z.created_at);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback;
  }
  return null;
}

function formatRepairType(category?: string) {
  const key = String(category ?? "").trim().toLowerCase();
  if (!key) return "Neuvedeno";
  const labels: Record<string, string> = {
    motor: "Motor",
    motory: "Motory",
    prevodovka: "Převodovka",
    "převodovka": "Převodovka",
    prevodovky: "Převodovky",
    "převodovky": "Převodovky",
    klima: "Klimatizace",
    klimatizace: "Klimatizace",
    diagnostika: "Diagnostika",
    brzdy: "Brzdy",
    elektro: "Autoelektrika",
    "autoelektrika-diagnostika": "Autoelektrika",
    "karoserie-lak": "Karoserie/Lak",
    pneuservis: "Pneuservis",
    geometrie: "Geometrie",
    kodovani: "Kódování",
    "renovace-veteranu": "Renovace veteránů",
    jine: "Jiné",
    "jiné": "Jiné",
  };
  return labels[key] ?? category ?? "Neuvedeno";
}

function formatDayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export default function AdminCalendarPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ReservationItem[]>([]);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [focusDate, setFocusDate] = useState(() => startOfDay(new Date()));
  const pluginStatus = googleCalendarPlugin.getStatus();

  useEffect(() => {
    fetch(zakazkyUrl(""), apiFetchOptions)
      .then((r) => {
        if (r.status === 401) {
          window.location.href = "/admin/login";
          return [];
        }
        return r.json();
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        const mapped = list
          .filter((z: Zakazka) => ORDER_STATUSES.has(z.status) || Boolean(z.answers?.preferred_date))
          .map((z: Zakazka) => {
            const startsAt = parseReservationDate(z);
                return startsAt
              ? {
                  id: z.id,
                  name: z.name,
                  repairType: formatRepairType(z.category),
                  startsAt,
                }
              : null;
          })
          .filter((item: ReservationItem | null): item is ReservationItem => Boolean(item));
        setItems(mapped);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const weekDays = useMemo(() => getWeekDays(startOfWeek(focusDate)), [focusDate]);
  const dayDate = useMemo(() => startOfDay(focusDate), [focusDate]);
  const monthBase = useMemo(() => startOfMonth(focusDate), [focusDate]);
  const monthDays = useMemo(() => {
    const from = startOfWeek(monthBase);
    const to = endOfWeek(endOfMonth(monthBase));
    return getDaysInRange(from, to);
  }, [monthBase]);

  const hourCells = useMemo(() => {
    const map = new Map<string, ReservationItem[]>();
    for (const item of items) {
      const key = `${formatDayKey(item.startsAt)}-${item.startsAt.getHours()}`;
      const row = map.get(key) ?? [];
      row.push(item);
      map.set(key, row);
    }
    for (const [key, row] of map.entries()) {
      map.set(
        key,
        [...row].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      );
    }
    return map;
  }, [items]);

  const dayCells = useMemo(() => {
    const map = new Map<string, ReservationItem[]>();
    for (const item of items) {
      const key = formatDayKey(item.startsAt);
      const row = map.get(key) ?? [];
      row.push(item);
      map.set(key, row);
    }
    for (const [key, row] of map.entries()) {
      map.set(
        key,
        [...row].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      );
    }
    return map;
  }, [items]);

  const yearMonths = useMemo(() => {
    const year = focusDate.getFullYear();
    return Array.from({ length: 12 }, (_, month) => {
      const monthItems = items
        .filter(
          (item) =>
            item.startsAt.getFullYear() === year && item.startsAt.getMonth() === month
        )
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      return { month, items: monthItems };
    });
  }, [items, focusDate]);

  const visibleTimeDays = viewMode === "day" ? [dayDate] : weekDays;
  const timeGridTemplateColumns = `90px repeat(${visibleTimeDays.length}, minmax(0, 1fr))`;

  const titleLabel = useMemo(() => {
    if (viewMode === "year") {
      return String(focusDate.getFullYear());
    }
    if (viewMode === "month") {
      return monthBase.toLocaleDateString("cs-CZ", {
        month: "long",
        year: "numeric",
      });
    }
    if (viewMode === "day") {
      return dayDate.toLocaleDateString("cs-CZ", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
    return `${weekDays[0].toLocaleDateString("cs-CZ")} - ${weekDays[6].toLocaleDateString("cs-CZ")}`;
  }, [viewMode, focusDate, monthBase, dayDate, weekDays]);

  const goPrev = () => {
    setFocusDate((current) => {
      if (viewMode === "year") return addYears(current, -1);
      if (viewMode === "month") return addMonths(current, -1);
      if (viewMode === "day") return addDays(current, -1);
      return addDays(current, -7);
    });
  };

  const goNext = () => {
    setFocusDate((current) => {
      if (viewMode === "year") return addYears(current, 1);
      if (viewMode === "month") return addMonths(current, 1);
      if (viewMode === "day") return addDays(current, 1);
      return addDays(current, 7);
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <p className="text-muted-foreground">Načítání kalendáře…</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Kalendář rezervací</h1>
          <p className="text-sm text-muted-foreground">{titleLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:border-primary/50"
          >
            Administrace
          </Link>
          <button
            type="button"
            onClick={goPrev}
            className="rounded-md border border-border bg-card p-2 text-foreground hover:border-primary/50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            className="rounded-md border border-border bg-card p-2 text-foreground hover:border-primary/50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <section className="mb-6 hidden rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-lg font-semibold text-foreground">Google Calendar modul</h2>
        <p className="text-sm text-muted-foreground">{pluginStatus.message}</p>
      </section>

      <section className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setViewMode("year")}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              viewMode === "year"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:border-primary/50"
            }`}
          >
            Rok
          </button>
          <button
            type="button"
            onClick={() => setViewMode("month")}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              viewMode === "month"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:border-primary/50"
            }`}
          >
            Měsíc
          </button>
          <button
            type="button"
            onClick={() => setViewMode("week")}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              viewMode === "week"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:border-primary/50"
            }`}
          >
            Týden
          </button>
          <button
            type="button"
            onClick={() => setViewMode("day")}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              viewMode === "day"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:border-primary/50"
            }`}
          >
            Den
          </button>
        </div>
      </section>

      {viewMode === "year" && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {yearMonths.map(({ month, items: monthItems }) => {
              const monthDate = new Date(focusDate.getFullYear(), month, 1);
              return (
                <article key={month} className="rounded-lg border border-border bg-background p-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFocusDate(monthDate);
                      setViewMode("month");
                    }}
                    className="text-left text-sm font-semibold text-foreground hover:text-primary"
                  >
                    {monthDate.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })}
                  </button>
                  <p className="mt-1 text-xs text-muted-foreground">Rezervace: {monthItems.length}</p>
                  <div className="mt-2 space-y-2">
                    {monthItems.slice(0, 3).map((entry) => (
                      <Link
                        key={entry.id}
                        href={`/admin/zakazky/${entry.id}?back=kalendar`}
                        className="block rounded-md border border-primary/30 bg-primary/10 p-2 text-xs text-foreground hover:border-primary/60"
                      >
                        <p className="font-semibold">Objednávka #{entry.id}</p>
                        <p className="text-muted-foreground">
                          {entry.startsAt.toLocaleDateString("cs-CZ")} {entry.startsAt.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <p className="text-muted-foreground">Typ: {entry.repairType}</p>
                      </Link>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {viewMode === "month" && (
        <section className="rounded-xl border border-border bg-card">
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAY_NAMES.map((name) => (
              <div key={name} className="border-r border-border p-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0">
                {name}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((day) => {
              const dayKey = formatDayKey(day);
              const entries = dayCells.get(dayKey) ?? [];
              const isCurrentMonth = day.getMonth() === monthBase.getMonth();
              return (
                <div key={dayKey} className="min-h-32 border-b border-r border-border p-2 last:border-r-0">
                  <button
                    type="button"
                    onClick={() => {
                      setFocusDate(day);
                      setViewMode("day");
                    }}
                    className={`text-sm font-semibold ${isCurrentMonth ? "text-foreground" : "text-muted-foreground/60"}`}
                  >
                    {day.getDate()}
                  </button>
                  <p className="mt-1 text-xs text-muted-foreground">Rezervace: {entries.length}</p>
                  <div className="mt-2 space-y-1">
                    {entries.slice(0, 2).map((entry) => (
                      <Link
                        key={entry.id}
                        href={`/admin/zakazky/${entry.id}?back=kalendar`}
                        className="block rounded-md border border-primary/30 bg-primary/10 p-1.5 text-[11px] text-foreground hover:border-primary/60"
                      >
                        #{entry.id} {entry.startsAt.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                        <p className="text-muted-foreground">Typ: {entry.repairType}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(viewMode === "week" || viewMode === "day") && (
        <section className="overflow-x-auto rounded-xl border border-border bg-card">
          <div className="min-w-[980px]">
            <div className="grid border-b border-border" style={{ gridTemplateColumns: timeGridTemplateColumns }}>
              <div className="border-r border-border p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Čas
              </div>
              {visibleTimeDays.map((day) => (
                <button
                  key={formatDayKey(day)}
                  type="button"
                  onClick={() => {
                    setFocusDate(day);
                    setViewMode("day");
                  }}
                  className="border-r border-border p-3 text-center last:border-r-0"
                >
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {day.toLocaleDateString("cs-CZ", { weekday: "short" })}
                  </p>
                  <p className="text-sm font-semibold text-foreground">{day.toLocaleDateString("cs-CZ")}</p>
                </button>
              ))}
            </div>

            {HOURS.map((hour) => (
              <div key={hour} className="grid border-b border-border last:border-b-0" style={{ gridTemplateColumns: timeGridTemplateColumns }}>
                <div className="border-r border-border p-3 text-sm text-muted-foreground">{`${hour}:00`}</div>
                {visibleTimeDays.map((day) => {
                  const key = `${formatDayKey(day)}-${hour}`;
                  const entries = hourCells.get(key) ?? [];
                  return (
                    <div key={key} className="min-h-24 border-r border-border p-2 last:border-r-0">
                      <div className="space-y-2">
                        {entries.map((entry) => (
                          <Link
                            key={entry.id}
                            href={`/admin/zakazky/${entry.id}?back=kalendar`}
                            className="block rounded-md border border-primary/30 bg-primary/10 p-2 text-xs text-foreground hover:border-primary/60"
                          >
                            <p className="font-semibold">Objednávka #{entry.id}</p>
                            <p className="text-muted-foreground">{entry.startsAt.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}</p>
                            <p className="text-muted-foreground">Typ: {entry.repairType}</p>
                            <p className="truncate text-muted-foreground">{entry.name}</p>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
