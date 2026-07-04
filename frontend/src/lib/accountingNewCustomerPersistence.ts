import { createAccountingNewSubject, AccountingNewRequestError } from "@/lib/accountingNew";
import type {
  AccountingNewApiError,
  AccountingNewDocumentFormState,
  AccountingNewSubjectSummary,
  AccountingNewSubjectWritePayload,
} from "@/types/accountingNew";

export type AccountingNewCustomerMatchField = "ico" | "dic" | "email" | "name";

export type AccountingNewCustomerInput = {
  name: string;
  email: string;
  phone?: string | null;
  address: string;
  ico?: string | null;
  dic?: string | null;
  dataBox?: string | null;
  country?: string | null;
  note?: string | null;
};

export type AccountingNewCustomerPersistenceResult =
  | { status: "reused"; subject: AccountingNewSubjectSummary; matchField: AccountingNewCustomerMatchField }
  | { status: "created"; subject: AccountingNewSubjectSummary }
  | { status: "ambiguous"; matches: AccountingNewSubjectSummary[]; matchField: AccountingNewCustomerMatchField }
  | { status: "skipped"; reason: "insufficient_data" }
  | { status: "failed"; error: AccountingNewApiError };

export function normalizeAccountingNewIco(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value.replace(/\D/g, "").trim();
}

export function normalizeAccountingNewDic(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function normalizeAccountingNewCompanyName(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeAccountingNewCustomerEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeCountry(value: string | null | undefined): string {
  return (value ?? "CZ").trim().toUpperCase() || "CZ";
}

function excludeSubjectId(subject: AccountingNewSubjectSummary, excludeId?: number): boolean {
  return excludeId !== undefined && subject.id === excludeId;
}

export function findExistingAccountingNewCustomer(
  subjects: AccountingNewSubjectSummary[],
  input: AccountingNewCustomerInput,
  excludeId?: number,
):
  | { kind: "match"; subject: AccountingNewSubjectSummary; matchField: AccountingNewCustomerMatchField }
  | { kind: "ambiguous"; matches: AccountingNewSubjectSummary[]; matchField: AccountingNewCustomerMatchField }
  | { kind: "none" } {
  const normalizedIco = normalizeAccountingNewIco(input.ico);
  if (normalizedIco) {
    const matches = subjects.filter(
      (subject) =>
        !excludeSubjectId(subject, excludeId) && normalizeAccountingNewIco(subject.ico) === normalizedIco,
    );
    if (matches.length === 1) {
      return { kind: "match", subject: matches[0], matchField: "ico" };
    }
    if (matches.length > 1) {
      return { kind: "ambiguous", matches, matchField: "ico" };
    }
  }

  const normalizedDic = normalizeAccountingNewDic(input.dic);
  if (normalizedDic) {
    const matches = subjects.filter(
      (subject) => !excludeSubjectId(subject, excludeId) && normalizeAccountingNewDic(subject.dic) === normalizedDic,
    );
    if (matches.length === 1) {
      return { kind: "match", subject: matches[0], matchField: "dic" };
    }
    if (matches.length > 1) {
      return { kind: "ambiguous", matches, matchField: "dic" };
    }
  }

  const normalizedEmail = normalizeAccountingNewCustomerEmail(input.email);
  if (normalizedEmail) {
    const matches = subjects.filter(
      (subject) =>
        !excludeSubjectId(subject, excludeId) && normalizeAccountingNewCustomerEmail(subject.email) === normalizedEmail,
    );
    if (matches.length === 1) {
      return { kind: "match", subject: matches[0], matchField: "email" };
    }
    if (matches.length > 1) {
      return { kind: "ambiguous", matches, matchField: "email" };
    }
  }

  const normalizedName = normalizeAccountingNewCompanyName(input.name);
  const normalizedCountry = normalizeCountry(input.country);
  if (normalizedName) {
    const matches = subjects.filter((subject) => {
      if (excludeSubjectId(subject, excludeId)) {
        return false;
      }

      if (normalizeAccountingNewCompanyName(subject.name) !== normalizedName) {
        return false;
      }

      return normalizeCountry(subject.country) === normalizedCountry;
    });

    if (matches.length === 1) {
      return { kind: "match", subject: matches[0], matchField: "name" };
    }
    if (matches.length > 1) {
      return { kind: "ambiguous", matches, matchField: "name" };
    }
  }

  return { kind: "none" };
}

export function buildAccountingNewCustomerWritePayload(input: AccountingNewCustomerInput): AccountingNewSubjectWritePayload {
  return {
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone?.trim() || null,
    address: input.address.trim(),
    ico: input.ico?.trim() || null,
    dic: input.dic?.trim() || null,
    data_box: input.dataBox?.trim() || null,
    country: normalizeCountry(input.country),
    note: input.note?.trim() || null,
  };
}

export function applyAccountingNewSubjectToDocumentForm(
  form: AccountingNewDocumentFormState,
  subject: AccountingNewSubjectSummary,
): AccountingNewDocumentFormState {
  return {
    ...form,
    subjectId: String(subject.id),
    customerName: subject.name,
    customerEmail: subject.email,
    customerPhone: subject.phone ?? "",
    customerAddress: subject.address,
    customerIco: subject.ico ?? "",
    customerDic: subject.dic ?? "",
  };
}

export function buildAccountingNewCustomerInputFromDocumentForm(
  form: AccountingNewDocumentFormState,
): AccountingNewCustomerInput {
  return {
    name: form.customerName,
    email: form.customerEmail,
    phone: form.customerPhone,
    address: form.customerAddress,
    ico: form.customerIco,
    dic: form.customerDic,
    dataBox: form.customerDataBox,
    country: "CZ",
    note: form.note,
  };
}

export function buildAccountingNewCustomerInputFromDocumentDetail(detail: {
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerAddress: string | null;
  customerIco: string | null;
  customerDic: string | null;
  note: string | null;
}): AccountingNewCustomerInput {
  return {
    name: detail.customerName,
    email: detail.customerEmail,
    phone: detail.customerPhone,
    address: detail.customerAddress ?? "",
    ico: detail.customerIco,
    dic: detail.customerDic,
    country: "CZ",
    note: detail.note,
  };
}

export async function createAccountingNewCustomer(
  input: AccountingNewCustomerInput,
  signal?: AbortSignal,
): Promise<AccountingNewSubjectSummary> {
  return createAccountingNewSubject(buildAccountingNewCustomerWritePayload(input), { signal });
}

export async function resolveOrCreateAccountingNewCustomer(
  subjects: AccountingNewSubjectSummary[],
  input: AccountingNewCustomerInput,
  options?: { excludeId?: number; signal?: AbortSignal },
): Promise<AccountingNewCustomerPersistenceResult> {
  if (!input.name.trim() || !input.email.trim() || !input.address.trim()) {
    return { status: "skipped", reason: "insufficient_data" };
  }

  const existing = findExistingAccountingNewCustomer(subjects, input, options?.excludeId);
  if (existing.kind === "match") {
    return { status: "reused", subject: existing.subject, matchField: existing.matchField };
  }

  if (existing.kind === "ambiguous") {
    return { status: "ambiguous", matches: existing.matches, matchField: existing.matchField };
  }

  try {
    const subject = await createAccountingNewCustomer(input, options?.signal);
    return { status: "created", subject };
  } catch (error) {
    const apiError =
      error instanceof AccountingNewRequestError
        ? error.apiError
        : {
            resource: "customer-persistence",
            message: error instanceof Error ? error.message : "Customer save failed.",
            status: null,
            requiresLogin: false,
          };

    return { status: "failed", error: apiError };
  }
}
