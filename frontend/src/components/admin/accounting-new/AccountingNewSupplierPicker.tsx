"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import { formatAccountingNewTemplate } from "@/components/admin/accounting-new/accountingNewFormat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import { normalizeAccountingNewIco } from "@/lib/accountingNewCustomerPersistence";
import type { AccountingNewSupplierSummary } from "@/types/accountingNew";

const MAX_PICKER_RESULTS = 20;

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase();
}

function matchesSupplier(supplier: AccountingNewSupplierSummary, query: string): boolean {
  if (!query) {
    return false;
  }

  const haystack = [
    supplier.name,
    supplier.email,
    supplier.phone,
    supplier.ico,
    supplier.dic,
    supplier.country,
  ]
    .map((value) => (value ?? "").toLowerCase())
    .join(" ");

  return haystack.includes(query);
}

export function AccountingNewSupplierPicker({
  suppliers,
  selectedSupplierId,
  onSelect,
  onClear,
}: {
  suppliers: AccountingNewSupplierSummary[];
  selectedSupplierId: string;
  onSelect: (supplier: AccountingNewSupplierSummary) => void;
  onClear: () => void;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => String(supplier.id) === selectedSupplierId) ?? null,
    [selectedSupplierId, suppliers],
  );

  const normalizedQuery = normalizeQuery(deferredQuery);
  const filteredSuppliers = useMemo(() => {
    if (!open) {
      return [];
    }

    if (!normalizedQuery) {
      return suppliers.slice(0, MAX_PICKER_RESULTS);
    }

    return suppliers.filter((supplier) => matchesSupplier(supplier, normalizedQuery)).slice(0, MAX_PICKER_RESULTS);
  }, [normalizedQuery, open, suppliers]);

  const showLimitedNotice = open && suppliers.length > MAX_PICKER_RESULTS;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor="supplierPickerSearch">{t.supplierPersistence.searchSuppliers}</Label>
          <p className="text-sm text-muted-foreground">{t.supplierPersistence.pickerDescription}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((current) => !current)}>
          {open ? t.supplierPersistence.hideSuppliers : t.supplierPersistence.showSuppliers}
        </Button>
      </div>

      {selectedSupplier ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="font-medium text-foreground">{selectedSupplier.name}</p>
          <p className="text-muted-foreground">
            {selectedSupplier.ico ? `IČO ${normalizeAccountingNewIco(selectedSupplier.ico)}` : null}
            {selectedSupplier.ico && selectedSupplier.email ? " · " : null}
            {selectedSupplier.email}
          </p>
          {selectedSupplier.address ? <p className="text-muted-foreground">{selectedSupplier.address}</p> : null}
          <Button type="button" variant="link" className="h-auto p-0" onClick={onClear}>
            {t.supplierPersistence.clearSupplierLink}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t.expenseWrite.fields.supplierNone}</p>
      )}

      {open ? (
        <div className="space-y-3">
          <Input
            id="supplierPickerSearch"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.suppliers.searchPlaceholder}
            aria-label={t.suppliers.searchLabel}
          />

          {showLimitedNotice ? (
            <p className="text-xs text-muted-foreground">{t.supplierPersistence.limitedResultsShown}</p>
          ) : null}

          {filteredSuppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.supplierPersistence.noSuppliersFound}</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {filteredSuppliers.map((supplier) => (
                <button
                  key={supplier.id}
                  type="button"
                  className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:border-primary/50"
                  onClick={() => {
                    onSelect(supplier);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <p className="font-medium text-foreground">{supplier.name}</p>
                  <p className="text-muted-foreground">
                    {[supplier.ico, supplier.dic, supplier.email].filter(Boolean).join(" · ")}
                  </p>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{formatAccountingNewTemplate(t.suppliers.shownCount, { count: suppliers.length })}</span>
            <Link
              href={`${ACCOUNTING_NEW_ROUTE}/dodavatele/novy`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {t.supplierWrite.actions.createSupplier}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
