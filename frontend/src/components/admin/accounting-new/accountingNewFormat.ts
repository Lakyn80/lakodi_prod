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
  const key = normalizeAccountingNewLookupKey(value);
  const labels = t.statusLabels as Record<string, string>;
  if (labels[key]) {
    return labels[key];
  }

  const paymentLabels = t.paymentMethods as Record<string, string>;
  if (paymentLabels[key]) {
    return paymentLabels[key];
  }

  return t.common.noValue;
}

export function translateAccountingNewTodoType(t: AccountingNewTranslations, value: string): string {
  const labels = t.todoTypeLabels as Record<string, string>;
  return labels[normalizeAccountingNewLookupKey(value)] ?? value;
}

export function translateAccountingNewDocumentKind(t: AccountingNewTranslations, value: string): string {
  const labels = t.documentKinds as Record<string, string>;
  return labels[normalizeAccountingNewLookupKey(value)] ?? value;
}

export function translateAccountingNewAttachmentType(t: AccountingNewTranslations, value: string): string {
  const labels = t.attachmentTypes as Record<string, string>;
  return labels[normalizeAccountingNewLookupKey(value)] ?? value;
}

export function formatAccountingNewFileSize(bytes: number, language: Language, fallback: string): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return fallback;
  }

  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const formatted = new Intl.NumberFormat(getAccountingNewLocale(language), {
    maximumFractionDigits: exponent === 0 ? 0 : 1,
  }).format(value);

  return `${formatted} ${units[exponent]}`;
}

export function translateAccountingNewTransactionDirection(t: AccountingNewTranslations, value: string): string {
  const labels = t.transactionDirections as Record<string, string>;
  return labels[normalizeAccountingNewLookupKey(value)] ?? value;
}

export function translateAccountingNewEntityType(t: AccountingNewTranslations, value: string): string {
  const auditLabels = (t as AccountingNewTranslations & { auditEventTypes?: Record<string, string> }).auditEventTypes;
  const auditLabel = auditLabels?.[normalizeAccountingNewLookupKey(value)];
  if (auditLabel) {
    return auditLabel;
  }

  const labels = t.rag.entityTypes as Record<string, string>;
  return labels[normalizeAccountingNewLookupKey(value)] ?? value;
}

export function translateAccountingNewAuditEvent(t: AccountingNewTranslations, value: string): string {
  const labels = (t as AccountingNewTranslations & { auditEventTypes?: Record<string, string> }).auditEventTypes;
  if (!labels) {
    return translateAccountingNewEntityType(t, value);
  }

  return labels[normalizeAccountingNewLookupKey(value)] ?? translateAccountingNewEntityType(t, value);
}

export function translateAccountingNewAuditSource(t: AccountingNewTranslations, value: string): string {
  const normalized = normalizeAccountingNewLookupKey(value);
  if (!normalized || normalized === "admin_api") {
    const labels = (t as AccountingNewTranslations & { auditEventTypes?: Record<string, string> }).auditEventTypes;
    return labels?.admin_api ?? t.navigation.section;
  }

  return translateAccountingNewAuditEvent(t, value);
}

export function translateAccountingNewRecurringKind(t: AccountingNewTranslations, value: string): string {
  const labels = t.recurring.templateKinds as Record<string, string>;
  return labels[normalizeAccountingNewLookupKey(value)] ?? value;
}

export function translateAccountingNewRecurringFrequency(t: AccountingNewTranslations, value: string): string {
  const labels = t.recurring.frequencies as Record<string, string>;
  return labels[normalizeAccountingNewLookupKey(value)] ?? value;
}

export function translateAccountingNewBusinessMode(t: AccountingNewTranslations, value: string): string {
  const labels = t.documentWrite.businessModes as Record<string, string>;
  return labels[normalizeAccountingNewLookupKey(value)] ?? value;
}

export function translateAccountingNewTaxMode(t: AccountingNewTranslations, value: string): string {
  const labels = t.documentWrite.taxModes as Record<string, string>;
  return labels[normalizeAccountingNewLookupKey(value)] ?? value;
}

export { translateAccountingNewPaymentMethod } from "@/lib/accountingNewPaymentMethods";

const ACCOUNTING_NEW_ABORT_MESSAGE = "Načítání bylo přerušeno.";
const ACCOUNTING_NEW_LOGIN_MESSAGE = "Pro zobrazení účetnictví se prosím přihlaste.";
const ACCOUNTING_NEW_NOT_FOUND_MESSAGE = "Požadovaný záznam nebyl nalezen.";
const ACCOUNTING_NEW_NETWORK_MESSAGE = "Nepodařilo se načíst data kvůli síťové chybě.";
const ACCOUNTING_NEW_HTTP_MESSAGE_PATTERN = /^Nepodařilo se načíst data \(chyba (\d+)\)\.$|^Read-only načtení selhalo \((\d+)\)\.$/;
const ACCOUNTING_NEW_INVALID_ID_PATTERN = /musí být kladné číslo\.$/;
const ACCOUNTING_NEW_MUTATION_FAILED_PATTERN = /^(Write|Mutation|ARES).*selhal/i;
const ACCOUNTING_NEW_JSON_DETAIL_PATTERN = /^(\[|\{)|"type"\s*:\s*"/;
const ACCOUNTING_NEW_STATUS_CODE_IN_MESSAGE_PATTERN = /\b(4\d{2}|5\d{2})\b/;

function isLikelyUserFacingBackendMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || ACCOUNTING_NEW_JSON_DETAIL_PATTERN.test(trimmed)) {
    return false;
  }

  if (ACCOUNTING_NEW_MUTATION_FAILED_PATTERN.test(trimmed)) {
    return false;
  }

  if (trimmed.includes("Traceback") || trimmed.includes("Exception")) {
    return false;
  }

  return trimmed.length <= 240;
}

export function translateAccountingNewApiError(t: AccountingNewTranslations, error: AccountingNewApiError): string {
  if (error.message === "INVALID_MONEY") {
    return t.money.invalidFormat;
  }

  if (error.status === 422) {
    if (isLikelyUserFacingBackendMessage(error.message)) {
      return error.message;
    }

    return t.errors.validationFailed;
  }

  if (error.status === 400 && ACCOUNTING_NEW_INVALID_ID_PATTERN.test(error.message)) {
    return t.errors.invalidIdentifier;
  }

  if (error.status === 400) {
    if (isLikelyUserFacingBackendMessage(error.message)) {
      return error.message;
    }

    return t.errors.validationFailed;
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
      status: error.status ?? error.message.match(/\d+/)?.[0] ?? "",
    });
  }

  if (ACCOUNTING_NEW_STATUS_CODE_IN_MESSAGE_PATTERN.test(error.message) && !isLikelyUserFacingBackendMessage(error.message)) {
    return t.errors.actionFailed;
  }

  if (isLikelyUserFacingBackendMessage(error.message)) {
    return error.message;
  }

  return t.errors.actionFailed;
}
