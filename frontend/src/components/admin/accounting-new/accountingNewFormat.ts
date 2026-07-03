import type { Translations } from "@/data/translations";
import type { Language } from "@/contexts/LanguageContext";
import type { AccountingNewApiError } from "@/types/accountingNew";

export type AccountingNewTranslations = Translations["accountingNew"];

const accountingNewLocaleMap: Record<Language, string> = {
  cs: "cs-CZ",
  ua: "uk-UA",
  ru: "ru-RU",
  en: "en-US",
};

export function getAccountingNewLocale(language: Language): string {
  return accountingNewLocaleMap[language];
}

export function formatAccountingNewTemplate(
  template: string,
  values: Record<string, number | string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

export function getAccountingNewTranslationValue(root: Record<string, unknown>, path: string): string {
  const value = path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, root);

  return typeof value === "string" ? value : path;
}

function formatAccountingNewDateInternal(
  value: string | null,
  language: Language,
  fallback: string,
  options: Intl.DateTimeFormatOptions,
): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(getAccountingNewLocale(language), options).format(date);
}

export function formatAccountingNewDate(value: string | null, language: Language, fallback: string): string {
  return formatAccountingNewDateInternal(value, language, fallback, { dateStyle: "medium" });
}

export function formatAccountingNewDateTime(value: string | null, language: Language, fallback: string): string {
  return formatAccountingNewDateInternal(value, language, fallback, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function normalizeAccountingNewLookupKey(value: string): string {
  return value.trim().toLowerCase().replace(/[/\s-]+/g, "_");
}

export function translateAccountingNewStatus(t: AccountingNewTranslations, value: string): string {
  const labels = t.statusLabels as Record<string, string>;
  return labels[normalizeAccountingNewLookupKey(value)] ?? value;
}

export function translateAccountingNewDocumentKind(t: AccountingNewTranslations, value: string): string {
  const labels = t.documentKinds as Record<string, string>;
  return labels[normalizeAccountingNewLookupKey(value)] ?? value;
}

export function translateAccountingNewTransactionDirection(t: AccountingNewTranslations, value: string): string {
  const labels = t.transactionDirections as Record<string, string>;
  return labels[normalizeAccountingNewLookupKey(value)] ?? value;
}

export function translateAccountingNewEntityType(t: AccountingNewTranslations, value: string): string {
  const labels = t.rag.entityTypes as Record<string, string>;
  return labels[normalizeAccountingNewLookupKey(value)] ?? value;
}

export function translateAccountingNewRecurringKind(t: AccountingNewTranslations, value: string): string {
  const labels = t.recurring.templateKinds as Record<string, string>;
  return labels[normalizeAccountingNewLookupKey(value)] ?? value;
}

export function translateAccountingNewRecurringFrequency(t: AccountingNewTranslations, value: string): string {
  const labels = t.recurring.frequencies as Record<string, string>;
  return labels[normalizeAccountingNewLookupKey(value)] ?? value;
}

const ACCOUNTING_NEW_ABORT_MESSAGE = "Načítání bylo přerušeno.";
const ACCOUNTING_NEW_LOGIN_MESSAGE = "Pro načtení read-only accounting části je nutné přihlášení do adminu.";
const ACCOUNTING_NEW_NOT_FOUND_MESSAGE = "Požadovaný accounting dokument nebyl nalezen.";
const ACCOUNTING_NEW_NETWORK_MESSAGE = "Read-only načtení selhalo kvůli síťové chybě.";
const ACCOUNTING_NEW_HTTP_MESSAGE_PATTERN = /^Read-only načtení selhalo \((\d+)\)\.$/;
const ACCOUNTING_NEW_INVALID_ID_PATTERN = /musí být kladné číslo\.$/;

export function translateAccountingNewApiError(t: AccountingNewTranslations, error: AccountingNewApiError): string {
  if (error.status === 400 && ACCOUNTING_NEW_INVALID_ID_PATTERN.test(error.message)) {
    return t.errors.invalidIdentifier;
  }

  if (error.status === 401 || error.message === ACCOUNTING_NEW_LOGIN_MESSAGE) {
    return t.errors.loginRequiredGeneric;
  }

  if (error.status === 404 || error.message === ACCOUNTING_NEW_NOT_FOUND_MESSAGE) {
    return t.errors.notFoundGeneric;
  }

  if (error.status === null && error.message === ACCOUNTING_NEW_ABORT_MESSAGE) {
    return t.errors.requestAborted;
  }

  if (error.status === null && error.message === ACCOUNTING_NEW_NETWORK_MESSAGE) {
    return t.errors.networkGeneric;
  }

  if (ACCOUNTING_NEW_HTTP_MESSAGE_PATTERN.test(error.message) && error.status !== null) {
    return formatAccountingNewTemplate(t.errors.httpGeneric, {
      status: error.status,
    });
  }

  return error.message;
}
