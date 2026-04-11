"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AdminApiError,
  InvoiceSettingsPayload,
  InvoiceSettingsResponse,
  getInvoiceSettings,
  updateInvoiceSettings,
} from "@/lib/invoices";

type InvoiceSettingsFormState = {
  owner_email: string;
  payment_method: string;
  bank_account_number: string;
  bank_account_prefix: string;
  bank_code: string;
  bank_iban: string;
};

const initialState: InvoiceSettingsFormState = {
  owner_email: "",
  payment_method: "",
  bank_account_number: "",
  bank_account_prefix: "",
  bank_code: "",
  bank_iban: "",
};

function mapResponseToState(settings: InvoiceSettingsResponse): InvoiceSettingsFormState {
  return {
    owner_email: settings.owner_email,
    payment_method: settings.payment_method,
    bank_account_number: settings.bank_account_number,
    bank_account_prefix: settings.bank_account_prefix ?? "",
    bank_code: settings.bank_code,
    bank_iban: settings.bank_iban,
  };
}

export function InvoiceSettingsForm({
  onSaved,
}: {
  onSaved?: (settings: InvoiceSettingsResponse) => void | Promise<void>;
}) {
  const [form, setForm] = useState<InvoiceSettingsFormState>(initialState);
  const [accountLabel, setAccountLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadSettings = async () => {
    setLoading(true);
    setError("");
    try {
      const settings = await getInvoiceSettings();
      setForm(mapResponseToState(settings));
      setAccountLabel(settings.account_label);
    } catch (err) {
      if (err instanceof AdminApiError || err instanceof Error) {
        setError(err.message);
      } else {
        setError("Nastavení fakturace se nepodařilo načíst.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const updateField = <K extends keyof InvoiceSettingsFormState>(field: K, value: InvoiceSettingsFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload: InvoiceSettingsPayload = {
        owner_email: form.owner_email,
        payment_method: form.payment_method,
        bank_account_number: form.bank_account_number,
        bank_account_prefix: form.bank_account_prefix || null,
        bank_code: form.bank_code,
        bank_iban: form.bank_iban || null,
      };
      const saved = await updateInvoiceSettings(payload);
      setForm(mapResponseToState(saved));
      setAccountLabel(saved.account_label);
      setSuccess("Nastavení fakturace bylo uloženo.");
      if (onSaved) {
        await onSaved(saved);
      }
    } catch (err) {
      if (err instanceof AdminApiError || err instanceof Error) {
        setError(err.message);
      } else {
        setError("Nastavení fakturace se nepodařilo uložit.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Nastavení fakturace</h2>
          <p className="text-sm text-muted-foreground">
            Platební údaje a kopie e-mailu pro nové faktury. Staré faktury zůstávají beze změny.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-right text-sm">
          <p className="text-muted-foreground">Aktuální účet</p>
          <p className="font-medium text-foreground">{accountLabel || "Načítám…"}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Načítám nastavení fakturace…</p>
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="owner_email">E-mail majitele</Label>
              <Input
                id="owner_email"
                type="email"
                value={form.owner_email}
                onChange={(event) => updateField("owner_email", event.target.value)}
                placeholder="lakodi@seznam.cz"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_method">Způsob platby</Label>
              <Input
                id="payment_method"
                value={form.payment_method}
                onChange={(event) => updateField("payment_method", event.target.value)}
                placeholder="Převodem"
                required
              />
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              Uložený e-mail dostane skrytou kopii každé odeslané faktury z adminu.
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank_account_prefix">Předčíslí účtu</Label>
              <Input
                id="bank_account_prefix"
                value={form.bank_account_prefix}
                onChange={(event) => updateField("bank_account_prefix", event.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="Volitelné"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank_account_number">Číslo účtu</Label>
              <Input
                id="bank_account_number"
                value={form.bank_account_number}
                onChange={(event) => updateField("bank_account_number", event.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="5997826359"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank_code">Kód banky</Label>
              <Input
                id="bank_code"
                value={form.bank_code}
                onChange={(event) => updateField("bank_code", event.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="0800"
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2 xl:col-span-3">
              <Label htmlFor="bank_iban">IBAN</Label>
              <Input
                id="bank_iban"
                value={form.bank_iban}
                onChange={(event) => updateField("bank_iban", event.target.value.toUpperCase())}
                placeholder="Nechte prázdné pro automatický výpočet z českého účtu"
              />
              <p className="text-xs text-muted-foreground">
                Pokud IBAN nevyplníte, backend ho automaticky dopočítá z čísla účtu a kódu banky.
              </p>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Ukládám nastavení…" : "Uložit nastavení"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setError("");
                setSuccess("");
                void loadSettings();
              }}
            >
              Obnovit
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
