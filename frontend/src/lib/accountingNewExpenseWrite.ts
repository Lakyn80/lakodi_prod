import {
  formatAccountingNewMoneyInputFromApiDecimal,
  minorUnitsToApiDecimal,
  parseAccountingNewMoneyInput,
} from "@/lib/accountingNewMoney";
import { resolveAccountingNewPaymentMethodForApi } from "@/lib/accountingNewPaymentMethods";
import type {
  AccountingNewExpenseDetail,
  AccountingNewExpenseFormState,
  AccountingNewExpenseWritePayload,
} from "@/types/accountingNew";

export const ACCOUNTING_NEW_EXPENSE_STORED_STATUS_IDS = ["open", "cancelled"] as const;

export function canAccountingNewExpenseAddPayment(detail: AccountingNewExpenseDetail): boolean {
  if (detail.status.trim().toLowerCase() === "cancelled") {
    return false;
  }

  if (detail.paymentStatus.trim().toLowerCase() === "not_payable") {
    return false;
  }

  return detail.remainingAmount > 0;
}

export function createEmptyAccountingNewExpenseFormState(): AccountingNewExpenseFormState {
  const today = new Date().toISOString().slice(0, 10);

  return {
    expenseNumber: "",
    issueDate: today,
    receivedDate: today,
    dueDate: today,
    taxableSupplyDate: today,
    paymentMethod: "bank_transfer",
    bankAccountNumber: "",
    bankAccountPrefix: "",
    bankCode: "",
    bankIban: "",
    currency: "CZK",
    vatRate: "21",
    status: "open",
    note: "",
    supplierId: "",
    supplierName: "",
    supplierEmail: "",
    supplierPhone: "",
    supplierAddress: "",
    supplierIco: "",
    supplierDic: "",
    items: [{ description: "", quantity: "1", unitPrice: "0" }],
  };
}

export function buildAccountingNewExpenseFormStateFromDetail(
  detail: AccountingNewExpenseDetail,
): AccountingNewExpenseFormState {
  return {
    expenseNumber: detail.expenseNumber,
    issueDate: detail.issueDate,
    receivedDate: detail.receivedDate,
    dueDate: detail.dueDate,
    taxableSupplyDate: detail.taxableSupplyDate,
    paymentMethod: detail.paymentMethod,
    bankAccountNumber: detail.bankAccountNumber,
    bankAccountPrefix: detail.bankAccountPrefix ?? "",
    bankCode: detail.bankCode,
    bankIban: detail.bankIban ?? "",
    currency: detail.currency,
    vatRate: detail.vatRate !== null ? String(detail.vatRate) : "",
    status: detail.status,
    note: detail.note ?? "",
    supplierId: detail.supplierId ? String(detail.supplierId) : "",
    supplierName: detail.supplierName,
    supplierEmail: detail.supplierEmail,
    supplierPhone: detail.supplierPhone ?? "",
    supplierAddress: detail.supplierAddress,
    supplierIco: detail.supplierIco ?? "",
    supplierDic: detail.supplierDic ?? "",
    items: detail.items.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: formatAccountingNewMoneyInputFromApiDecimal(item.unitPrice),
    })),
  };
}

export function buildAccountingNewExpenseWritePayloadFromForm(
  form: AccountingNewExpenseFormState,
): AccountingNewExpenseWritePayload {
  const supplierId = form.supplierId.trim() ? Number(form.supplierId) : null;

  return {
    expense_number: form.expenseNumber.trim() || null,
    issue_date: form.issueDate,
    received_date: form.receivedDate,
    due_date: form.dueDate,
    taxable_supply_date: form.taxableSupplyDate,
    payment_method: resolveAccountingNewPaymentMethodForApi(form.paymentMethod),
    bank_account_number: form.bankAccountNumber.trim(),
    bank_account_prefix: form.bankAccountPrefix.trim() || null,
    bank_code: form.bankCode.trim(),
    bank_iban: form.bankIban.trim() || null,
    currency: form.currency.trim().toUpperCase(),
    status: form.status,
    vat_rate: form.vatRate.trim() ? Number(form.vatRate.replace(",", ".")) : null,
    note: form.note.trim() || null,
    supplier_id: supplierId,
    supplier_name: supplierId ? null : form.supplierName.trim() || null,
    supplier_email: supplierId ? null : form.supplierEmail.trim() || null,
    supplier_phone: form.supplierPhone.trim() || null,
    supplier_address: supplierId ? null : form.supplierAddress.trim() || null,
    supplier_ico: form.supplierIco.trim() || null,
    supplier_dic: form.supplierDic.trim() || null,
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
}
