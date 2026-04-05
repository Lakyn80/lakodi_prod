"use client";

import { FormEvent, KeyboardEvent, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AdminApiError,
  AresCompanyLookup,
  BusinessMode,
  InvoiceCreatePayload,
  InvoiceDetail,
  TaxMode,
  createInvoice,
  formatAresSource,
  formatInvoiceMoney,
  lookupAresCompany,
  searchAresCompanies,
} from "@/lib/invoices";

type DraftItem = {
  description: string;
  quantity: string;
  unit_price: string;
};

type InvoiceFormState = {
  issue_date: string;
  due_date: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  customer_ico: string;
  customer_dic: string;
  note: string;
  business_mode: BusinessMode;
  tax_mode: TaxMode;
  currency: string;
  vat_rate: string;
  items: DraftItem[];
};

const MIN_ARES_SEARCH_LENGTH = 2;

const initialItem = (): DraftItem => ({
  description: "",
  quantity: "1",
  unit_price: "0",
});

const todayIso = () => new Date().toISOString().slice(0, 10);

const dueDateIso = () => {
  const base = new Date();
  base.setDate(base.getDate() + 14);
  return base.toISOString().slice(0, 10);
};

const initialState = (): InvoiceFormState => ({
  issue_date: todayIso(),
  due_date: dueDateIso(),
  customer_name: "",
  customer_email: "",
  customer_phone: "",
  customer_address: "",
  customer_ico: "",
  customer_dic: "",
  note: "",
  business_mode: "autoservice",
  tax_mode: "standard",
  currency: "CZK",
  vat_rate: "21",
  items: [initialItem()],
});

function buildAresAddress(addressLine: string, zip: string, city: string, country: string) {
  const line = [addressLine, [zip, city].filter(Boolean).join(" "), country].filter(Boolean);
  return line.join(", ");
}

function getAresResultLabel(company: AresCompanyLookup) {
  return `${company.company_name} • IČO ${company.ico}`;
}

