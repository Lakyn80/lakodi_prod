import { adminApiUrl, apiFetchOptions } from "@/lib/api";

export type BusinessMode = "autoservice" | "construction";
export type TaxMode = "standard" | "reverse_charge";

const BUSINESS_MODE_LABELS: Record<BusinessMode, string> = {
  autoservice: "Autoservis",
  construction: "Stavební práce",
};

const TAX_MODE_LABELS: Record<TaxMode, string> = {
  standard: "Běžný režim DPH",
  reverse_charge: "Přenesená daňová povinnost",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Koncept",
};

const ARES_SOURCE_LABELS = {
  ares: "ARES",
  mock_ares: "vývojový mock ARES",
} as const;

const REVERSE_CHARGE_REASON_LABELS: Record<string, string> = {
  reverse_charge: "Přenesená daňová povinnost",
  construction_services_reverse_charge: "Přenesená daňová povinnost",
};

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface InvoiceCreatePayload {
  invoice_number?: string | null;
  issue_date: string;
  due_date: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_ico?: string | null;
  customer_dic?: string | null;
  note?: string | null;
  business_mode: BusinessMode;
  tax_mode: TaxMode;
  currency: string;
  vat_rate?: number | null;
  items: InvoiceItemInput[];
}

export interface InvoiceItem {
  id: number;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface InvoiceSummary {
  id: number;
  invoice_number: string;
  variable_symbol: string;
  issue_date: string;
  due_date: string;
  issuer_name: string;
  issuer_address: string;
  issuer_city: string;
  issuer_zip: string;
  issuer_ico: string;
  issuer_dic: string;
  issuer_data_box: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_address: string | null;
  customer_ico: string | null;
  customer_dic: string | null;
  note: string | null;
  business_mode: BusinessMode;
  tax_mode: TaxMode;
  currency: string;
  subtotal: number;
  vat_rate: number | null;
  vat_amount: number;
  total: number;
  status: string;
  reverse_charge_reason: string | null;
  reverse_charge_text: string | null;
  payment_method: string;
  bank_account_number: string;
  bank_account_prefix: string | null;
  bank_code: string;
  bank_iban: string;
  created_at: string;
}

export interface InvoiceDetail extends InvoiceSummary {
  items: InvoiceItem[];
}

export interface AresCompanyLookup {
  ico: string;
  dic: string | null;
  company_name: string;
  address_line: string;
  city: string;
  zip: string;
  country: string;
  data_box: string | null;
  source: "ares" | "mock_ares";
}

export interface SendInvoiceEmailPayload {
  to_email?: string | null;
}

export interface SendInvoiceEmailResponse {
  ok: true;
  invoice_id: number;
  invoice_number: string;
  sent_to: string;
  copied_to: string[];
}

export interface InvoiceDefaultsResponse {
  suggested_invoice_number: string;
  suggested_variable_symbol: string;
}

export interface InvoiceSettingsPayload {
  owner_email: string;
  payment_method: string;
  bank_account_number: string;
  bank_account_prefix?: string | null;
  bank_code: string;
  bank_iban?: string | null;
}

export interface InvoiceSettingsResponse {
  owner_email: string;
  payment_method: string;
  bank_account_number: string;
  bank_account_prefix: string | null;
  bank_code: string;
  bank_iban: string;
  account_label: string;
}

export class AdminApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

function invoicesAdminUrl(path = "") {
  return adminApiUrl(`/invoices${path}`);
}

async function parseApiError(response: Response): Promise<never> {
  let message = `Požadavek selhal (${response.status})`;
  const data = await response.json().catch(() => null);
  const detail = data?.detail;

  if (typeof detail === "string" && detail.trim()) {
    message = detail;
  } else if (Array.isArray(detail)) {
    message = detail
      .map((item) => item?.msg || item?.message || "")
      .filter(Boolean)
      .join(", ");
  }

  if (response.status === 401 && typeof window !== "undefined") {
    window.location.href = "/admin/login";
  }

  throw new AdminApiError(message, response.status);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(invoicesAdminUrl(path), {
    ...apiFetchOptions,
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    return parseApiError(response);
  }

  return response.json() as Promise<T>;
}

export async function listInvoices(): Promise<InvoiceSummary[]> {
  return requestJson<InvoiceSummary[]>("");
}

export async function getInvoiceDetail(invoiceId: number): Promise<InvoiceDetail> {
  return requestJson<InvoiceDetail>(`/${invoiceId}`);
}

export async function createInvoice(payload: InvoiceCreatePayload): Promise<InvoiceDetail> {
  return requestJson<InvoiceDetail>("", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getInvoiceDefaults(): Promise<InvoiceDefaultsResponse> {
  return requestJson<InvoiceDefaultsResponse>("/defaults", {
    method: "GET",
  });
}

export async function getInvoiceSettings(): Promise<InvoiceSettingsResponse> {
  return requestJson<InvoiceSettingsResponse>("/settings", {
    method: "GET",
  });
}

export async function updateInvoiceSettings(payload: InvoiceSettingsPayload): Promise<InvoiceSettingsResponse> {
  return requestJson<InvoiceSettingsResponse>("/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function lookupAresCompany(ico: string): Promise<AresCompanyLookup> {
  return requestJson<AresCompanyLookup>(`/ares/${encodeURIComponent(ico)}`, {
    method: "GET",
  });
}

export async function searchAresCompanies(name: string): Promise<AresCompanyLookup[]> {
  const params = new URLSearchParams({ name });
  return requestJson<AresCompanyLookup[]>(`/ares/search?${params.toString()}`, {
    method: "GET",
  });
}

export async function sendInvoiceEmail(
  invoiceId: number,
  payload?: SendInvoiceEmailPayload,
): Promise<SendInvoiceEmailResponse> {
  return requestJson<SendInvoiceEmailResponse>(`/${invoiceId}/send-email`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function downloadInvoicePdf(invoiceId: number): Promise<void> {
  const response = await fetch(invoicesAdminUrl(`/${invoiceId}/pdf`), {
    ...apiFetchOptions,
    method: "GET",
    headers: {
      Accept: "application/pdf",
    },
  });

  if (!response.ok) {
    return parseApiError(response);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition");
  const fallbackName = `faktura-${invoiceId}.pdf`;
  const filename = extractFilename(contentDisposition) ?? fallbackName;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function extractFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition);
  return match?.[1] ?? null;
}

export function formatInvoiceMoney(value: number, currency: string) {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatInvoiceDate(value: string) {
  return new Date(value).toLocaleDateString("cs-CZ");
}

export function formatInvoiceDateTime(value: string) {
  return new Date(value).toLocaleString("cs-CZ");
}

export function formatInvoiceBusinessMode(value: BusinessMode) {
  return BUSINESS_MODE_LABELS[value] ?? value;
}

export function formatInvoiceTaxMode(value: TaxMode) {
  return TAX_MODE_LABELS[value] ?? value;
}

export function formatInvoiceStatus(value: string) {
  return STATUS_LABELS[value] ?? value;
}

export function formatAresSource(value: AresCompanyLookup["source"]) {
  return ARES_SOURCE_LABELS[value];
}

export function formatReverseChargeReason(value: string | null) {
  if (!value) return null;
  return REVERSE_CHARGE_REASON_LABELS[value] ?? value;
}
