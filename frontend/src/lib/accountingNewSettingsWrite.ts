import type {
  AccountingNewSettings,
  AccountingNewSettingsFormState,
  AccountingNewSettingsWritePayload,
} from "@/types/accountingNew";
import { normalizeAccountingNewCurrency } from "@/lib/accountingNewCurrencies";

export function createEmptyAccountingNewSettingsFormState(): AccountingNewSettingsFormState {
  return {
    ownerEmail: "",
    issuerName: "",
    issuerAddress: "",
    issuerCity: "",
    issuerZip: "",
    issuerIco: "",
    issuerDic: "",
    issuerDataBox: "",
    issuerEmail: "",
    issuerPhone: "",
    defaultCurrency: "CZK",
    defaultDueDays: "14",
    defaultNote: "",
    paymentMethod: "Převodem",
    bankAccountNumber: "",
    bankAccountPrefix: "",
    bankCode: "",
    bankIban: "",
  };
}

export function buildAccountingNewSettingsFormStateFromSettings(
  settings: AccountingNewSettings,
): AccountingNewSettingsFormState {
  return {
    ownerEmail: settings.ownerEmail,
    issuerName: settings.issuerName,
    issuerAddress: settings.issuerAddress,
    issuerCity: settings.issuerCity,
    issuerZip: settings.issuerZip,
    issuerIco: settings.issuerIco,
    issuerDic: settings.issuerDic,
    issuerDataBox: settings.issuerDataBox ?? "",
    issuerEmail: settings.issuerEmail ?? "",
    issuerPhone: settings.issuerPhone ?? "",
    defaultCurrency: normalizeAccountingNewCurrency(settings.defaultCurrency),
    defaultDueDays: String(settings.defaultDueDays),
    defaultNote: settings.defaultNote ?? "",
    paymentMethod: settings.paymentMethod,
    bankAccountNumber: settings.bankAccountNumber,
    bankAccountPrefix: settings.bankAccountPrefix ?? "",
    bankCode: settings.bankCode,
    bankIban: settings.bankIban,
  };
}

export function buildAccountingNewSettingsWritePayloadFromForm(
  form: AccountingNewSettingsFormState,
): AccountingNewSettingsWritePayload {
  const dueDays = Number.parseInt(form.defaultDueDays.trim(), 10);

  return {
    owner_email: form.ownerEmail.trim(),
    issuer_name: form.issuerName.trim() || null,
    issuer_address: form.issuerAddress.trim() || null,
    issuer_city: form.issuerCity.trim() || null,
    issuer_zip: form.issuerZip.trim() || null,
    issuer_ico: form.issuerIco.trim() || null,
    issuer_dic: form.issuerDic.trim() || null,
    issuer_data_box: form.issuerDataBox.trim() || null,
    issuer_email: form.issuerEmail.trim() || null,
    issuer_phone: form.issuerPhone.trim() || null,
    default_currency: normalizeAccountingNewCurrency(form.defaultCurrency),
    default_due_days: Number.isFinite(dueDays) ? dueDays : null,
    default_note: form.defaultNote.trim() || null,
    payment_method: form.paymentMethod.trim(),
    bank_account_number: form.bankAccountNumber.trim(),
    bank_account_prefix: form.bankAccountPrefix.trim() || null,
    bank_code: form.bankCode.trim(),
    bank_iban: form.bankIban.trim() || null,
  };
}

export function canApplyAccountingNewPaymentMatch(match: { status: string; invoiceId: number | null; expenseId: number | null }): boolean {
  const normalizedStatus = match.status.trim().toLowerCase();
  if (normalizedStatus === "applied" || normalizedStatus === "rejected") {
    return false;
  }

  return match.invoiceId !== null || match.expenseId !== null;
}

export function canRejectAccountingNewPaymentMatch(match: { status: string }): boolean {
  const normalizedStatus = match.status.trim().toLowerCase();
  return normalizedStatus !== "applied" && normalizedStatus !== "rejected";
}
