import type {
  AccountingNewExpenseFormState,
  AccountingNewRecurringTemplateFormState,
  AccountingNewSupplierDetail,
  AccountingNewSupplierFormState,
  AccountingNewSupplierSummary,
  AccountingNewSupplierWritePayload,
} from "@/types/accountingNew";
import { findAccountingNewSubjectByIco, normalizeAccountingNewIco } from "@/lib/accountingNewSubjectWrite";

export function findAccountingNewSupplierByIco(
  suppliers: AccountingNewSupplierSummary[],
  ico: string,
  excludeId?: number,
): AccountingNewSupplierSummary | null {
  const normalized = normalizeAccountingNewIco(ico);
  if (!normalized) {
    return null;
  }

  return (
    suppliers.find((supplier) => {
      if (excludeId !== undefined && supplier.id === excludeId) {
        return false;
      }
      return normalizeAccountingNewIco(supplier.ico) === normalized;
    }) ?? null
  );
}

export function createEmptyAccountingNewSupplierFormState(): AccountingNewSupplierFormState {
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

export function buildAccountingNewSupplierFormStateFromDetail(
  detail: AccountingNewSupplierDetail,
): AccountingNewSupplierFormState {
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

export function applyAccountingNewSupplierToExpenseForm(
  form: AccountingNewExpenseFormState,
  supplier: AccountingNewSupplierSummary,
): AccountingNewExpenseFormState {
  return {
    ...form,
    supplierId: String(supplier.id),
    supplierName: supplier.name,
    supplierEmail: supplier.email,
    supplierPhone: supplier.phone ?? "",
    supplierAddress: supplier.address,
    supplierIco: supplier.ico ?? "",
    supplierDic: supplier.dic ?? "",
  };
}

export function clearAccountingNewSupplierFromExpenseForm(
  form: AccountingNewExpenseFormState,
): AccountingNewExpenseFormState {
  return {
    ...form,
    supplierId: "",
    supplierName: "",
    supplierEmail: "",
    supplierPhone: "",
    supplierAddress: "",
    supplierIco: "",
    supplierDic: "",
  };
}

export function applyAccountingNewSupplierToRecurringTemplateForm(
  form: AccountingNewRecurringTemplateFormState,
  supplier: AccountingNewSupplierSummary,
): AccountingNewRecurringTemplateFormState {
  return {
    ...form,
    supplierId: String(supplier.id),
  };
}

export function buildAccountingNewSupplierWritePayloadFromForm(
  form: AccountingNewSupplierFormState,
): AccountingNewSupplierWritePayload {
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
