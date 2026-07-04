/**
 * Canonical money model for new accounting UI.
 * - Internal representation: integer minor units (e.g. 92555 = 925.55 CZK)
 * - Backend API boundary: decimal number (925.55) via minorUnitsToApiDecimal()
 */

const DEFAULT_DECIMAL_PLACES = 2;

export type AccountingNewMoneyParseResult =
  | { ok: true; minorUnits: number; currency: string }
  | { ok: false; reason: "empty" | "invalid" };

export function getAccountingNewMoneyDecimalPlaces(_currency: string): number {
  return DEFAULT_DECIMAL_PLACES;
}

export function parseAccountingNewMoneyInput(value: string, currency = "CZK"): AccountingNewMoneyParseResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty" };
  }

  const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return { ok: false, reason: "invalid" };
  }

  const [wholePart, fractionPart = ""] = normalized.split(".");
  const whole = Number(wholePart);
  if (!Number.isFinite(whole) || whole < 0) {
    return { ok: false, reason: "invalid" };
  }

  const fraction = fractionPart.padEnd(DEFAULT_DECIMAL_PLACES, "0").slice(0, DEFAULT_DECIMAL_PLACES);
  const minorUnits = whole * 10 ** DEFAULT_DECIMAL_PLACES + Number(fraction || "0");

  if (!Number.isFinite(minorUnits) || minorUnits < 0) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, minorUnits, currency: currency.trim().toUpperCase() || "CZK" };
}

export function minorUnitsToApiDecimal(minorUnits: number): number {
  return Math.round(minorUnits) / 10 ** DEFAULT_DECIMAL_PLACES;
}

export function apiDecimalToMinorUnits(amount: number): number {
  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.round(amount * 10 ** DEFAULT_DECIMAL_PLACES);
}

export function formatAccountingNewMoneyInputFromMinorUnits(
  minorUnits: number,
  locale = "cs-CZ",
): string {
  const major = minorUnitsToApiDecimal(minorUnits);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: DEFAULT_DECIMAL_PLACES,
  }).format(major);
}

export function formatAccountingNewMoneyInputFromApiDecimal(amount: number, locale = "cs-CZ"): string {
  return formatAccountingNewMoneyInputFromMinorUnits(apiDecimalToMinorUnits(amount), locale);
}

export function parseAccountingNewMoneyInputToApiDecimal(value: string, currency = "CZK"): AccountingNewMoneyParseResult & { apiDecimal?: number } {
  const parsed = parseAccountingNewMoneyInput(value, currency);
  if (!parsed.ok) {
    return parsed;
  }

  return {
    ...parsed,
    apiDecimal: minorUnitsToApiDecimal(parsed.minorUnits),
  };
}
