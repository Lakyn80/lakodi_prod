import {
  formatAccountingNewMoneyInputFromApiDecimal,
  minorUnitsToApiDecimal,
  parseAccountingNewMoneyInput,
} from "@/lib/accountingNewMoney";
import { resolveAccountingNewPaymentMethodForApi } from "@/lib/accountingNewPaymentMethods";
import type {
  AccountingNewRecurringTemplateDetail,
  AccountingNewRecurringTemplateFormState,
  AccountingNewRecurringTemplateWritePayload,
} from "@/types/accountingNew";

export const ACCOUNTING_NEW_RECURRING_INTERVALS = ["daily", "weekly", "monthly", "quarterly", "yearly"] as const;
export const ACCOUNTING_NEW_RECURRING_STATUSES = ["active", "paused", "cancelled"] as const;

function createEmptyItem() {
  return { description: "", quantity: "1", unitPrice: "0" };
}

export function createEmptyAccountingNewRecurringTemplateFormState(): AccountingNewRecurringTemplateFormState {
  const today = new Date().toISOString().slice(0, 10);

  return {
    templateType: "invoice",
    documentKind: "invoice",
    name: "",
    status: "active",
    recurrenceInterval: "monthly",
    recurrenceCount: "1",
    nextRunDate: today,
    businessMode: "autoservice",
    taxMode: "standard",
    currency: "CZK",
    vatRate: "21",
    note: "",
    subjectId: "",
    supplierId: "",
    paymentMethod: "bank_transfer",
    bankAccountNumber: "",
    bankAccountPrefix: "",
    bankCode: "",
    bankIban: "",
    items: [createEmptyItem()],
  };
}

export function buildAccountingNewRecurringTemplateFormStateFromDetail(
  detail: AccountingNewRecurringTemplateDetail,
): AccountingNewRecurringTemplateFormState {
  return {
    templateType: detail.templateType as "invoice" | "expense",
    documentKind: detail.documentKind ?? "invoice",
    name: detail.name,
    status: detail.status,
    recurrenceInterval: detail.recurrenceInterval,
    recurrenceCount: String(detail.recurrenceCount),
    nextRunDate: detail.nextRunDate,
    businessMode: detail.businessMode ?? "autoservice",
    taxMode: detail.taxMode ?? "standard",
    currency: detail.currency,
    vatRate: detail.vatRate !== null ? String(detail.vatRate) : "21",
    note: detail.note ?? "",
    subjectId: detail.subjectId ? String(detail.subjectId) : "",
    supplierId: detail.supplierId ? String(detail.supplierId) : "",
    paymentMethod: detail.paymentMethod ?? "bank_transfer",
    bankAccountNumber: detail.bankAccountNumber ?? "",
    bankAccountPrefix: detail.bankAccountPrefix ?? "",
    bankCode: detail.bankCode ?? "",
    bankIban: detail.bankIban ?? "",
    items:
      detail.items.length > 0
        ? detail.items.map((item) => ({
            description: item.description,
            quantity: String(item.quantity),
            unitPrice: formatAccountingNewMoneyInputFromApiDecimal(item.unitPrice, detail.currency),
          }))
        : [createEmptyItem()],
  };
}

export function buildAccountingNewRecurringTemplateWritePayloadFromForm(
  form: AccountingNewRecurringTemplateFormState,
): AccountingNewRecurringTemplateWritePayload {
  const subjectId = form.subjectId.trim() ? Number(form.subjectId) : null;
  const supplierId = form.supplierId.trim() ? Number(form.supplierId) : null;
  const paymentMethod = resolveAccountingNewPaymentMethodForApi(form.paymentMethod);

  const payload: AccountingNewRecurringTemplateWritePayload = {
    template_type: form.templateType,
    name: form.name.trim(),
    status: form.status,
    recurrence_interval: form.recurrenceInterval,
    recurrence_count: Number(form.recurrenceCount.replace(",", ".")),
    next_run_date: form.nextRunDate,
    currency: form.currency.trim().toUpperCase(),
    note: form.note.trim() || null,
    items: form.items.map((item) => {
      const parsedPrice = parseAccountingNewMoneyInput(item.unitPrice, form.currency);
      if (!parsedPrice.ok) {
        throw new Error("INVALID_MONEY");
      }

      return {
        description: item.description.trim(),
        quantity: Number(item.quantity.replace(",", ".")),
        unit_price: minorUnitsToApiDecimal(parsedPrice.minorUnits),
      };
    }),
  };

  if (form.templateType === "invoice") {
    payload.document_kind = form.documentKind;
    payload.subject_id = subjectId;
    payload.business_mode = form.businessMode;
    payload.tax_mode = form.taxMode;
    payload.vat_rate = form.taxMode === "standard" ? Number(form.vatRate.replace(",", ".")) : null;
    if (paymentMethod) {
      payload.payment_method = paymentMethod;
      payload.bank_account_number = form.bankAccountNumber.trim() || null;
      payload.bank_account_prefix = form.bankAccountPrefix.trim() || null;
      payload.bank_code = form.bankCode.trim() || null;
      payload.bank_iban = form.bankIban.trim() || null;
    }
  } else {
    payload.supplier_id = supplierId;
    payload.payment_method = paymentMethod ?? "bank_transfer";
    payload.bank_account_number = form.bankAccountNumber.trim();
    payload.bank_account_prefix = form.bankAccountPrefix.trim() || null;
    payload.bank_code = form.bankCode.trim();
    payload.bank_iban = form.bankIban.trim() || null;
  }

  return payload;
}

export function canAccountingNewRecurringTemplateEdit(detail: AccountingNewRecurringTemplateDetail): boolean {
  return detail.status.trim().toLowerCase() !== "cancelled";
}
