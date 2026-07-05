export const ACCOUNTING_NEW_CURRENCY_IDS = ["CZK", "EUR"] as const;

export type AccountingNewCurrencyId = (typeof ACCOUNTING_NEW_CURRENCY_IDS)[number];

export function normalizeAccountingNewCurrency(value: string | null | undefined): AccountingNewCurrencyId {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "EUR") {
    return "EUR";
  }

  return "CZK";
}
