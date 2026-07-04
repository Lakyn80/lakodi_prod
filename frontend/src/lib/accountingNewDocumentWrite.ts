import type {
  AccountingNewDocumentDetail,
  AccountingNewDocumentFormState,
  AccountingNewDocumentWritePayload,
} from "@/types/accountingNew";

function normalizeStoredStatus(status: string): string {
  return status.trim().toLowerCase();
}

export function isAccountingNewDocumentDraft(detail: AccountingNewDocumentDetail): boolean {
  return normalizeStoredStatus(detail.status) === "draft";
}

export function canAccountingNewDocumentEdit(detail: AccountingNewDocumentDetail): boolean {
  const status = normalizeStoredStatus(detail.status);
  return status === "draft" && normalizeStoredStatus(detail.effectiveStatus) !== "cancelled";
}

export function canAccountingNewDocumentIssue(detail: AccountingNewDocumentDetail): boolean {
  return isAccountingNewDocumentDraft(detail);
}

export function canAccountingNewDocumentAddPayment(detail: AccountingNewDocumentDetail): boolean {
  if (normalizeStoredStatus(detail.status) === "cancelled") {
    return false;
  }

  if (normalizeStoredStatus(detail.paymentStatus) === "not_payable") {
    return false;
  }

  return detail.remainingAmount > 0;
}

export function buildAccountingNewDocumentWritePayloadFromForm(
  form: AccountingNewDocumentFormState,
  options?: { status?: AccountingNewDocumentFormState["status"] },
): AccountingNewDocumentWritePayload {
  const subjectId = form.subjectId.trim() ? Number(form.subjectId) : null;

  return {
    invoice_number: form.invoiceNumber.trim() || null,
    document_kind: form.documentKind,
    status: options?.status ?? form.status,
    issue_date: form.issueDate,
    due_date: form.dueDate,
    subject_id: subjectId,
    customer_name: subjectId ? null : form.customerName.trim() || null,
    customer_email: subjectId ? null : form.customerEmail.trim() || null,
    customer_phone: form.customerPhone.trim() || null,
    customer_address: subjectId ? null : form.customerAddress.trim() || null,
    customer_ico: form.customerIco.trim() || null,
    customer_dic: form.customerDic.trim() || null,
    note: form.note.trim() || null,
    business_mode: form.businessMode,
    tax_mode: form.taxMode,
    currency: form.currency.trim().toUpperCase(),
    vat_rate: form.taxMode === "standard" ? Number(form.vatRate) : null,
    items: form.items.map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unit_price: Number(item.unitPrice),
    })),
  };
}

export function buildAccountingNewDocumentWritePayloadFromDetail(
  detail: AccountingNewDocumentDetail,
  status?: AccountingNewDocumentDetail["status"],
): AccountingNewDocumentWritePayload {
  return {
    invoice_number: detail.invoiceNumber,
    document_kind: detail.documentKind,
    status: (status ?? detail.status) as AccountingNewDocumentWritePayload["status"],
    issue_date: detail.issueDate,
    due_date: detail.dueDate,
    subject_id: detail.subjectId,
    customer_name: detail.subjectId ? null : detail.customerName,
    customer_email: detail.subjectId ? null : detail.customerEmail,
    customer_phone: detail.customerPhone,
    customer_address: detail.subjectId ? null : detail.customerAddress,
    customer_ico: detail.customerIco,
    customer_dic: detail.customerDic,
    note: detail.note,
    business_mode: detail.businessMode as AccountingNewDocumentWritePayload["business_mode"],
    tax_mode: detail.taxMode as AccountingNewDocumentWritePayload["tax_mode"],
    currency: detail.currency,
    vat_rate: detail.vatRate,
    items: detail.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
    })),
  };
}

export function buildAccountingNewDocumentFormStateFromDetail(
  detail: AccountingNewDocumentDetail,
): AccountingNewDocumentFormState {
  return {
    invoiceNumber: detail.invoiceNumber,
    documentKind: detail.documentKind,
    status: normalizeStoredStatus(detail.status) as AccountingNewDocumentFormState["status"],
    issueDate: detail.issueDate,
    dueDate: detail.dueDate,
    subjectId: detail.subjectId ? String(detail.subjectId) : "",
    customerName: detail.customerName,
    customerEmail: detail.customerEmail,
    customerPhone: detail.customerPhone ?? "",
    customerAddress: detail.customerAddress ?? "",
    customerIco: detail.customerIco ?? "",
    customerDic: detail.customerDic ?? "",
    note: detail.note ?? "",
    businessMode: detail.businessMode as AccountingNewDocumentFormState["businessMode"],
    taxMode: detail.taxMode as AccountingNewDocumentFormState["taxMode"],
    currency: detail.currency,
    vatRate: detail.vatRate !== null ? String(detail.vatRate) : "21",
    items: detail.items.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
    })),
  };
}

export function createEmptyAccountingNewDocumentFormState(): AccountingNewDocumentFormState {
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date();
  due.setDate(due.getDate() + 14);

  return {
    invoiceNumber: "",
    documentKind: "invoice",
    status: "draft",
    issueDate: today,
    dueDate: due.toISOString().slice(0, 10),
    subjectId: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerAddress: "",
    customerIco: "",
    customerDic: "",
    note: "",
    businessMode: "autoservice",
    taxMode: "standard",
    currency: "CZK",
    vatRate: "21",
    items: [{ description: "", quantity: "1", unitPrice: "0" }],
  };
}
