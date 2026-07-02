import type { Translations } from "@/data/translations";
import type { Language } from "@/contexts/LanguageContext";

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