export function InvoiceForm({
  onCreated,
}: {
  onCreated: (invoice: InvoiceDetail) => void | Promise<void>;
}) {
  const [form, setForm] = useState<InvoiceFormState>(() => initialState());
  const [submitting, setSubmitting] = useState(false);
  const [aresLoading, setAresLoading] = useState(false);
  const [companySearchLoading, setCompanySearchLoading] = useState(false);
  const [companySearchName, setCompanySearchName] = useState("");
  const [companySearchResults, setCompanySearchResults] = useState<AresCompanyLookup[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [aresMessage, setAresMessage] = useState("");
  const [companySearchMessage, setCompanySearchMessage] = useState("");

  const preview = useMemo(() => {
    const subtotal = form.items.reduce((sum, item) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unit_price || 0);
      if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return sum;
      return sum + quantity * unitPrice;
    }, 0);

    if (form.tax_mode === "reverse_charge") {
      return {
        subtotal,
        vatAmount: 0,
        total: subtotal,
      };
    }

    const vatRate = Number(form.vat_rate || 0);
    const vatAmount = subtotal * (vatRate / 100);
    return {
      subtotal,
      vatAmount,
      total: subtotal + vatAmount,
    };
  }, [form.items, form.tax_mode, form.vat_rate]);

  const updateField = <K extends keyof InvoiceFormState>(field: K, value: InvoiceFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateItem = (index: number, field: keyof DraftItem, value: string) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const addItem = () => {
    setForm((current) => ({ ...current, items: [...current.items, initialItem()] }));
  };

  const removeItem = (index: number) => {
    setForm((current) => {
      if (current.items.length <= 1) return current;
      return {
        ...current,
        items: current.items.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  };

  const applyAresCompany = (company: AresCompanyLookup) => {
    setForm((current) => ({
      ...current,
      customer_ico: company.ico,
      customer_name: company.company_name,
      customer_address: buildAresAddress(company.address_line, company.zip, company.city, company.country),
      customer_dic: company.dic ?? current.customer_dic,
    }));
    setCompanySearchName(company.company_name);
    setCompanySearchResults([]);
    setCompanySearchMessage(`Údaje byly převzaty ze zdroje ${formatAresSource(company.source)}.`);
  };

  const handleAresLookup = async () => {
    setAresMessage("");
    setError("");
    const ico = form.customer_ico.trim();
    if (!ico) {
      setAresMessage("Nejdřív zadejte IČO firmy.");
      return;
    }

    setAresLoading(true);
    try {
      const company = await lookupAresCompany(ico);
      applyAresCompany(company);
      setAresMessage(`Firma byla načtena ze zdroje ${formatAresSource(company.source)}.`);
    } catch (err) {
      setAresMessage(err instanceof Error ? err.message : "Údaje z ARES se nepodařilo načíst.");
    } finally {
      setAresLoading(false);
    }
  };

  const handleCompanySearch = async () => {
    setCompanySearchMessage("");
    setError("");
    const query = companySearchName.trim();
    if (!query) {
      setCompanySearchMessage("Zadejte název firmy.");
      return;
    }
    if (query.length < MIN_ARES_SEARCH_LENGTH) {
      setCompanySearchMessage(`Zadejte alespoň ${MIN_ARES_SEARCH_LENGTH} znaky názvu firmy.`);
      return;
    }

    setCompanySearchLoading(true);
    try {
      const results = await searchAresCompanies(query);
      setCompanySearchResults(results);
      if (results.length === 0) {
        setCompanySearchMessage("Pro zadaný název nebyla nalezena žádná firma.");
      } else {
        const sourceLabel = formatAresSource(results[0].source);
        setCompanySearchMessage(`Nalezeno ${results.length} firem. Zdroj: ${sourceLabel}.`);
      }
    } catch (err) {
      setCompanySearchResults([]);
      setCompanySearchMessage(err instanceof Error ? err.message : "Vyhledání v ARES selhalo.");
    } finally {
      setCompanySearchLoading(false);
    }
  };

  const handleSearchInputKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    action: () => Promise<void> | void,
  ) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    void action();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (form.items.length === 0) {
      setError("Faktura musí obsahovat alespoň jednu položku.");
      return;
    }

    const payload: InvoiceCreatePayload = {
      issue_date: form.issue_date,
      due_date: form.due_date,
      customer_name: form.customer_name,
      customer_email: form.customer_email,
      customer_phone: form.customer_phone || null,
      customer_address: form.customer_address || null,
      customer_ico: form.customer_ico || null,
      customer_dic: form.customer_dic || null,
      note: form.note || null,
      business_mode: form.business_mode,
      tax_mode: form.tax_mode,
      currency: form.currency.trim().toUpperCase(),
      vat_rate: form.vat_rate.trim() ? Number(form.vat_rate) : null,
      items: form.items.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
      })),
    };

    setSubmitting(true);
    try {
      const created = await createInvoice(payload);
      await onCreated(created);
      setSuccess(`Faktura ${created.invoice_number} byla úspěšně vytvořena.`);
      setForm((current) => ({
        ...current,
        note: "",
        items: [initialItem()],
      }));
      setCompanySearchResults([]);
    } catch (err) {
      if (err instanceof AdminApiError || err instanceof Error) {
        setError(err.message);
      } else {
        setError("Fakturu se nepodařilo vytvořit.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Nová faktura</h2>
          <p className="text-sm text-muted-foreground">
            Vystavení servisní nebo stavební faktury včetně předvyplnění z registru ARES.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-right text-sm">
          <p className="text-muted-foreground">Průběžný součet</p>
          <p className="font-medium text-foreground">{formatInvoiceMoney(preview.total, form.currency || "CZK")}</p>
        </div>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="issue_date">Datum vystavení</Label>
            <Input
              id="issue_date"
              type="date"
              value={form.issue_date}
              onChange={(event) => updateField("issue_date", event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="due_date">Datum splatnosti</Label>
            <Input
              id="due_date"
              type="date"
              value={form.due_date}
              onChange={(event) => updateField("due_date", event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="business_mode">Typ zakázky</Label>
            <select
              id="business_mode"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.business_mode}
              onChange={(event) => updateField("business_mode", event.target.value as BusinessMode)}
            >
              <option value="autoservice">Autoservis</option>
              <option value="construction">Stavební práce</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tax_mode">Režim DPH</Label>
            <select
              id="tax_mode"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.tax_mode}
              onChange={(event) => updateField("tax_mode", event.target.value as TaxMode)}
            >
              <option value="standard">Běžný režim DPH</option>
              <option value="reverse_charge">Přenesená daňová povinnost</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Měna</Label>
            <Input
              id="currency"
              value={form.currency}
              onChange={(event) => updateField("currency", event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vat_rate">Sazba DPH v %</Label>
            <Input
              id="vat_rate"
              type="number"
              step="0.01"
              value={form.vat_rate}
              onChange={(event) => updateField("vat_rate", event.target.value)}
              placeholder={form.tax_mode === "reverse_charge" ? "volitelné" : "např. 21"}
            />
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground md:col-span-2">
            {form.tax_mode === "reverse_charge"
              ? "Přenesená daňová povinnost je povolená jen pro stavební práce."
              : "Běžný režim DPH dopočítá DPH z mezisoučtu všech položek."}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2 xl:col-span-2">
            <Label htmlFor="customer_name">Odběratel</Label>
            <Input
              id="customer_name"
              value={form.customer_name}
              onChange={(event) => updateField("customer_name", event.target.value)}
              placeholder="Název firmy nebo jméno odběratele"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer_email">E-mail odběratele</Label>
            <Input
              id="customer_email"
              type="email"
              value={form.customer_email}
              onChange={(event) => updateField("customer_email", event.target.value)}
              placeholder="ucetni@firma.cz"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer_phone">Telefon</Label>
            <Input
              id="customer_phone"
              value={form.customer_phone}
              onChange={(event) => updateField("customer_phone", event.target.value)}
              placeholder="+420 123 456 789"
            />
          </div>
          <div className="space-y-2 xl:col-span-2">
            <Label htmlFor="company_search_name">Vyhledání firmy podle názvu</Label>
            <div className="flex gap-2">
              <Input
                id="company_search_name"
                value={companySearchName}
                onChange={(event) => setCompanySearchName(event.target.value)}
                onKeyDown={(event) => handleSearchInputKeyDown(event, handleCompanySearch)}
                placeholder="Zadejte část názvu firmy"
              />
              <Button type="button" variant="secondary" onClick={handleCompanySearch} disabled={companySearchLoading}>
                <Search className="h-4 w-4" />
                {companySearchLoading ? "Vyhledávám…" : "Vyhledat"}
              </Button>
            </div>
            {companySearchMessage && <p className="text-xs text-muted-foreground">{companySearchMessage}</p>}
            {companySearchResults.length > 0 && (
              <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                {companySearchResults.map((company) => (
                  <button
                    key={`${company.ico}-${company.company_name}`}
                    type="button"
                    className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:border-primary/50"
                    onClick={() => applyAresCompany(company)}
                  >
                    <p className="font-medium text-foreground">{getAresResultLabel(company)}</p>
                    <p className="text-muted-foreground">
                      {buildAresAddress(company.address_line, company.zip, company.city, company.country)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Zdroj: {formatAresSource(company.source)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer_ico">IČO</Label>
            <div className="flex gap-2">
              <Input
                id="customer_ico"
                value={form.customer_ico}
                onChange={(event) => updateField("customer_ico", event.target.value)}
                onKeyDown={(event) => handleSearchInputKeyDown(event, handleAresLookup)}
                placeholder="Např. 09695982"
              />
              <Button type="button" variant="secondary" onClick={handleAresLookup} disabled={aresLoading}>
                <Search className="h-4 w-4" />
                {aresLoading ? "Načítám…" : "Načíst z ARES"}
              </Button>
            </div>
            {aresMessage && <p className="text-xs text-muted-foreground">{aresMessage}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer_dic">DIČ</Label>
            <Input
              id="customer_dic"
              value={form.customer_dic}
              onChange={(event) => updateField("customer_dic", event.target.value)}
              placeholder="Např. CZ09695982"
            />
          </div>
          <div className="space-y-2 md:col-span-2 xl:col-span-2">
            <Label htmlFor="customer_address">Adresa</Label>
            <Input
              id="customer_address"
              value={form.customer_address}
              onChange={(event) => updateField("customer_address", event.target.value)}
              placeholder="Ulice, PSČ, město"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-foreground">Položky faktury</h3>
              <p className="text-sm text-muted-foreground">Částky se přepočítávají automaticky podle položek.</p>
            </div>
            <Button type="button" variant="outline" onClick={addItem}>
              <Plus className="h-4 w-4" />
              Přidat položku
            </Button>
          </div>
          <div className="space-y-3">
            {form.items.map((item, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-lg border border-border bg-background p-3 md:grid-cols-[1.8fr_0.6fr_0.8fr_auto]"
              >
                <div className="space-y-2">
                  <Label htmlFor={`item_description_${index}`}>Popis položky</Label>
                  <Input
                    id={`item_description_${index}`}
                    value={item.description}
                    onChange={(event) => updateItem(index, "description", event.target.value)}
                    placeholder="Např. diagnostika převodovky"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`item_quantity_${index}`}>Množství</Label>
                  <Input
                    id={`item_quantity_${index}`}
                    type="number"
                    min="0"
                    step="0.001"
                    value={item.quantity}
                    onChange={(event) => updateItem(index, "quantity", event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`item_unit_price_${index}`}>Jednotková cena</Label>
                  <Input
                    id={`item_unit_price_${index}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_price}
                    onChange={(event) => updateItem(index, "unit_price", event.target.value)}
                    required
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => removeItem(index)}
                    disabled={form.items.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                    Odebrat
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="note">Poznámka</Label>
          <Textarea
            id="note"
            value={form.note}
            onChange={(event) => updateField("note", event.target.value)}
            placeholder="Volitelná poznámka, která se objeví na faktuře"
          />
        </div>

        <div className="grid gap-3 rounded-lg border border-border bg-background p-4 md:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Mezisoučet</p>
            <p className="font-medium text-foreground">{formatInvoiceMoney(preview.subtotal, form.currency || "CZK")}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">DPH</p>
            <p className="font-medium text-foreground">{formatInvoiceMoney(preview.vatAmount, form.currency || "CZK")}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Celkem</p>
            <p className="font-medium text-foreground">{formatInvoiceMoney(preview.total, form.currency || "CZK")}</p>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Vystavuji fakturu…" : "Vystavit fakturu"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setForm(initialState());
              setCompanySearchName("");
              setCompanySearchResults([]);
              setError("");
              setSuccess("");
              setAresMessage("");
              setCompanySearchMessage("");
            }}
          >
            Vyčistit formulář
          </Button>
        </div>
      </form>
    </section>
  );
}
