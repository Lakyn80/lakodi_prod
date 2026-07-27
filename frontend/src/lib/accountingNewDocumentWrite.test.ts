import { describe, expect, it } from "vitest";

import {
  buildAccountingNewDocumentFormStateFromDetail,
  buildAccountingNewDocumentWritePayloadFromForm,
  canAccountingNewDocumentEdit,
  createEmptyAccountingNewDocumentFormState,
} from "@/lib/accountingNewDocumentWrite";
import type { AccountingNewDocumentDetail } from "@/types/accountingNew";

function detail(overrides: Partial<AccountingNewDocumentDetail>): AccountingNewDocumentDetail {
  return {
    id: 1,
    invoiceNumber: "0001",
    variableSymbol: "0001",
    documentKind: "invoice",
    issueDate: "2026-07-01",
    dueDate: "2026-07-15",
    customerName: "Test",
    customerEmail: "test@example.com",
    customerPhone: null,
    customerAddress: "Praha",
    customerIco: null,
    customerDic: null,
    subjectId: null,
    note: null,
    businessMode: "autoservice",
    taxMode: "standard",
    currency: "CZK",
    subtotal: 1000,
    vatRate: 21,
    vatAmount: 210,
    total: 1210,
    totalPaid: 0,
    remainingAmount: 1210,
    status: "draft",
    paymentStatus: "unpaid",
    effectiveStatus: "draft",
    reverseChargeReason: null,
    reverseChargeText: null,
    paymentMethod: "Převodem",
    bankAccountNumber: "123",
    bankAccountPrefix: null,
    bankCode: "0800",
    bankIban: "CZ00",
    issuerName: "Issuer",
    issuerAddress: "Addr",
    issuerCity: "Praha",
    issuerZip: "11000",
    issuerIco: "12345678",
    issuerDic: "CZ12345678",
    issuerDataBox: null,
    items: [{ id: 1, description: "Item", quantity: 1, unitPrice: 1000, lineTotal: 1000 }],
    payments: [],
    createdAt: "2026-07-01T00:00:00",
    ...overrides,
  };
}

describe("canAccountingNewDocumentEdit", () => {
  it("allows draft documents", () => {
    expect(canAccountingNewDocumentEdit(detail({ status: "draft", effectiveStatus: "draft" }))).toBe(true);
  });

  it("allows issued documents", () => {
    expect(canAccountingNewDocumentEdit(detail({ status: "issued", effectiveStatus: "issued" }))).toBe(true);
  });

  it("allows issued documents that are overdue", () => {
    expect(canAccountingNewDocumentEdit(detail({ status: "issued", effectiveStatus: "overdue" }))).toBe(true);
  });

  it("rejects cancelled stored status", () => {
    expect(canAccountingNewDocumentEdit(detail({ status: "cancelled", effectiveStatus: "cancelled" }))).toBe(false);
  });

  it("rejects cancelled effective status", () => {
    expect(canAccountingNewDocumentEdit(detail({ status: "issued", effectiveStatus: "cancelled" }))).toBe(false);
  });
});

describe("document write payment method", () => {
  it("maps detail payment method into form state", () => {
    const form = buildAccountingNewDocumentFormStateFromDetail(detail({ paymentMethod: "Hotově" }));
    expect(form.paymentMethod).toBe("cash");
  });

  it("includes canonical payment_method in write payload", () => {
    const form = createEmptyAccountingNewDocumentFormState();
    form.customerName = "Test";
    form.customerEmail = "test@example.com";
    form.customerAddress = "Praha";
    form.paymentMethod = "card";
    form.items = [{ description: "Item", quantity: "1", unitPrice: "1000" }];

    const payload = buildAccountingNewDocumentWritePayloadFromForm(form);
    expect(payload.payment_method).toBe("Kartou");
  });
});
