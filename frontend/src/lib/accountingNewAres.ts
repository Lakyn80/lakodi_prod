import { apiFetchOptions, adminApiUrl } from "@/lib/api";
import { AccountingNewRequestError } from "@/lib/accountingNew";

const ACCOUNTING_NEW_INVOICES_BASE = "/invoices";

export interface AccountingNewAresCompanyLookup {
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

const ARES_SOURCE_LABELS = {
  ares: "ARES",
  mock_ares: "mock ARES",
} as const;

async function buildAresApiError(resource: string, response: Response) {
  let message = `ARES požadavek selhal (${response.status}).`;

  try {
    const payload = (await response.json()) as { detail?: string };
    if (typeof payload.detail === "string" && payload.detail.trim()) {
      message = payload.detail;
    }
  } catch {
    if (response.status === 401) {
      message = "Pro ARES lookup je nutné přihlášení do adminu.";
    }
  }

  return {
    resource,
    message,
    status: response.status,
    requiresLogin: response.status === 401,
  };
}

export function buildAccountingNewAresAddress(
  addressLine: string,
  zip: string,
  city: string,
  country: string,
): string {
  const parts = [addressLine.trim(), [zip.trim(), city.trim()].filter(Boolean).join(" "), country.trim()].filter(Boolean);
  return parts.join(", ");
}

export function formatAccountingNewAresSource(value: AccountingNewAresCompanyLookup["source"]): string {
  return ARES_SOURCE_LABELS[value];
}

export function getAccountingNewAresResultLabel(company: AccountingNewAresCompanyLookup): string {
  return company.dic ? `${company.company_name} (IČO ${company.ico}, DIČ ${company.dic})` : `${company.company_name} (IČO ${company.ico})`;
}

export async function lookupAccountingNewAresCompany(ico: string): Promise<AccountingNewAresCompanyLookup> {
  const response = await fetch(adminApiUrl(`${ACCOUNTING_NEW_INVOICES_BASE}/ares/${encodeURIComponent(ico)}`), {
    ...apiFetchOptions,
    method: "GET",
  });

  if (!response.ok) {
    throw new AccountingNewRequestError(await buildAresApiError("ares-lookup", response));
  }

  return response.json() as Promise<AccountingNewAresCompanyLookup>;
}

export async function searchAccountingNewAresCompanies(name: string): Promise<AccountingNewAresCompanyLookup[]> {
  const params = new URLSearchParams({ name: name.trim() });
  const response = await fetch(adminApiUrl(`${ACCOUNTING_NEW_INVOICES_BASE}/ares/search?${params.toString()}`), {
    ...apiFetchOptions,
    method: "GET",
  });

  if (!response.ok) {
    throw new AccountingNewRequestError(await buildAresApiError("ares-search", response));
  }

  return response.json() as Promise<AccountingNewAresCompanyLookup[]>;
}
