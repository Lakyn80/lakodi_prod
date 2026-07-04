import type { AccountingNewTranslations } from "@/components/admin/accounting-new/accountingNewFormat";

export const ACCOUNTING_NEW_PAYMENT_METHOD_IDS = ["bank_transfer", "cash", "card"] as const;

export type AccountingNewPaymentMethodId = (typeof ACCOUNTING_NEW_PAYMENT_METHOD_IDS)[number];

const BACKEND_PAYMENT_METHOD_VALUES: Record<AccountingNewPaymentMethodId, string> = {
  bank_transfer: "Převodem",
  cash: "Hotově",
  card: "Kartou",
};

const PAYMENT_METHOD_ALIASES: Record<string, AccountingNewPaymentMethodId> = {
  bank_transfer: "bank_transfer",
  banktransfer: "bank_transfer",
  transfer: "bank_transfer",
  převodem: "bank_transfer",
  prevodem: "bank_transfer",
  "bankovní převod": "bank_transfer",
  "bankovni prevod": "bank_transfer",
  hotově: "cash",
  hotove: "cash",
  cash: "cash",
  kartou: "card",
  card: "card",
};

export function normalizeAccountingNewPaymentMethodId(value: string | null | undefined): AccountingNewPaymentMethodId {
  const normalized = (value ?? "").trim().toLowerCase().replace(/[/\s-]+/g, "_");
  const compact = normalized.replace(/_/g, "");

  if (PAYMENT_METHOD_ALIASES[normalized]) {
    return PAYMENT_METHOD_ALIASES[normalized];
  }

  if (PAYMENT_METHOD_ALIASES[compact]) {
    return PAYMENT_METHOD_ALIASES[compact];
  }

  if (normalized.includes("hotov") || compact.includes("hotov")) {
    return "cash";
  }

  if (normalized.includes("kart") || compact.includes("kart")) {
    return "card";
  }

  if (normalized.includes("prevod") || normalized.includes("transfer") || normalized.includes("bank")) {
    return "bank_transfer";
  }

  return "bank_transfer";
}

export function paymentMethodIdToBackendValue(id: AccountingNewPaymentMethodId): string {
  return BACKEND_PAYMENT_METHOD_VALUES[id];
}

export function backendPaymentMethodToId(value: string | null | undefined): AccountingNewPaymentMethodId {
  return normalizeAccountingNewPaymentMethodId(value);
}

export function translateAccountingNewPaymentMethod(
  t: AccountingNewTranslations,
  value: string | null | undefined,
): string {
  if (!value?.trim()) {
    return t.common.noValue;
  }

  const id = normalizeAccountingNewPaymentMethodId(value);
  const labels = t.paymentMethods as Record<string, string>;
  return labels[id] ?? labels.bank_transfer;
}

export function resolveAccountingNewPaymentMethodForApi(value: string | null | undefined): string {
  return paymentMethodIdToBackendValue(normalizeAccountingNewPaymentMethodId(value));
}
