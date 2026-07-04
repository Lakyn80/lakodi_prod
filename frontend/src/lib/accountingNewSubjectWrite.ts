import type {
  AccountingNewSubjectFormState,
  AccountingNewSubjectSummary,
  AccountingNewSubjectWritePayload,
} from "@/types/accountingNew";

export function normalizeAccountingNewIco(ico: string | null | undefined): string {
  return (ico ?? "").trim();
}

export function findAccountingNewSubjectByIco(
  subjects: AccountingNewSubjectSummary[],
  ico: string,
  excludeId?: number,
): AccountingNewSubjectSummary | null {
  const normalized = normalizeAccountingNewIco(ico);
  if (!normalized) {
    return null;
  }

  return (
    subjects.find((subject) => {
      if (excludeId !== undefined && subject.id === excludeId) {
        return false;
      }
      return normalizeAccountingNewIco(subject.ico) === normalized;
    }) ?? null
  );
}

export function createEmptyAccountingNewSubjectFormState(): AccountingNewSubjectFormState {
  return {
    name: "",
    email: "",
    phone: "",
    address: "",
    ico: "",
    dic: "",
    dataBox: "",
    country: "CZ",
    note: "",
  };
}

export function buildAccountingNewSubjectFormStateFromDetail(
  detail: AccountingNewSubjectSummary,
): AccountingNewSubjectFormState {
  return {
    name: detail.name,
    email: detail.email,
    phone: detail.phone ?? "",
    address: detail.address,
    ico: detail.ico ?? "",
    dic: detail.dic ?? "",
    dataBox: detail.dataBox ?? "",
    country: detail.country ?? "CZ",
    note: detail.note ?? "",
  };
}

export function buildAccountingNewSubjectWritePayloadFromForm(
  form: AccountingNewSubjectFormState,
): AccountingNewSubjectWritePayload {
  return {
    name: form.name.trim(),
    email: form.email.trim(),
    phone: form.phone.trim() || null,
    address: form.address.trim(),
    ico: form.ico.trim() || null,
    dic: form.dic.trim() || null,
    data_box: form.dataBox.trim() || null,
    country: form.country.trim() || null,
    note: form.note.trim() || null,
  };
}
