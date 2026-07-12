import { adminApiUrl, apiFetchOptions } from "@/lib/api";
import type {
  AccountingNewApiError,
  AccountingNewAttachmentFilters,
  AccountingNewAttachmentSummary,
  AccountingNewAuditEventSummary,
  AccountingNewBankTransactionDetail,
  AccountingNewBankTransactionFilters,
  AccountingNewBankTransactionListItem,
  AccountingNewDashboardData,
  AccountingNewDashboardLoadResult,
  AccountingNewDocumentDetail,
  AccountingNewDocumentFilters,
  AccountingNewDocumentItem,
  AccountingNewDocumentListItem,
  AccountingNewDocumentDefaults,
  AccountingNewDocumentPaymentCreatePayload,
  AccountingNewDocumentWritePayload,
  AccountingNewDocumentRelationDocumentSummary,
  AccountingNewDocumentRelationPaymentSummary,
  AccountingNewDocumentRelationSummary,
  AccountingNewDocumentRelationsSummary,
  AccountingNewExpenseDetail,
  AccountingNewExpenseFilters,
  AccountingNewExpenseItem,
  AccountingNewExpenseListItem,
  AccountingNewExpensePaymentCreatePayload,
  AccountingNewExpensePaymentSummary,
  AccountingNewExpenseWritePayload,
  AccountingNewPaymentSummary,
  AccountingNewPaymentMatchListItem,
  AccountingNewPaymentMatchDashboardItem,
  AccountingNewPaymentMatchCatalogParams,
  AccountingNewRecurringGenerationListItem,
  AccountingNewRecurringTemplateDetail,
  AccountingNewRecurringTemplateFilters,
  AccountingNewRecurringTemplateItem,
  AccountingNewRecurringTemplateSummary,
  AccountingNewReminderEmailDetail,
  AccountingNewReminderEmailFilters,
  AccountingNewReminderEmailListItem,
  AccountingNewAttachmentLinkPayload,
  AccountingNewAttachmentUploadParams,
  AccountingNewBankTransactionImportPayload,
  AccountingNewBankTransactionImportResult,
  AccountingNewPayableInvoiceListItem,
  AccountingNewRecordInvoiceBankPaymentPayload,
  AccountingNewAssignBankTransactionInvoicePayload,
  AccountingNewRecordInvoiceBankPaymentResult,
  AccountingNewDocumentEmailSendPayload,
  AccountingNewDocumentEmailSendResult,
  AccountingNewExportKind,
  AccountingNewReminderEmailPreview,
  AccountingNewReminderEmailSendPayload,
  AccountingNewRecurringGenerationResult,
  AccountingNewSettings,
  AccountingNewSettingsWritePayload,
  AccountingNewTodoCreatePayload,
  AccountingNewTodoGenerateResult,
  AccountingNewTodoSummary,
  AccountingNewSubjectSummary,
  AccountingNewSubjectWritePayload,
  AccountingNewSupplierDetail,
  AccountingNewSupplierFilters,
  AccountingNewSupplierListItem,
  AccountingNewSupplierWritePayload,
  AccountingNewTodoDetail,
  AccountingNewTodoFilters,
} from "@/types/accountingNew";

export const ACCOUNTING_NEW_ROUTE = "/admin/ucetnictvi-new";
export const ACCOUNTING_NEW_LABEL = "Účetnictví";

const ACCOUNTING_NEW_INVOICES_BASE = "/invoices";

export interface AccountingNewListParams {
  signal?: AbortSignal;
}

export class AccountingNewRequestError extends Error {
  readonly apiError: AccountingNewApiError;

  constructor(apiError: AccountingNewApiError) {
    super(apiError.message);
    this.name = "AccountingNewRequestError";
    this.apiError = apiError;
  }
}

function emptyDashboard(): AccountingNewDashboardData {
  return {
    invoices: [],
    expenses: [],
    todos: [],
    bankTransactions: [],
    auditEvents: [],
    recurringTemplates: [],
    attachments: [],
    subjects: [],
    suppliers: [],
    metrics: {
      documentsLoaded: 0,
      documentsWithRemainingBalance: 0,
      expensesLoaded: 0,
      expensesWithRemainingBalance: 0,
      todosLoaded: 0,
      openTodos: 0,
      overdueTodos: 0,
      bankTransactionsLoaded: 0,
      recurringTemplatesLoaded: 0,
      attachmentsLoaded: 0,
      auditEventsLoaded: 0,
      subjectsLoaded: 0,
      suppliersLoaded: 0,
    },
    lastUpdatedAt: null,
  };
}

function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeEntityId(id: number | string, resource: string, label: string): string {
  const normalized = typeof id === "number" ? String(id) : id.trim();
  if (!/^\d+$/.test(normalized) || Number(normalized) <= 0) {
    throw new AccountingNewRequestError({
      resource,
      message: `${label} musí být kladné číslo.`,
      status: 400,
      requiresLogin: false,
    });
  }
  return normalized;
}

function normalizeDocumentId(id: number | string): string {
  return normalizeEntityId(id, "documents", "ID dokumentu");
}

function normalizeExpenseId(id: number | string): string {
  return normalizeEntityId(id, "expense-detail", "ID výdaje");
}

function normalizeSupplierId(id: number | string): string {
  return normalizeEntityId(id, "supplier-detail", "ID dodavatele");
}

function normalizeSubjectId(id: number | string): string {
  return normalizeEntityId(id, "subject-detail", "ID subjektu");
}

function normalizeBankTransactionId(id: number | string): string {
  return normalizeEntityId(id, "bank-transaction-detail", "ID bankovní transakce");
}

function normalizeTodoId(id: number | string): string {
  return normalizeEntityId(id, "todo-detail", "ID úkolu");
}

function normalizeReminderEmailId(id: number | string): string {
  return normalizeEntityId(id, "reminder-email-detail", "ID upomínkového e-mailu");
}

function normalizeRecurringTemplateId(id: number | string): string {
  return normalizeEntityId(id, "recurring-detail", "ID opakované šablony");
}

function normalizeAttachmentId(id: number | string): string {
  return normalizeEntityId(id, "attachment-detail", "ID přílohy");
}

type AccountingNewAttachmentApiItem = {
  id: number;
  invoice_id: number | null;
  expense_id: number | null;
  todo_id: number | null;
  bank_transaction_id: number | null;
  attachment_type: string;
  status: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  checksum_sha256: string | null;
  note: string | null;
  created_at: string;
};

function buildAttachmentQueryPath(filters: AccountingNewAttachmentFilters = {}): string {
  const searchParams = new URLSearchParams();

  if (filters.invoiceId !== undefined) {
    searchParams.set("invoice_id", String(filters.invoiceId));
  }

  if (filters.expenseId !== undefined) {
    searchParams.set("expense_id", String(filters.expenseId));
  }

  if (filters.status && filters.status !== "all") {
    searchParams.set("status", filters.status);
  }

  if (filters.attachmentType && filters.attachmentType !== "all") {
    searchParams.set("attachment_type", filters.attachmentType);
  }

  if (filters.unlinkedOnly) {
    searchParams.set("unlinked_only", "true");
  }

  return `/attachments${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`;
}

function mapDocumentListItem(item: {
  id: number;
  invoice_number: string;
  variable_symbol: string;
  document_kind: string;
  issue_date: string;
  due_date: string;
  customer_name: string;
  customer_email: string;
  currency: string;
  total: number;
  total_paid: number;
  remaining_amount: number;
  status: string;
  payment_status: string;
  effective_status: string;
  created_at: string;
}): AccountingNewDocumentListItem {
  return {
    id: item.id,
    invoiceNumber: item.invoice_number,
    variableSymbol: item.variable_symbol,
    documentKind: item.document_kind,
    issueDate: item.issue_date,
    dueDate: item.due_date,
    customerName: item.customer_name,
    customerEmail: item.customer_email,
    currency: item.currency,
    total: item.total,
    totalPaid: item.total_paid,
    remainingAmount: item.remaining_amount,
    status: item.status,
    paymentStatus: item.payment_status,
    effectiveStatus: item.effective_status,
    createdAt: item.created_at,
  };
}

function mapDocumentItem(item: {
  id: number;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}): AccountingNewDocumentItem {
  return {
    id: item.id,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    lineTotal: item.line_total,
  };
}

function mapPaymentSummary(item: {
  id: number;
  invoice_id: number;
  amount: number;
  paid_at: string;
  payment_method: string;
  note: string | null;
  created_at: string;
}): AccountingNewPaymentSummary {
  return {
    id: item.id,
    invoiceId: item.invoice_id,
    amount: item.amount,
    paidAt: item.paid_at,
    paymentMethod: item.payment_method,
    note: item.note,
    createdAt: item.created_at,
  };
}

function mapDocumentDetail(item: {
  id: number;
  invoice_number: string;
  variable_symbol: string;
  document_kind: string;
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
  subject_id: number | null;
  note: string | null;
  business_mode: string;
  tax_mode: string;
  currency: string;
  subtotal: number;
  vat_rate: number | null;
  vat_amount: number;
  total: number;
  status: string;
  total_paid: number;
  remaining_amount: number;
  payment_status: string;
  effective_status: string;
  reverse_charge_reason: string | null;
  reverse_charge_text: string | null;
  payment_method: string;
  bank_account_number: string;
  bank_account_prefix: string | null;
  bank_code: string;
  bank_iban: string;
  created_at: string;
  items: Array<{
    id: number;
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
  payments: Array<{
    id: number;
    invoice_id: number;
    amount: number;
    paid_at: string;
    payment_method: string;
    note: string | null;
    created_at: string;
  }>;
}): AccountingNewDocumentDetail {
  return {
    ...mapDocumentListItem(item),
    issuerName: item.issuer_name,
    issuerAddress: item.issuer_address,
    issuerCity: item.issuer_city,
    issuerZip: item.issuer_zip,
    issuerIco: item.issuer_ico,
    issuerDic: item.issuer_dic,
    issuerDataBox: item.issuer_data_box,
    customerPhone: item.customer_phone,
    customerAddress: item.customer_address,
    customerIco: item.customer_ico,
    customerDic: item.customer_dic,
    subjectId: item.subject_id,
    note: item.note,
    businessMode: item.business_mode,
    taxMode: item.tax_mode,
    subtotal: item.subtotal,
    vatRate: item.vat_rate,
    vatAmount: item.vat_amount,
    reverseChargeReason: item.reverse_charge_reason,
    reverseChargeText: item.reverse_charge_text,
    paymentMethod: item.payment_method,
    bankAccountNumber: item.bank_account_number,
    bankAccountPrefix: item.bank_account_prefix,
    bankCode: item.bank_code,
    bankIban: item.bank_iban,
    items: item.items.map(mapDocumentItem),
    payments: item.payments.map(mapPaymentSummary),
  };
}

function mapDocumentRelationDocumentSummary(item: {
  id: number;
  document_kind: string;
  invoice_number: string;
  variable_symbol: string;
  issue_date: string;
  due_date: string;
  customer_name: string;
  currency: string;
  total: number;
  effective_status: string;
  payment_status: string;
}): AccountingNewDocumentRelationDocumentSummary {
  return {
    id: item.id,
    documentKind: item.document_kind,
    invoiceNumber: item.invoice_number,
    variableSymbol: item.variable_symbol,
    issueDate: item.issue_date,
    dueDate: item.due_date,
    customerName: item.customer_name,
    currency: item.currency,
    total: item.total,
    effectiveStatus: item.effective_status,
    paymentStatus: item.payment_status,
  };
}

function mapDocumentRelationPaymentSummary(item: {
  id: number;
  amount: number;
  paid_at: string;
  payment_method: string;
  note: string | null;
}): AccountingNewDocumentRelationPaymentSummary {
  return {
    id: item.id,
    amount: item.amount,
    paidAt: item.paid_at,
    paymentMethod: item.payment_method,
    note: item.note,
  };
}

function mapDocumentRelationSummary(item: {
  id: number;
  relation_type: string;
  source_invoice_id: number;
  target_invoice_id: number;
  source_payment_id: number | null;
  created_at: string;
  source_document: {
    id: number;
    document_kind: string;
    invoice_number: string;
    variable_symbol: string;
    issue_date: string;
    due_date: string;
    customer_name: string;
    currency: string;
    total: number;
    effective_status: string;
    payment_status: string;
  } | null;
  target_document: {
    id: number;
    document_kind: string;
    invoice_number: string;
    variable_symbol: string;
    issue_date: string;
    due_date: string;
    customer_name: string;
    currency: string;
    total: number;
    effective_status: string;
    payment_status: string;
  } | null;
  source_payment: {
    id: number;
    amount: number;
    paid_at: string;
    payment_method: string;
    note: string | null;
  } | null;
}): AccountingNewDocumentRelationSummary {
  return {
    id: item.id,
    relationType: item.relation_type,
    sourceInvoiceId: item.source_invoice_id,
    targetInvoiceId: item.target_invoice_id,
    sourcePaymentId: item.source_payment_id,
    createdAt: item.created_at,
    sourceDocument: item.source_document ? mapDocumentRelationDocumentSummary(item.source_document) : null,
    targetDocument: item.target_document ? mapDocumentRelationDocumentSummary(item.target_document) : null,
    sourcePayment: item.source_payment ? mapDocumentRelationPaymentSummary(item.source_payment) : null,
  };
}

function mapDocumentRelationsSummary(item: {
  invoice_id: number;
  outgoing_relations: Array<{
    id: number;
    relation_type: string;
    source_invoice_id: number;
    target_invoice_id: number;
    source_payment_id: number | null;
    created_at: string;
    source_document: {
      id: number;
      document_kind: string;
      invoice_number: string;
      variable_symbol: string;
      issue_date: string;
      due_date: string;
      customer_name: string;
      currency: string;
      total: number;
      effective_status: string;
      payment_status: string;
    } | null;
    target_document: {
      id: number;
      document_kind: string;
      invoice_number: string;
      variable_symbol: string;
      issue_date: string;
      due_date: string;
      customer_name: string;
      currency: string;
      total: number;
      effective_status: string;
      payment_status: string;
    } | null;
    source_payment: {
      id: number;
      amount: number;
      paid_at: string;
      payment_method: string;
      note: string | null;
    } | null;
  }>;
  incoming_relations: Array<{
    id: number;
    relation_type: string;
    source_invoice_id: number;
    target_invoice_id: number;
    source_payment_id: number | null;
    created_at: string;
    source_document: {
      id: number;
      document_kind: string;
      invoice_number: string;
      variable_symbol: string;
      issue_date: string;
      due_date: string;
      customer_name: string;
      currency: string;
      total: number;
      effective_status: string;
      payment_status: string;
    } | null;
    target_document: {
      id: number;
      document_kind: string;
      invoice_number: string;
      variable_symbol: string;
      issue_date: string;
      due_date: string;
      customer_name: string;
      currency: string;
      total: number;
      effective_status: string;
      payment_status: string;
    } | null;
    source_payment: {
      id: number;
      amount: number;
      paid_at: string;
      payment_method: string;
      note: string | null;
    } | null;
  }>;
  all_relations: Array<{
    id: number;
    relation_type: string;
    source_invoice_id: number;
    target_invoice_id: number;
    source_payment_id: number | null;
    created_at: string;
    source_document: {
      id: number;
      document_kind: string;
      invoice_number: string;
      variable_symbol: string;
      issue_date: string;
      due_date: string;
      customer_name: string;
      currency: string;
      total: number;
      effective_status: string;
      payment_status: string;
    } | null;
    target_document: {
      id: number;
      document_kind: string;
      invoice_number: string;
      variable_symbol: string;
      issue_date: string;
      due_date: string;
      customer_name: string;
      currency: string;
      total: number;
      effective_status: string;
      payment_status: string;
    } | null;
    source_payment: {
      id: number;
      amount: number;
      paid_at: string;
      payment_method: string;
      note: string | null;
    } | null;
  }>;
}): AccountingNewDocumentRelationsSummary {
  return {
    invoiceId: item.invoice_id,
    outgoingRelations: item.outgoing_relations.map(mapDocumentRelationSummary),
    incomingRelations: item.incoming_relations.map(mapDocumentRelationSummary),
    allRelations: item.all_relations.map(mapDocumentRelationSummary),
  };
}

function mapExpenseSummary(item: {
  id: number;
  expense_number: string;
  variable_symbol: string;
  supplier_id: number | null;
  supplier_name: string;
  supplier_email: string;
  supplier_phone: string | null;
  supplier_address: string;
  supplier_ico: string | null;
  supplier_dic: string | null;
  supplier_data_box: string | null;
  supplier_country: string | null;
  currency: string;
  issue_date: string;
  received_date: string;
  due_date: string;
  taxable_supply_date: string;
  subtotal: number;
  vat_rate: number | null;
  vat_amount: number;
  total: number;
  note: string | null;
  payment_method: string;
  bank_account_number: string;
  bank_account_prefix: string | null;
  bank_code: string;
  bank_iban: string | null;
  total_paid: number;
  remaining_amount: number;
  status: string;
  payment_status: string;
  created_at: string;
  updated_at: string;
}): AccountingNewExpenseListItem {
  return {
    id: item.id,
    expenseNumber: item.expense_number,
    variableSymbol: item.variable_symbol,
    supplierId: item.supplier_id,
    supplierName: item.supplier_name,
    supplierEmail: item.supplier_email,
    supplierPhone: item.supplier_phone,
    supplierAddress: item.supplier_address,
    supplierIco: item.supplier_ico,
    supplierDic: item.supplier_dic,
    supplierDataBox: item.supplier_data_box,
    supplierCountry: item.supplier_country,
    currency: item.currency,
    issueDate: item.issue_date,
    receivedDate: item.received_date,
    dueDate: item.due_date,
    taxableSupplyDate: item.taxable_supply_date,
    subtotal: item.subtotal,
    vatRate: item.vat_rate,
    vatAmount: item.vat_amount,
    total: item.total,
    note: item.note,
    paymentMethod: item.payment_method,
    bankAccountNumber: item.bank_account_number,
    bankAccountPrefix: item.bank_account_prefix,
    bankCode: item.bank_code,
    bankIban: item.bank_iban,
    totalPaid: item.total_paid,
    remainingAmount: item.remaining_amount,
    status: item.status,
    paymentStatus: item.payment_status,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function mapExpenseItem(item: {
  id: number;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}): AccountingNewExpenseItem {
  return {
    id: item.id,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    lineTotal: item.line_total,
  };
}

function mapExpensePaymentSummary(item: {
  id: number;
  expense_id: number;
  amount: number;
  paid_at: string;
  payment_method: string;
  note: string | null;
  created_at: string;
}): AccountingNewExpensePaymentSummary {
  return {
    id: item.id,
    expenseId: item.expense_id,
    amount: item.amount,
    paidAt: item.paid_at,
    paymentMethod: item.payment_method,
    note: item.note,
    createdAt: item.created_at,
  };
}

function mapExpenseDetail(item: {
  id: number;
  expense_number: string;
  variable_symbol: string;
  supplier_id: number | null;
  supplier_name: string;
  supplier_email: string;
  supplier_phone: string | null;
  supplier_address: string;
  supplier_ico: string | null;
  supplier_dic: string | null;
  supplier_data_box: string | null;
  supplier_country: string | null;
  issue_date: string;
  received_date: string;
  due_date: string;
  taxable_supply_date: string;
  currency: string;
  subtotal: number;
  vat_rate: number | null;
  vat_amount: number;
  total: number;
  status: string;
  note: string | null;
  payment_method: string;
  bank_account_number: string;
  bank_account_prefix: string | null;
  bank_code: string;
  bank_iban: string | null;
  total_paid: number;
  remaining_amount: number;
  payment_status: string;
  created_at: string;
  updated_at: string;
  items: Array<{
    id: number;
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
  payments: Array<{
    id: number;
    expense_id: number;
    amount: number;
    paid_at: string;
    payment_method: string;
    note: string | null;
    created_at: string;
  }>;
}): AccountingNewExpenseDetail {
  return {
    ...mapExpenseSummary(item),
    items: item.items.map(mapExpenseItem),
    payments: item.payments.map(mapExpensePaymentSummary),
  };
}

function mapTodoSummary(item: {
  id: number;
  invoice_id: number | null;
  expense_id: number | null;
  todo_type: string;
  status: string;
  title: string;
  message: string | null;
  due_date: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}): AccountingNewTodoSummary {
  return {
    id: item.id,
    invoiceId: item.invoice_id,
    expenseId: item.expense_id,
    todoType: item.todo_type,
    status: item.status,
    title: item.title,
    message: item.message,
    dueDate: item.due_date,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    completedAt: item.completed_at,
  };
}

function mapBankTransactionSummary(item: {
  id: number;
  external_id: string | null;
  account_iban: string | null;
  account_number: string | null;
  bank_code: string | null;
  transaction_date: string;
  booked_date: string | null;
  amount: number;
  currency: string;
  variable_symbol: string | null;
  constant_symbol: string | null;
  specific_symbol: string | null;
  counterparty_name: string | null;
  counterparty_account: string | null;
  counterparty_iban: string | null;
  message: string | null;
  raw_payload: string | null;
  direction: string;
  status: string;
  created_at: string;
  updated_at: string;
}): AccountingNewBankTransactionListItem {
  return {
    id: item.id,
    externalId: item.external_id,
    accountIban: item.account_iban,
    accountNumber: item.account_number,
    bankCode: item.bank_code,
    transactionDate: item.transaction_date,
    bookedDate: item.booked_date,
    amount: item.amount,
    currency: item.currency,
    variableSymbol: item.variable_symbol,
    constantSymbol: item.constant_symbol,
    specificSymbol: item.specific_symbol,
    counterpartyName: item.counterparty_name,
    counterpartyAccount: item.counterparty_account,
    counterpartyIban: item.counterparty_iban,
    message: item.message,
    rawPayload: item.raw_payload,
    direction: item.direction,
    status: item.status,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function mapPaymentMatchSummary(item: {
  id: number;
  bank_transaction_id: number;
  invoice_id: number | null;
  expense_id: number | null;
  invoice_payment_id: number | null;
  expense_payment_id: number | null;
  match_type: string;
  confidence: number;
  status: string;
  reason: string | null;
  created_at: string;
  applied_at: string | null;
}): AccountingNewPaymentMatchListItem {
  return {
    id: item.id,
    bankTransactionId: item.bank_transaction_id,
    invoiceId: item.invoice_id,
    expenseId: item.expense_id,
    invoicePaymentId: item.invoice_payment_id,
    expensePaymentId: item.expense_payment_id,
    matchType: item.match_type,
    confidence: item.confidence,
    status: item.status,
    reason: item.reason,
    createdAt: item.created_at,
    appliedAt: item.applied_at,
  };
}

function mapPaymentMatchDashboardItem(item: {
  id: number;
  bank_transaction_id: number;
  invoice_id: number | null;
  expense_id: number | null;
  invoice_payment_id: number | null;
  expense_payment_id: number | null;
  match_type: string;
  confidence: number;
  status: string;
  reason: string | null;
  created_at: string;
  applied_at: string | null;
  bank_transaction: {
    id: number;
    transaction_date: string;
    booked_date: string | null;
    amount: number;
    currency: string;
    direction: string;
    variable_symbol: string | null;
    message: string | null;
    status: string;
    counterparty_name: string | null;
  };
  candidate: {
    invoice_id: number | null;
    expense_id: number | null;
    document_number: string | null;
    variable_symbol: string | null;
    counterparty_name: string | null;
    total: number | null;
    remaining_amount: number | null;
    currency: string | null;
  };
}): AccountingNewPaymentMatchDashboardItem {
  return {
    ...mapPaymentMatchSummary(item),
    bankTransaction: {
      id: item.bank_transaction.id,
      transactionDate: item.bank_transaction.transaction_date,
      bookedDate: item.bank_transaction.booked_date,
      amount: item.bank_transaction.amount,
      currency: item.bank_transaction.currency,
      direction: item.bank_transaction.direction,
      variableSymbol: item.bank_transaction.variable_symbol,
      message: item.bank_transaction.message,
      status: item.bank_transaction.status,
      counterpartyName: item.bank_transaction.counterparty_name,
    },
    candidate: {
      invoiceId: item.candidate.invoice_id,
      expenseId: item.candidate.expense_id,
      documentNumber: item.candidate.document_number,
      variableSymbol: item.candidate.variable_symbol,
      counterpartyName: item.candidate.counterparty_name,
      total: item.candidate.total,
      remainingAmount: item.candidate.remaining_amount,
      currency: item.candidate.currency,
    },
  };
}

function mapAuditEventSummary(item: {
  id: number;
  event_type: string;
  entity_type: string;
  entity_id: number;
  invoice_id: number | null;
  expense_id: number | null;
  subject_id: number | null;
  supplier_id: number | null;
  bank_transaction_id: number | null;
  payment_match_id: number | null;
  todo_id: number | null;
  attachment_id: number | null;
  recurring_template_id: number | null;
  reminder_email_id: number | null;
  actor_type: string | null;
  actor_id: number | null;
  actor_email: string | null;
  source: string;
  message: string | null;
  metadata: unknown;
  created_at: string;
}): AccountingNewAuditEventSummary {
  return {
    id: item.id,
    eventType: item.event_type,
    entityType: item.entity_type,
    entityId: item.entity_id,
    invoiceId: item.invoice_id,
    expenseId: item.expense_id,
    subjectId: item.subject_id,
    supplierId: item.supplier_id,
    bankTransactionId: item.bank_transaction_id,
    paymentMatchId: item.payment_match_id,
    todoId: item.todo_id,
    attachmentId: item.attachment_id,
    recurringTemplateId: item.recurring_template_id,
    reminderEmailId: item.reminder_email_id,
    actorType: item.actor_type,
    actorId: item.actor_id,
    actorEmail: item.actor_email,
    source: item.source,
    message: item.message,
    metadata: item.metadata,
    createdAt: item.created_at,
  };
}

function mapRecurringTemplateItem(item: {
  id: number;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}): AccountingNewRecurringTemplateItem {
  return {
    id: item.id,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    lineTotal: item.line_total,
  };
}

function mapRecurringTemplateSummary(item: {
  id: number;
  template_type: string;
  document_kind: string | null;
  subject_id: number | null;
  supplier_id: number | null;
  name: string;
  status: string;
  recurrence_interval: string;
  recurrence_count: number;
  next_run_date: string;
  last_run_date: string | null;
  business_mode: string | null;
  tax_mode: string | null;
  currency: string;
  vat_rate: number | null;
  note: string | null;
  payment_method: string | null;
  bank_account_number: string | null;
  bank_account_prefix: string | null;
  bank_code: string | null;
  bank_iban: string | null;
  created_at: string;
  updated_at: string;
  items: Array<{
    id: number;
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
}): AccountingNewRecurringTemplateSummary {
  return {
    id: item.id,
    templateType: item.template_type,
    documentKind: item.document_kind,
    subjectId: item.subject_id,
    supplierId: item.supplier_id,
    name: item.name,
    status: item.status,
    recurrenceInterval: item.recurrence_interval,
    recurrenceCount: item.recurrence_count,
    nextRunDate: item.next_run_date,
    lastRunDate: item.last_run_date,
    businessMode: item.business_mode,
    taxMode: item.tax_mode,
    currency: item.currency,
    vatRate: item.vat_rate,
    note: item.note,
    paymentMethod: item.payment_method,
    bankAccountNumber: item.bank_account_number,
    bankAccountPrefix: item.bank_account_prefix,
    bankCode: item.bank_code,
    bankIban: item.bank_iban,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    items: item.items.map(mapRecurringTemplateItem),
  };
}

function mapRecurringGenerationSummary(item: {
  id: number;
  template_id: number;
  generated_invoice_id: number | null;
  generated_expense_id: number | null;
  generated_at: string;
  run_date: string;
  status: string;
  message: string | null;
}): AccountingNewRecurringGenerationListItem {
  return {
    id: item.id,
    templateId: item.template_id,
    generatedInvoiceId: item.generated_invoice_id,
    generatedExpenseId: item.generated_expense_id,
    generatedAt: item.generated_at,
    runDate: item.run_date,
    status: item.status,
    message: item.message,
  };
}

function mapAttachmentSummary(item: {
  id: number;
  invoice_id: number | null;
  expense_id: number | null;
  todo_id: number | null;
  bank_transaction_id: number | null;
  attachment_type: string;
  status: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  checksum_sha256: string | null;
  note: string | null;
  created_at: string;
}): AccountingNewAttachmentSummary {
  return {
    id: item.id,
    invoiceId: item.invoice_id,
    expenseId: item.expense_id,
    todoId: item.todo_id,
    bankTransactionId: item.bank_transaction_id,
    attachmentType: item.attachment_type,
    status: item.status,
    originalFilename: item.original_filename,
    contentType: item.content_type,
    sizeBytes: item.size_bytes,
    checksumSha256: item.checksum_sha256,
    note: item.note,
    createdAt: item.created_at,
  };
}

function mapSubjectSummary(item: {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  address: string;
  ico: string | null;
  dic: string | null;
  data_box: string | null;
  country: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}): AccountingNewSubjectSummary {
  return {
    id: item.id,
    name: item.name,
    email: item.email,
    phone: item.phone,
    address: item.address,
    ico: item.ico,
    dic: item.dic,
    dataBox: item.data_box,
    country: item.country,
    note: item.note,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function mapSupplierSummary(item: {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  address: string;
  ico: string | null;
  dic: string | null;
  data_box: string | null;
  country: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}): AccountingNewSupplierListItem {
  return {
    id: item.id,
    name: item.name,
    email: item.email,
    phone: item.phone,
    address: item.address,
    ico: item.ico,
    dic: item.dic,
    dataBox: item.data_box,
    country: item.country,
    note: item.note,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function formatFastApiErrorDetail(detail: unknown): string | null {
  if (typeof detail === "string") {
    const trimmed = detail.trim();
    return trimmed || null;
  }

  if (!Array.isArray(detail)) {
    return null;
  }

  const messages = detail
    .map((item) => {
      if (!item || typeof item !== "object" || !("msg" in item)) {
        return null;
      }

      const msg = String((item as { msg: unknown }).msg).trim();
      return msg || null;
    })
    .filter((message): message is string => Boolean(message));

  return messages.length > 0 ? messages.join(" ") : null;
}

async function buildApiError(resource: string, response: Response): Promise<AccountingNewApiError> {
  let message = `Nepodařilo se načíst data (chyba ${response.status}).`;

  try {
    const payload = (await response.json()) as { detail?: unknown };
    const formattedDetail = formatFastApiErrorDetail(payload.detail);
    if (formattedDetail) {
      message = formattedDetail;
    }
  } catch {
    if (response.status === 401) {
      message = "Pro zobrazení účetnictví se prosím přihlaste.";
    } else if (response.status === 404) {
      message = "Požadovaný záznam nebyl nalezen.";
    }
  }

  if (response.status === 401) {
    message = "Pro zobrazení účetnictví se prosím přihlaste.";
  }

  return {
    resource,
    message,
    status: response.status,
    requiresLogin: response.status === 401,
  };
}

function buildNetworkError(resource: string, error: unknown): AccountingNewApiError {
  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      resource,
      message: "Načítání bylo přerušeno.",
      status: null,
      requiresLogin: false,
    };
  }

  return {
    resource,
    message: error instanceof Error ? error.message : "Nepodařilo se načíst data kvůli síťové chybě.",
    status: null,
    requiresLogin: false,
  };
}

async function fetchAccountingNewJson<T>(resource: string, path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;

  try {
    response = await fetch(adminApiUrl(`${ACCOUNTING_NEW_INVOICES_BASE}${path}`), {
      ...apiFetchOptions,
      cache: "no-store",
      signal,
    });
  } catch (error) {
    throw new AccountingNewRequestError(buildNetworkError(resource, error));
  }

  if (!response.ok) {
    throw new AccountingNewRequestError(await buildApiError(resource, response));
  }

  return (await response.json()) as T;
}

async function mutateAccountingNewJson<T>(
  resource: string,
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(adminApiUrl(`${ACCOUNTING_NEW_INVOICES_BASE}${path}`), {
      ...apiFetchOptions,
      method,
      cache: "no-store",
      signal,
      headers: {
        ...apiFetchOptions.headers,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new AccountingNewRequestError(buildNetworkError(resource, error));
  }

  if (!response.ok) {
    throw new AccountingNewRequestError(await buildApiError(resource, response));
  }

  return (await response.json()) as T;
}

function mapDocumentDefaults(item: {
  document_kind: string;
  suggested_invoice_number: string;
  suggested_variable_symbol: string;
}): AccountingNewDocumentDefaults {
  return {
    documentKind: item.document_kind,
    suggestedInvoiceNumber: item.suggested_invoice_number,
    suggestedVariableSymbol: item.suggested_variable_symbol,
  };
}

type AccountingNewDocumentDetailApi = Parameters<typeof mapDocumentDetail>[0];

function isOpenTodo(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized !== "done" && normalized !== "completed" && normalized !== "cancelled" && normalized !== "canceled";
}

function isOverdueTodo(todo: AccountingNewTodoSummary): boolean {
  if (!isOpenTodo(todo.status)) {
    return false;
  }

  const dueAt = Date.parse(todo.dueDate);
  if (Number.isNaN(dueAt)) {
    return false;
  }

  return dueAt < Date.now();
}

function matchesDocumentFilters(document: AccountingNewDocumentListItem, filters: AccountingNewDocumentFilters): boolean {
  const query = normalizeSearchText(filters.query);
  if (query) {
    const haystack = [
      document.invoiceNumber,
      document.variableSymbol,
      document.customerName,
      document.customerEmail,
      document.documentKind,
    ]
      .map(normalizeSearchText)
      .join(" ");

    if (!haystack.includes(query)) {
      return false;
    }
  }

  if (filters.documentKind && filters.documentKind !== "all" && document.documentKind !== filters.documentKind) {
    return false;
  }

  if (filters.paymentStatus && filters.paymentStatus !== "all" && document.paymentStatus !== filters.paymentStatus) {
    return false;
  }

  if (filters.effectiveStatus && filters.effectiveStatus !== "all" && document.effectiveStatus !== filters.effectiveStatus) {
    return false;
  }

  return true;
}

function matchesExpenseFilters(expense: AccountingNewExpenseListItem, filters: AccountingNewExpenseFilters): boolean {
  const query = normalizeSearchText(filters.query);
  if (query) {
    const haystack = [
      expense.expenseNumber,
      expense.variableSymbol,
      expense.supplierName,
      expense.supplierEmail,
      expense.supplierIco,
      expense.supplierDic,
    ]
      .map(normalizeSearchText)
      .join(" ");

    if (!haystack.includes(query)) {
      return false;
    }
  }

  if (filters.supplierId && filters.supplierId !== "all" && expense.supplierId !== filters.supplierId) {
    return false;
  }

  if (filters.paymentStatus && filters.paymentStatus !== "all" && expense.paymentStatus !== filters.paymentStatus) {
    return false;
  }

  if (filters.expenseStatus && filters.expenseStatus !== "all" && expense.status !== filters.expenseStatus) {
    return false;
  }

  return true;
}

function matchesSupplierFilters(supplier: AccountingNewSupplierListItem, filters: AccountingNewSupplierFilters): boolean {
  const query = normalizeSearchText(filters.query);
  if (query) {
    const haystack = [
      supplier.name,
      supplier.email,
      supplier.phone,
      supplier.ico,
      supplier.dic,
      supplier.country,
    ]
      .map(normalizeSearchText)
      .join(" ");

    if (!haystack.includes(query)) {
      return false;
    }
  }

  if (filters.country && filters.country !== "all" && supplier.country !== filters.country) {
    return false;
  }

  return true;
}

function matchesTodoFilters(todo: AccountingNewTodoSummary, filters: AccountingNewTodoFilters): boolean {
  const query = normalizeSearchText(filters.query);
  if (query) {
    const haystack = [todo.title, todo.message, todo.todoType, todo.status]
      .map(normalizeSearchText)
      .join(" ");
    if (!haystack.includes(query)) {
      return false;
    }
  }

  if (filters.status && filters.status !== "all" && todo.status !== filters.status) {
    return false;
  }

  if (filters.todoType && filters.todoType !== "all" && todo.todoType !== filters.todoType) {
    return false;
  }

  return true;
}

function matchesReminderEmailFilters(
  email: AccountingNewReminderEmailListItem,
  filters: AccountingNewReminderEmailFilters,
): boolean {
  const query = normalizeSearchText(filters.query);
  if (query) {
    const haystack = [
      email.recipientEmail,
      email.subject,
      email.message,
      email.invoiceNumber,
      email.reminderType,
      email.status,
    ]
      .map(normalizeSearchText)
      .join(" ");
    if (!haystack.includes(query)) {
      return false;
    }
  }

  if (filters.status && filters.status !== "all" && email.status !== filters.status) {
    return false;
  }

  if (filters.reminderType && filters.reminderType !== "all" && email.reminderType !== filters.reminderType) {
    return false;
  }

  return true;
}

function mapReminderEmailListItem(
  item: {
    id: number;
    invoice_id: number;
    todo_id: number | null;
    reminder_type: string;
    status: string;
    recipient_email: string;
    subject: string;
    message: string;
    sent_at: string | null;
    error_message: string | null;
    created_at: string;
  },
  invoiceNumber: string | null,
): AccountingNewReminderEmailListItem {
  return {
    id: item.id,
    invoiceId: item.invoice_id,
    invoiceNumber,
    todoId: item.todo_id,
    reminderType: item.reminder_type,
    status: item.status,
    recipientEmail: item.recipient_email,
    subject: item.subject,
    message: item.message,
    sentAt: item.sent_at,
    errorMessage: item.error_message,
    createdAt: item.created_at,
  };
}

function matchesBankTransactionFilters(
  transaction: AccountingNewBankTransactionListItem,
  filters: AccountingNewBankTransactionFilters,
): boolean {
  const query = normalizeSearchText(filters.query);
  if (query) {
    const haystack = [
      transaction.externalId,
      transaction.counterpartyName,
      transaction.counterpartyAccount,
      transaction.counterpartyIban,
      transaction.variableSymbol,
      transaction.constantSymbol,
      transaction.specificSymbol,
      transaction.message,
      transaction.direction,
      transaction.status,
    ]
      .map(normalizeSearchText)
      .join(" ");

    if (!haystack.includes(query)) {
      return false;
    }
  }

  if (filters.direction && filters.direction !== "all" && transaction.direction !== filters.direction) {
    return false;
  }

  if (filters.status && filters.status !== "all" && transaction.status !== filters.status) {
    return false;
  }

  return true;
}

function matchesRecurringTemplateFilters(
  template: AccountingNewRecurringTemplateSummary,
  filters: AccountingNewRecurringTemplateFilters,
): boolean {
  const query = normalizeSearchText(filters.query);
  if (query) {
    const haystack = [
      template.name,
      template.templateType,
      template.documentKind,
      template.status,
      template.note,
      template.currency,
    ]
      .map(normalizeSearchText)
      .join(" ");

    if (!haystack.includes(query)) {
      return false;
    }
  }

  if (filters.templateType && filters.templateType !== "all" && template.templateType !== filters.templateType) {
    return false;
  }

  if (filters.status && filters.status !== "all" && template.status !== filters.status) {
    return false;
  }

  if (filters.documentKind && filters.documentKind !== "all" && template.documentKind !== filters.documentKind) {
    return false;
  }

  return true;
}

function matchesAttachmentFilters(
  attachment: AccountingNewAttachmentSummary,
  filters: AccountingNewAttachmentFilters,
): boolean {
  const query = normalizeSearchText(filters.query);
  if (query) {
    const haystack = [
      attachment.originalFilename,
      attachment.contentType,
      attachment.attachmentType,
      attachment.status,
      attachment.note,
      attachment.checksumSha256,
    ]
      .map(normalizeSearchText)
      .join(" ");

    if (!haystack.includes(query)) {
      return false;
    }
  }

  if (filters.status && filters.status !== "all" && attachment.status !== filters.status) {
    return false;
  }

  if (filters.attachmentType && filters.attachmentType !== "all" && attachment.attachmentType !== filters.attachmentType) {
    return false;
  }

  return true;
}

export async function listAccountingNewInvoices(
  params: AccountingNewListParams = {},
): Promise<AccountingNewDocumentListItem[]> {
  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      invoice_number: string;
      variable_symbol: string;
      document_kind: string;
      issue_date: string;
      due_date: string;
      customer_name: string;
      customer_email: string;
      currency: string;
      total: number;
      total_paid: number;
      remaining_amount: number;
      status: string;
      payment_status: string;
      effective_status: string;
      created_at: string;
    }>
  >("documents", "", params.signal);

  return data.map(mapDocumentListItem);
}

export async function listAccountingNewDocuments(
  filters: AccountingNewDocumentFilters = {},
  params: AccountingNewListParams = {},
): Promise<AccountingNewDocumentListItem[]> {
  const documents = await listAccountingNewInvoices(params);
  return documents.filter((document) => matchesDocumentFilters(document, filters));
}

export async function getAccountingNewDocument(
  id: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewDocumentDetail> {
  const normalizedId = normalizeDocumentId(id);
  const data = await fetchAccountingNewJson<{
    id: number;
    invoice_number: string;
    variable_symbol: string;
    document_kind: string;
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
    subject_id: number | null;
    note: string | null;
    business_mode: string;
    tax_mode: string;
    currency: string;
    subtotal: number;
    vat_rate: number | null;
    vat_amount: number;
    total: number;
    status: string;
    total_paid: number;
    remaining_amount: number;
    payment_status: string;
    effective_status: string;
    reverse_charge_reason: string | null;
    reverse_charge_text: string | null;
    payment_method: string;
    bank_account_number: string;
    bank_account_prefix: string | null;
    bank_code: string;
    bank_iban: string;
    created_at: string;
    items: Array<{
      id: number;
      description: string;
      quantity: number;
      unit_price: number;
      line_total: number;
    }>;
    payments: Array<{
      id: number;
      invoice_id: number;
      amount: number;
      paid_at: string;
      payment_method: string;
      note: string | null;
      created_at: string;
    }>;
  }>("document-detail", `/${normalizedId}`, params.signal);

  return mapDocumentDetail(data);
}

export async function getAccountingNewDocumentRelations(
  id: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewDocumentRelationsSummary> {
  const normalizedId = normalizeDocumentId(id);
  const data = await fetchAccountingNewJson<{
    invoice_id: number;
    outgoing_relations: Array<{
      id: number;
      relation_type: string;
      source_invoice_id: number;
      target_invoice_id: number;
      source_payment_id: number | null;
      created_at: string;
      source_document: {
        id: number;
        document_kind: string;
        invoice_number: string;
        variable_symbol: string;
        issue_date: string;
        due_date: string;
        customer_name: string;
        currency: string;
        total: number;
        effective_status: string;
        payment_status: string;
      } | null;
      target_document: {
        id: number;
        document_kind: string;
        invoice_number: string;
        variable_symbol: string;
        issue_date: string;
        due_date: string;
        customer_name: string;
        currency: string;
        total: number;
        effective_status: string;
        payment_status: string;
      } | null;
      source_payment: {
        id: number;
        amount: number;
        paid_at: string;
        payment_method: string;
        note: string | null;
      } | null;
    }>;
    incoming_relations: Array<{
      id: number;
      relation_type: string;
      source_invoice_id: number;
      target_invoice_id: number;
      source_payment_id: number | null;
      created_at: string;
      source_document: {
        id: number;
        document_kind: string;
        invoice_number: string;
        variable_symbol: string;
        issue_date: string;
        due_date: string;
        customer_name: string;
        currency: string;
        total: number;
        effective_status: string;
        payment_status: string;
      } | null;
      target_document: {
        id: number;
        document_kind: string;
        invoice_number: string;
        variable_symbol: string;
        issue_date: string;
        due_date: string;
        customer_name: string;
        currency: string;
        total: number;
        effective_status: string;
        payment_status: string;
      } | null;
      source_payment: {
        id: number;
        amount: number;
        paid_at: string;
        payment_method: string;
        note: string | null;
      } | null;
    }>;
    all_relations: Array<{
      id: number;
      relation_type: string;
      source_invoice_id: number;
      target_invoice_id: number;
      source_payment_id: number | null;
      created_at: string;
      source_document: {
        id: number;
        document_kind: string;
        invoice_number: string;
        variable_symbol: string;
        issue_date: string;
        due_date: string;
        customer_name: string;
        currency: string;
        total: number;
        effective_status: string;
        payment_status: string;
      } | null;
      target_document: {
        id: number;
        document_kind: string;
        invoice_number: string;
        variable_symbol: string;
        issue_date: string;
        due_date: string;
        customer_name: string;
        currency: string;
        total: number;
        effective_status: string;
        payment_status: string;
      } | null;
      source_payment: {
        id: number;
        amount: number;
        paid_at: string;
        payment_method: string;
        note: string | null;
      } | null;
    }>;
  }>("document-relations", `/${normalizedId}/relations`, params.signal);

  return mapDocumentRelationsSummary(data);
}

export async function getAccountingNewDocumentPayments(
  id: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewPaymentSummary[]> {
  const normalizedId = normalizeDocumentId(id);
  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      invoice_id: number;
      amount: number;
      paid_at: string;
      payment_method: string;
      note: string | null;
      created_at: string;
    }>
  >("document-payments", `/${normalizedId}/payments`, params.signal);

  return data.map(mapPaymentSummary);
}

export async function getAccountingNewDocumentAuditEvents(
  id: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewAuditEventSummary[]> {
  const normalizedId = normalizeDocumentId(id);
  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      event_type: string;
      entity_type: string;
      entity_id: number;
      invoice_id: number | null;
      expense_id: number | null;
      subject_id: number | null;
      supplier_id: number | null;
      bank_transaction_id: number | null;
      payment_match_id: number | null;
      todo_id: number | null;
      attachment_id: number | null;
      recurring_template_id: number | null;
      reminder_email_id: number | null;
      actor_type: string | null;
      actor_id: number | null;
      actor_email: string | null;
      source: string;
      message: string | null;
      metadata: unknown;
      created_at: string;
    }>
  >("document-audit-events", `/${normalizedId}/audit-events`, params.signal);

  return data.map(mapAuditEventSummary);
}

export async function listAccountingNewExpenses(
  filters: AccountingNewExpenseFilters = {},
  params: AccountingNewListParams = {},
): Promise<AccountingNewExpenseListItem[]> {
  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      expense_number: string;
      variable_symbol: string;
      supplier_id: number | null;
      supplier_name: string;
      supplier_email: string;
      supplier_phone: string | null;
      supplier_address: string;
      supplier_ico: string | null;
      supplier_dic: string | null;
      supplier_data_box: string | null;
      supplier_country: string | null;
      currency: string;
      issue_date: string;
      received_date: string;
      due_date: string;
      taxable_supply_date: string;
      subtotal: number;
      vat_rate: number | null;
      vat_amount: number;
      total: number;
      note: string | null;
      payment_method: string;
      bank_account_number: string;
      bank_account_prefix: string | null;
      bank_code: string;
      bank_iban: string | null;
      total_paid: number;
      remaining_amount: number;
      status: string;
      payment_status: string;
      created_at: string;
      updated_at: string;
    }>
  >("expenses", "/expenses", params.signal);

  return data.map(mapExpenseSummary).filter((expense) => matchesExpenseFilters(expense, filters));
}

export async function getAccountingNewExpense(
  id: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewExpenseDetail> {
  const normalizedId = normalizeExpenseId(id);
  const data = await fetchAccountingNewJson<{
    id: number;
    expense_number: string;
    variable_symbol: string;
    supplier_id: number | null;
    supplier_name: string;
    supplier_email: string;
    supplier_phone: string | null;
    supplier_address: string;
    supplier_ico: string | null;
    supplier_dic: string | null;
    supplier_data_box: string | null;
    supplier_country: string | null;
    issue_date: string;
    received_date: string;
    due_date: string;
    taxable_supply_date: string;
    currency: string;
    subtotal: number;
    vat_rate: number | null;
    vat_amount: number;
    total: number;
    status: string;
    note: string | null;
    payment_method: string;
    bank_account_number: string;
    bank_account_prefix: string | null;
    bank_code: string;
    bank_iban: string | null;
    total_paid: number;
    remaining_amount: number;
    payment_status: string;
    created_at: string;
    updated_at: string;
    items: Array<{
      id: number;
      description: string;
      quantity: number;
      unit_price: number;
      line_total: number;
    }>;
    payments: Array<{
      id: number;
      expense_id: number;
      amount: number;
      paid_at: string;
      payment_method: string;
      note: string | null;
      created_at: string;
    }>;
  }>("expense-detail", `/expenses/${normalizedId}`, params.signal);

  return mapExpenseDetail(data);
}

export async function getAccountingNewExpensePayments(
  id: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewExpensePaymentSummary[]> {
  const normalizedId = normalizeExpenseId(id);
  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      expense_id: number;
      amount: number;
      paid_at: string;
      payment_method: string;
      note: string | null;
      created_at: string;
    }>
  >("expense-payments", `/expenses/${normalizedId}/payments`, params.signal);

  return data.map(mapExpensePaymentSummary);
}

export async function getAccountingNewExpenseAuditEvents(
  id: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewAuditEventSummary[]> {
  const normalizedId = normalizeExpenseId(id);
  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      event_type: string;
      entity_type: string;
      entity_id: number;
      invoice_id: number | null;
      expense_id: number | null;
      subject_id: number | null;
      supplier_id: number | null;
      bank_transaction_id: number | null;
      payment_match_id: number | null;
      todo_id: number | null;
      attachment_id: number | null;
      recurring_template_id: number | null;
      reminder_email_id: number | null;
      actor_type: string | null;
      actor_id: number | null;
      actor_email: string | null;
      source: string;
      message: string | null;
      metadata: unknown;
      created_at: string;
    }>
  >("expense-audit-events", `/expenses/${normalizedId}/audit-events`, params.signal);

  return data.map(mapAuditEventSummary);
}

export async function listAccountingNewTodos(
  filters: AccountingNewTodoFilters = {},
  params: AccountingNewListParams = {},
): Promise<AccountingNewTodoSummary[]> {
  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      invoice_id: number | null;
      expense_id: number | null;
      todo_type: string;
      status: string;
      title: string;
      message: string | null;
      due_date: string;
      created_at: string;
      updated_at: string;
      completed_at: string | null;
    }>
  >("todos", "/todos", params.signal);

  return data.map(mapTodoSummary).filter((todo) => matchesTodoFilters(todo, filters));
}

export async function getAccountingNewTodo(
  todoId: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewTodoDetail> {
  const id = normalizeTodoId(todoId);
  const data = await fetchAccountingNewJson<{
    id: number;
    invoice_id: number | null;
    expense_id: number | null;
    todo_type: string;
    status: string;
    title: string;
    message: string | null;
    due_date: string;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
  }>("todo-detail", `/todos/${id}`, params.signal);

  return mapTodoSummary(data);
}

const REMINDER_EMAIL_BATCH_SIZE = 5;

async function fetchInvoiceReminderEmails(
  invoiceId: number,
  invoiceNumber: string | null,
  signal?: AbortSignal,
): Promise<AccountingNewReminderEmailListItem[]> {
  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      invoice_id: number;
      todo_id: number | null;
      reminder_type: string;
      status: string;
      recipient_email: string;
      subject: string;
      message: string;
      sent_at: string | null;
      error_message: string | null;
      created_at: string;
    }>
  >("reminder-emails", `/${invoiceId}/reminder-emails`, signal);

  return data.map((item) => mapReminderEmailListItem(item, invoiceNumber));
}

export async function listAccountingNewReminderEmails(
  filters: AccountingNewReminderEmailFilters = {},
  params: AccountingNewListParams = {},
): Promise<AccountingNewReminderEmailListItem[]> {
  const invoices = await listAccountingNewInvoices(params);
  const aggregated: AccountingNewReminderEmailListItem[] = [];

  for (let index = 0; index < invoices.length; index += REMINDER_EMAIL_BATCH_SIZE) {
    const batch = invoices.slice(index, index + REMINDER_EMAIL_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (invoice) => {
        try {
          return await fetchInvoiceReminderEmails(invoice.id, invoice.invoiceNumber, params.signal);
        } catch {
          return [] as AccountingNewReminderEmailListItem[];
        }
      }),
    );

    for (const items of batchResults) {
      aggregated.push(...items);
    }
  }

  return aggregated
    .filter((email) => matchesReminderEmailFilters(email, filters))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getAccountingNewReminderEmail(
  reminderEmailId: number | string,
  invoiceId?: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewReminderEmailDetail> {
  const id = normalizeReminderEmailId(reminderEmailId);

  if (invoiceId !== undefined && invoiceId !== null && invoiceId !== "") {
    const normalizedInvoiceId = normalizeDocumentId(invoiceId);
    const invoices = await listAccountingNewInvoices(params);
    const invoice = invoices.find((item) => item.id === Number(normalizedInvoiceId));
    const emails = await fetchInvoiceReminderEmails(
      Number(normalizedInvoiceId),
      invoice?.invoiceNumber ?? null,
      params.signal,
    );
    const match = emails.find((item) => item.id === Number(id));
    if (!match) {
      throw new AccountingNewRequestError({
        resource: "reminder-email-detail",
        message: "Požadovaný upomínkový e-mail nebyl nalezen.",
        status: 404,
        requiresLogin: false,
      });
    }
    return match;
  }

  const emails = await listAccountingNewReminderEmails({}, params);
  const match = emails.find((item) => item.id === Number(id));
  if (!match) {
    throw new AccountingNewRequestError({
      resource: "reminder-email-detail",
      message: "Požadovaný upomínkový e-mail nebyl nalezen.",
      status: 404,
      requiresLogin: false,
    });
  }
  return match;
}

export async function listAccountingNewBankTransactions(
  filters: AccountingNewBankTransactionFilters = {},
  params: AccountingNewListParams = {},
): Promise<AccountingNewBankTransactionListItem[]> {
  const searchParams = new URLSearchParams();
  if (filters.status && filters.status !== "all") {
    searchParams.set("status", filters.status);
  }
  if (filters.direction && filters.direction !== "all") {
    searchParams.set("direction", filters.direction);
  }

  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      external_id: string | null;
      account_iban: string | null;
      account_number: string | null;
      bank_code: string | null;
      transaction_date: string;
      booked_date: string | null;
      amount: number;
      currency: string;
      variable_symbol: string | null;
      constant_symbol: string | null;
      specific_symbol: string | null;
      counterparty_name: string | null;
      counterparty_account: string | null;
      counterparty_iban: string | null;
      message: string | null;
      raw_payload: string | null;
      direction: string;
      status: string;
      created_at: string;
      updated_at: string;
    }>
  >(
    "bank-transactions",
    `/bank-transactions${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`,
    params.signal,
  );

  return data.map(mapBankTransactionSummary).filter((transaction) => matchesBankTransactionFilters(transaction, filters));
}

export async function getAccountingNewBankTransaction(
  id: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewBankTransactionDetail> {
  const normalizedId = normalizeBankTransactionId(id);
  const data = await fetchAccountingNewJson<{
    id: number;
    external_id: string | null;
    account_iban: string | null;
    account_number: string | null;
    bank_code: string | null;
    transaction_date: string;
    booked_date: string | null;
    amount: number;
    currency: string;
    variable_symbol: string | null;
    constant_symbol: string | null;
    specific_symbol: string | null;
    counterparty_name: string | null;
    counterparty_account: string | null;
    counterparty_iban: string | null;
    message: string | null;
    raw_payload: string | null;
    direction: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>("bank-transaction-detail", `/bank-transactions/${normalizedId}`, params.signal);

  return mapBankTransactionSummary(data);
}

export async function listAccountingNewBankTransactionMatches(
  id: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewPaymentMatchListItem[]> {
  const normalizedId = normalizeBankTransactionId(id);
  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      bank_transaction_id: number;
      invoice_id: number | null;
      expense_id: number | null;
      invoice_payment_id: number | null;
      expense_payment_id: number | null;
      match_type: string;
      confidence: number;
      status: string;
      reason: string | null;
      created_at: string;
      applied_at: string | null;
    }>
  >("bank-transaction-matches", `/bank-transactions/${normalizedId}/matches`, params.signal);

  return data.map(mapPaymentMatchSummary);
}

export async function listAccountingNewPaymentMatchesCatalog(
  params: AccountingNewPaymentMatchCatalogParams = {},
): Promise<AccountingNewPaymentMatchDashboardItem[]> {
  const searchParams = new URLSearchParams();
  if (params.status !== undefined) {
    searchParams.set("status", params.status);
  }
  if (params.limit !== undefined) {
    searchParams.set("limit", String(params.limit));
  }
  if (params.offset !== undefined) {
    searchParams.set("offset", String(params.offset));
  }
  const query = searchParams.toString();
  const path = query ? `/bank-transactions/matches?${query}` : "/bank-transactions/matches";
  const data = await fetchAccountingNewJson<Parameters<typeof mapPaymentMatchDashboardItem>[0][]>(
    "payment-matches-catalog",
    path,
    params.signal,
  );

  return data.map(mapPaymentMatchDashboardItem);
}

export async function listAccountingNewAuditEvents(
  params: AccountingNewListParams = {},
): Promise<AccountingNewAuditEventSummary[]> {
  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      event_type: string;
      entity_type: string;
      entity_id: number;
      invoice_id: number | null;
      expense_id: number | null;
      subject_id: number | null;
      supplier_id: number | null;
      bank_transaction_id: number | null;
      payment_match_id: number | null;
      todo_id: number | null;
      attachment_id: number | null;
      recurring_template_id: number | null;
      reminder_email_id: number | null;
      actor_type: string | null;
      actor_id: number | null;
      actor_email: string | null;
      source: string;
      message: string | null;
      metadata: unknown;
      created_at: string;
    }>
  >("audit-events", "/audit-events", params.signal);

  return data.map(mapAuditEventSummary);
}

export async function listAccountingNewRecurringTemplates(
  filters: AccountingNewRecurringTemplateFilters = {},
  params: AccountingNewListParams = {},
): Promise<AccountingNewRecurringTemplateSummary[]> {
  const searchParams = new URLSearchParams();
  if (filters.templateType && filters.templateType !== "all") {
    searchParams.set("template_type", filters.templateType);
  }
  if (filters.status && filters.status !== "all") {
    searchParams.set("status", filters.status);
  }

  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      template_type: string;
      document_kind: string | null;
      subject_id: number | null;
      supplier_id: number | null;
      name: string;
      status: string;
      recurrence_interval: string;
      recurrence_count: number;
      next_run_date: string;
      last_run_date: string | null;
      business_mode: string | null;
      tax_mode: string | null;
      currency: string;
      vat_rate: number | null;
      note: string | null;
      payment_method: string | null;
      bank_account_number: string | null;
      bank_account_prefix: string | null;
      bank_code: string | null;
      bank_iban: string | null;
      created_at: string;
      updated_at: string;
      items: Array<{
        id: number;
        description: string;
        quantity: number;
        unit_price: number;
        line_total: number;
      }>;
    }>
  >(
    "recurring-templates",
    `/recurring-templates${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`,
    params.signal,
  );

  return data.map(mapRecurringTemplateSummary).filter((template) => matchesRecurringTemplateFilters(template, filters));
}

export async function getAccountingNewRecurringTemplate(
  id: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewRecurringTemplateDetail> {
  const normalizedId = normalizeRecurringTemplateId(id);
  const data = await fetchAccountingNewJson<{
    id: number;
    template_type: string;
    document_kind: string | null;
    subject_id: number | null;
    supplier_id: number | null;
    name: string;
    status: string;
    recurrence_interval: string;
    recurrence_count: number;
    next_run_date: string;
    last_run_date: string | null;
    business_mode: string | null;
    tax_mode: string | null;
    currency: string;
    vat_rate: number | null;
    note: string | null;
    payment_method: string | null;
    bank_account_number: string | null;
    bank_account_prefix: string | null;
    bank_code: string | null;
    bank_iban: string | null;
    created_at: string;
    updated_at: string;
    items: Array<{
      id: number;
      description: string;
      quantity: number;
      unit_price: number;
      line_total: number;
    }>;
  }>("recurring-detail", `/recurring-templates/${normalizedId}`, params.signal);

  return mapRecurringTemplateSummary(data);
}

export async function listAccountingNewRecurringTemplateGenerations(
  id: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewRecurringGenerationListItem[]> {
  const normalizedId = normalizeRecurringTemplateId(id);
  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      template_id: number;
      generated_invoice_id: number | null;
      generated_expense_id: number | null;
      generated_at: string;
      run_date: string;
      status: string;
      message: string | null;
    }>
  >("recurring-generations", `/recurring-templates/${normalizedId}/generations`, params.signal);

  return data.map(mapRecurringGenerationSummary);
}

export async function listAccountingNewAttachments(
  filters: AccountingNewAttachmentFilters = {},
  params: AccountingNewListParams = {},
): Promise<AccountingNewAttachmentSummary[]> {
  const data = await fetchAccountingNewJson<AccountingNewAttachmentApiItem[]>(
    "attachments",
    buildAttachmentQueryPath(filters),
    params.signal,
  );

  return data.map(mapAttachmentSummary).filter((attachment) => matchesAttachmentFilters(attachment, filters));
}

export async function getAccountingNewAttachment(
  id: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewAttachmentSummary> {
  const normalizedId = normalizeAttachmentId(id);
  const data = await fetchAccountingNewJson<AccountingNewAttachmentApiItem>(
    "attachment-detail",
    `/attachments/${normalizedId}`,
    params.signal,
  );

  return mapAttachmentSummary(data);
}

export async function listAccountingNewAttachmentInbox(
  filters: AccountingNewAttachmentFilters = {},
  params: AccountingNewListParams = {},
): Promise<AccountingNewAttachmentSummary[]> {
  return listAccountingNewAttachments({ ...filters, unlinkedOnly: true }, params);
}

export async function listAccountingNewDocumentAttachments(
  invoiceId: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewAttachmentSummary[]> {
  const normalizedId = normalizeDocumentId(invoiceId);
  return listAccountingNewAttachments({ invoiceId: Number(normalizedId) }, params);
}

export async function listAccountingNewExpenseAttachments(
  expenseId: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewAttachmentSummary[]> {
  const normalizedId = normalizeExpenseId(expenseId);
  return listAccountingNewAttachments({ expenseId: Number(normalizedId) }, params);
}

export async function getAccountingNewAttachmentAuditEvents(
  id: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewAuditEventSummary[]> {
  const normalizedId = normalizeAttachmentId(id);
  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      event_type: string;
      entity_type: string;
      entity_id: number;
      invoice_id: number | null;
      expense_id: number | null;
      subject_id: number | null;
      supplier_id: number | null;
      bank_transaction_id: number | null;
      payment_match_id: number | null;
      todo_id: number | null;
      attachment_id: number | null;
      recurring_template_id: number | null;
      reminder_email_id: number | null;
      actor_type: string | null;
      actor_id: number | null;
      actor_email: string | null;
      source: string;
      message: string | null;
      metadata: unknown;
      created_at: string;
    }>
  >("attachment-audit-events", `/audit-events?attachment_id=${normalizedId}`, params.signal);

  return data.map(mapAuditEventSummary);
}

export async function listAccountingNewSubjects(
  params: AccountingNewListParams = {},
): Promise<AccountingNewSubjectSummary[]> {
  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      name: string;
      email: string;
      phone: string | null;
      address: string;
      ico: string | null;
      dic: string | null;
      data_box: string | null;
      country: string | null;
      note: string | null;
      created_at: string;
      updated_at: string;
    }>
  >("subjects", "/subjects", params.signal);

  return data.map(mapSubjectSummary);
}

export async function listAccountingNewSuppliers(
  filters: AccountingNewSupplierFilters = {},
  params: AccountingNewListParams = {},
): Promise<AccountingNewSupplierListItem[]> {
  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      name: string;
      email: string;
      phone: string | null;
      address: string;
      ico: string | null;
      dic: string | null;
      data_box: string | null;
      country: string | null;
      note: string | null;
      created_at: string;
      updated_at: string;
    }>
  >("suppliers", "/suppliers", params.signal);

  return data.map(mapSupplierSummary).filter((supplier) => matchesSupplierFilters(supplier, filters));
}

export async function getAccountingNewSupplier(
  id: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewSupplierDetail> {
  const normalizedId = normalizeSupplierId(id);
  const data = await fetchAccountingNewJson<{
    id: number;
    name: string;
    email: string;
    phone: string | null;
    address: string;
    ico: string | null;
    dic: string | null;
    data_box: string | null;
    country: string | null;
    note: string | null;
    created_at: string;
    updated_at: string;
  }>("supplier-detail", `/suppliers/${normalizedId}`, params.signal);

  return mapSupplierSummary(data);
}

export async function getAccountingNewDashboardData(
  params: AccountingNewListParams = {},
): Promise<AccountingNewDashboardLoadResult> {
  const dashboard = emptyDashboard();
  const [
    invoicesResult,
    expensesResult,
    todosResult,
    bankTransactionsResult,
    auditEventsResult,
    recurringTemplatesResult,
    attachmentsResult,
    subjectsResult,
    suppliersResult,
  ] = await Promise.allSettled([
    listAccountingNewInvoices(params),
    listAccountingNewExpenses({}, params),
    listAccountingNewTodos({}, params),
    listAccountingNewBankTransactions({}, params),
    listAccountingNewAuditEvents(params),
    listAccountingNewRecurringTemplates({}, params),
    listAccountingNewAttachments({}, params),
    listAccountingNewSubjects(params),
    listAccountingNewSuppliers({}, params),
  ]);
  const partialErrors: AccountingNewApiError[] = [];
  let authRequired = false;

  function applyResult<T>(resource: string, result: PromiseSettledResult<T>, onSuccess: (value: T) => void) {
    if (result.status === "fulfilled") {
      onSuccess(result.value);
      return;
    }

    const apiError =
      result.reason instanceof AccountingNewRequestError
        ? result.reason.apiError
        : buildNetworkError(resource, result.reason);

    if (apiError.message !== "Načítání bylo přerušeno.") {
      partialErrors.push(apiError);
    }

    if (apiError.requiresLogin) {
      authRequired = true;
    }
  }

  applyResult("documents", invoicesResult, (value) => {
    dashboard.invoices = value;
  });
  applyResult("expenses", expensesResult, (value) => {
    dashboard.expenses = value;
  });
  applyResult("todos", todosResult, (value) => {
    dashboard.todos = value;
  });
  applyResult("bank-transactions", bankTransactionsResult, (value) => {
    dashboard.bankTransactions = value;
  });
  applyResult("audit-events", auditEventsResult, (value) => {
    dashboard.auditEvents = value;
  });
  applyResult("recurring-templates", recurringTemplatesResult, (value) => {
    dashboard.recurringTemplates = value;
  });
  applyResult("attachments", attachmentsResult, (value) => {
    dashboard.attachments = value;
  });
  applyResult("subjects", subjectsResult, (value) => {
    dashboard.subjects = value;
  });
  applyResult("suppliers", suppliersResult, (value) => {
    dashboard.suppliers = value;
  });

  dashboard.metrics = {
    documentsLoaded: dashboard.invoices.length,
    documentsWithRemainingBalance: dashboard.invoices.filter((item) => item.remainingAmount > 0).length,
    expensesLoaded: dashboard.expenses.length,
    expensesWithRemainingBalance: dashboard.expenses.filter((item) => item.remainingAmount > 0).length,
    todosLoaded: dashboard.todos.length,
    openTodos: dashboard.todos.filter((item) => isOpenTodo(item.status)).length,
    overdueTodos: dashboard.todos.filter(isOverdueTodo).length,
    bankTransactionsLoaded: dashboard.bankTransactions.length,
    recurringTemplatesLoaded: dashboard.recurringTemplates.length,
    attachmentsLoaded: dashboard.attachments.length,
    auditEventsLoaded: dashboard.auditEvents.length,
    subjectsLoaded: dashboard.subjects.length,
    suppliersLoaded: dashboard.suppliers.length,
  };
  dashboard.lastUpdatedAt = new Date().toISOString();

  return {
    authRequired,
    dashboard,
    partialErrors,
  };
}

export async function getAccountingNewDocumentDefaults(
  documentKind?: string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewDocumentDefaults> {
  const searchParams = new URLSearchParams();
  if (documentKind) {
    searchParams.set("document_kind", documentKind);
  }

  const path = `/defaults${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`;
  const data = await fetchAccountingNewJson<{
    document_kind: string;
    suggested_invoice_number: string;
    suggested_variable_symbol: string;
  }>("document-defaults", path, params.signal);

  return mapDocumentDefaults(data);
}

export async function createAccountingNewDocument(
  payload: AccountingNewDocumentWritePayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewDocumentDetail> {
  const data = await mutateAccountingNewJson<AccountingNewDocumentDetailApi>(
    "document-create",
    "",
    "POST",
    payload,
    params.signal,
  );

  return mapDocumentDetail(data);
}

export async function updateAccountingNewDocument(
  id: number | string,
  payload: AccountingNewDocumentWritePayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewDocumentDetail> {
  const normalizedId = normalizeDocumentId(id);
  const data = await mutateAccountingNewJson<AccountingNewDocumentDetailApi>(
    "document-update",
    `/${normalizedId}`,
    "PUT",
    payload,
    params.signal,
  );

  return mapDocumentDetail(data);
}

export async function finalizeAccountingNewDocument(
  id: number | string,
  payload: AccountingNewDocumentWritePayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewDocumentDetail> {
  return updateAccountingNewDocument(id, { ...payload, status: "issued" }, params);
}

export async function addAccountingNewDocumentPayment(
  id: number | string,
  payload: AccountingNewDocumentPaymentCreatePayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewDocumentDetail> {
  const normalizedId = normalizeDocumentId(id);
  const data = await mutateAccountingNewJson<AccountingNewDocumentDetailApi>(
    "document-payment-create",
    `/${normalizedId}/payments`,
    "POST",
    payload,
    params.signal,
  );

  return mapDocumentDetail(data);
}

function extractPdfFilename(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) {
    return fallback;
  }

  const match = /filename="?([^"]+)"?/i.exec(contentDisposition);
  return match?.[1] ?? fallback;
}

export async function downloadAccountingNewDocumentPdf(id: number | string): Promise<void> {
  const normalizedId = normalizeDocumentId(id);
  const response = await fetch(adminApiUrl(`${ACCOUNTING_NEW_INVOICES_BASE}/${normalizedId}/pdf`), {
    ...apiFetchOptions,
    method: "GET",
    headers: {
      ...apiFetchOptions.headers,
      Accept: "application/pdf",
    },
  });

  if (!response.ok) {
    throw new AccountingNewRequestError(await buildApiError("document-pdf", response));
  }

  const blob = await response.blob();
  const filename = extractPdfFilename(response.headers.get("content-disposition"), `doklad-${normalizedId}.pdf`);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

type AccountingNewSubjectApi = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  address: string;
  ico: string | null;
  dic: string | null;
  data_box: string | null;
  country: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type AccountingNewExpenseDetailApi = Parameters<typeof mapExpenseDetail>[0];

export async function getAccountingNewSubject(
  id: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewSubjectSummary> {
  const normalizedId = normalizeSubjectId(id);
  const data = await fetchAccountingNewJson<AccountingNewSubjectApi>(
    "subject-detail",
    `/subjects/${normalizedId}`,
    params.signal,
  );

  return mapSubjectSummary(data);
}

export async function createAccountingNewSubject(
  payload: AccountingNewSubjectWritePayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewSubjectSummary> {
  const data = await mutateAccountingNewJson<AccountingNewSubjectApi>("subject-create", "/subjects", "POST", payload, params.signal);
  return mapSubjectSummary(data);
}

export async function updateAccountingNewSubject(
  id: number | string,
  payload: AccountingNewSubjectWritePayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewSubjectSummary> {
  const normalizedId = normalizeSubjectId(id);
  const data = await mutateAccountingNewJson<AccountingNewSubjectApi>(
    "subject-update",
    `/subjects/${normalizedId}`,
    "PUT",
    payload,
    params.signal,
  );
  return mapSubjectSummary(data);
}

export async function createAccountingNewSupplier(
  payload: AccountingNewSupplierWritePayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewSupplierDetail> {
  const data = await mutateAccountingNewJson<AccountingNewSubjectApi>("supplier-create", "/suppliers", "POST", payload, params.signal);
  return mapSupplierSummary(data);
}

export async function updateAccountingNewSupplier(
  id: number | string,
  payload: AccountingNewSupplierWritePayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewSupplierDetail> {
  const normalizedId = normalizeSupplierId(id);
  const data = await mutateAccountingNewJson<AccountingNewSubjectApi>(
    "supplier-update",
    `/suppliers/${normalizedId}`,
    "PUT",
    payload,
    params.signal,
  );
  return mapSupplierSummary(data);
}

export async function createAccountingNewExpense(
  payload: AccountingNewExpenseWritePayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewExpenseDetail> {
  const data = await mutateAccountingNewJson<AccountingNewExpenseDetailApi>("expense-create", "/expenses", "POST", payload, params.signal);
  return mapExpenseDetail(data);
}

export async function updateAccountingNewExpense(
  id: number | string,
  payload: AccountingNewExpenseWritePayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewExpenseDetail> {
  const normalizedId = normalizeExpenseId(id);
  const data = await mutateAccountingNewJson<AccountingNewExpenseDetailApi>(
    "expense-update",
    `/expenses/${normalizedId}`,
    "PUT",
    payload,
    params.signal,
  );
  return mapExpenseDetail(data);
}

export async function addAccountingNewExpensePayment(
  id: number | string,
  payload: AccountingNewExpensePaymentCreatePayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewExpenseDetail> {
  const normalizedId = normalizeExpenseId(id);
  const data = await mutateAccountingNewJson<AccountingNewExpenseDetailApi>(
    "expense-payment-create",
    `/expenses/${normalizedId}/payments`,
    "POST",
    payload,
    params.signal,
  );
  return mapExpenseDetail(data);
}

type AccountingNewSettingsApi = {
  owner_email: string;
  issuer_name: string;
  issuer_address: string;
  issuer_city: string;
  issuer_zip: string;
  issuer_ico: string;
  issuer_dic: string;
  issuer_data_box: string | null;
  issuer_email: string | null;
  issuer_phone: string | null;
  default_currency: string;
  default_due_days: number;
  default_note: string | null;
  payment_method: string;
  bank_account_number: string;
  bank_account_prefix: string | null;
  bank_code: string;
  bank_iban: string;
  account_label: string;
};

function mapSettings(item: AccountingNewSettingsApi): AccountingNewSettings {
  return {
    ownerEmail: item.owner_email,
    issuerName: item.issuer_name,
    issuerAddress: item.issuer_address,
    issuerCity: item.issuer_city,
    issuerZip: item.issuer_zip,
    issuerIco: item.issuer_ico,
    issuerDic: item.issuer_dic,
    issuerDataBox: item.issuer_data_box,
    issuerEmail: item.issuer_email,
    issuerPhone: item.issuer_phone,
    defaultCurrency: item.default_currency,
    defaultDueDays: item.default_due_days,
    defaultNote: item.default_note,
    paymentMethod: item.payment_method,
    bankAccountNumber: item.bank_account_number,
    bankAccountPrefix: item.bank_account_prefix,
    bankCode: item.bank_code,
    bankIban: item.bank_iban,
    accountLabel: item.account_label,
  };
}

export async function getAccountingNewSettings(params: AccountingNewListParams = {}): Promise<AccountingNewSettings> {
  const data = await fetchAccountingNewJson<AccountingNewSettingsApi>("settings", "/settings", params.signal);
  return mapSettings(data);
}

export async function updateAccountingNewSettings(
  payload: AccountingNewSettingsWritePayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewSettings> {
  const data = await mutateAccountingNewJson<AccountingNewSettingsApi>(
    "settings-update",
    "/settings",
    "PUT",
    payload,
    params.signal,
  );
  return mapSettings(data);
}

export async function uploadAccountingNewAttachment(
  upload: AccountingNewAttachmentUploadParams,
  params: AccountingNewListParams = {},
): Promise<AccountingNewAttachmentSummary> {
  const formData = new FormData();
  formData.append("file", upload.file);
  formData.append("attachment_type", upload.attachmentType ?? "other");
  if (upload.note?.trim()) {
    formData.append("note", upload.note.trim());
  }
  if (upload.invoiceId) {
    formData.append("invoice_id", String(upload.invoiceId));
  }
  if (upload.expenseId) {
    formData.append("expense_id", String(upload.expenseId));
  }
  if (upload.todoId) {
    formData.append("todo_id", String(upload.todoId));
  }
  if (upload.bankTransactionId) {
    formData.append("bank_transaction_id", String(upload.bankTransactionId));
  }

  let response: Response;
  try {
    response = await fetch(adminApiUrl(`${ACCOUNTING_NEW_INVOICES_BASE}/attachments`), {
      ...apiFetchOptions,
      method: "POST",
      cache: "no-store",
      signal: params.signal,
      body: formData,
    });
  } catch (error) {
    throw new AccountingNewRequestError(buildNetworkError("attachment-upload", error));
  }

  if (!response.ok) {
    throw new AccountingNewRequestError(await buildApiError("attachment-upload", response));
  }

  const data = (await response.json()) as Parameters<typeof mapAttachmentSummary>[0];
  return mapAttachmentSummary(data);
}

export async function linkAccountingNewAttachment(
  attachmentId: number | string,
  payload: AccountingNewAttachmentLinkPayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewAttachmentSummary> {
  const normalizedId = Number.parseInt(String(attachmentId), 10);
  const data = await mutateAccountingNewJson<Parameters<typeof mapAttachmentSummary>[0]>(
    "attachment-link",
    `/attachments/${normalizedId}/link`,
    "POST",
    payload,
    params.signal,
  );
  return mapAttachmentSummary(data);
}

export async function downloadAccountingNewAttachment(
  attachmentId: number | string,
  fallbackFilename = "priloha",
): Promise<void> {
  const normalizedId = Number.parseInt(String(attachmentId), 10);
  const response = await fetch(adminApiUrl(`${ACCOUNTING_NEW_INVOICES_BASE}/attachments/${normalizedId}/download`), {
    ...apiFetchOptions,
    method: "GET",
  });

  if (!response.ok) {
    throw new AccountingNewRequestError(await buildApiError("attachment-download", response));
  }

  const blob = await response.blob();
  const filename = extractPdfFilename(response.headers.get("content-disposition"), fallbackFilename);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function applyAccountingNewBankTransactionMatch(
  transactionId: number | string,
  matchId: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewPaymentMatchListItem> {
  const normalizedTransactionId = Number.parseInt(String(transactionId), 10);
  const normalizedMatchId = Number.parseInt(String(matchId), 10);
  const data = await mutateAccountingNewJson<Parameters<typeof mapPaymentMatchSummary>[0]>(
    "bank-match-apply",
    `/bank-transactions/${normalizedTransactionId}/matches/${normalizedMatchId}/apply`,
    "POST",
    undefined,
    params.signal,
  );
  return mapPaymentMatchSummary(data);
}

const EXPORT_PATHS: Record<AccountingNewExportKind, string> = {
  "outgoing-csv": "/exports/outgoing.csv",
  "outgoing-xlsx": "/exports/outgoing.xlsx",
  "expenses-csv": "/exports/expenses.csv",
  "expenses-xlsx": "/exports/expenses.xlsx",
};

const EXPORT_FALLBACK_NAMES: Record<AccountingNewExportKind, string> = {
  "outgoing-csv": "vydane-doklady.csv",
  "outgoing-xlsx": "vydane-doklady.xlsx",
  "expenses-csv": "vydaje.csv",
  "expenses-xlsx": "vydaje.xlsx",
};

export async function downloadAccountingNewExport(kind: AccountingNewExportKind): Promise<void> {
  const path = EXPORT_PATHS[kind];
  const response = await fetch(adminApiUrl(`${ACCOUNTING_NEW_INVOICES_BASE}${path}`), {
    ...apiFetchOptions,
    method: "GET",
  });

  if (!response.ok) {
    throw new AccountingNewRequestError(await buildApiError(`export-${kind}`, response));
  }

  const blob = await response.blob();
  const filename = extractPdfFilename(response.headers.get("content-disposition"), EXPORT_FALLBACK_NAMES[kind]);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function importAccountingNewBankTransactions(
  payload: AccountingNewBankTransactionImportPayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewBankTransactionImportResult> {
  const data = await mutateAccountingNewJson<{
    imported_count: number;
    skipped_duplicate_count: number;
    imported_transaction_ids: number[];
    skipped_duplicate_identifiers: string[];
  }>("bank-import", "/bank-transactions/import", "POST", payload, params.signal);

  return {
    importedCount: data.imported_count,
    skippedDuplicateCount: data.skipped_duplicate_count,
    importedTransactionIds: data.imported_transaction_ids,
    skippedDuplicateIdentifiers: data.skipped_duplicate_identifiers,
  };
}

export async function listAccountingNewPayableInvoices(
  params: AccountingNewListParams & { currency?: string } = {},
): Promise<AccountingNewPayableInvoiceListItem[]> {
  const searchParams = new URLSearchParams();
  if (params.currency?.trim()) {
    searchParams.set("currency", params.currency.trim());
  }
  const query = searchParams.toString();
  const path = query ? `/bank-transactions/payable-invoices?${query}` : "/bank-transactions/payable-invoices";
  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      invoice_number: string;
      document_kind: string;
      customer_name: string;
      issue_date: string;
      due_date: string;
      currency: string;
      total: number;
      remaining_amount: number;
      payment_status: string;
      effective_status: string;
    }>
  >("bank-payable-invoices", path, params.signal);

  return data.map((item) => ({
    id: item.id,
    invoiceNumber: item.invoice_number,
    documentKind: item.document_kind,
    customerName: item.customer_name,
    issueDate: item.issue_date,
    dueDate: item.due_date,
    currency: item.currency,
    total: item.total,
    remainingAmount: item.remaining_amount,
    paymentStatus: item.payment_status,
    effectiveStatus: item.effective_status,
  }));
}

export async function recordAccountingNewInvoiceBankPayment(
  payload: AccountingNewRecordInvoiceBankPaymentPayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewRecordInvoiceBankPaymentResult> {
  const data = await mutateAccountingNewJson<{
    transaction_id: number;
    match_id: number;
    invoice_id: number;
    invoice_number: string;
    payment_status: string;
    total_paid: number;
    remaining_amount: number;
    transaction_status: string;
  }>("bank-record-invoice-payment", "/bank-transactions/record-invoice-payment", "POST", payload, params.signal);

  return {
    transactionId: data.transaction_id,
    matchId: data.match_id,
    invoiceId: data.invoice_id,
    invoiceNumber: data.invoice_number,
    paymentStatus: data.payment_status,
    totalPaid: data.total_paid,
    remainingAmount: data.remaining_amount,
    transactionStatus: data.transaction_status,
  };
}

export async function assignAccountingNewBankTransactionInvoice(
  transactionId: number | string,
  payload: AccountingNewAssignBankTransactionInvoicePayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewPaymentMatchListItem> {
  const normalizedId = normalizeBankTransactionId(transactionId);
  const data = await mutateAccountingNewJson<Parameters<typeof mapPaymentMatchSummary>[0]>(
    "bank-assign-invoice",
    `/bank-transactions/${normalizedId}/assign-invoice`,
    "POST",
    payload,
    params.signal,
  );
  return mapPaymentMatchSummary(data);
}

export async function ignoreAccountingNewBankTransaction(
  transactionId: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewBankTransactionListItem> {
  const normalizedId = Number.parseInt(String(transactionId), 10);
  await mutateAccountingNewJson<{ ok: true; transaction_id: number; status: string }>(
    "bank-ignore",
    `/bank-transactions/${normalizedId}/ignore`,
    "POST",
    undefined,
    params.signal,
  );
  return getAccountingNewBankTransaction(normalizedId, params);
}

export async function generateAccountingNewBankTransactionMatches(
  transactionId: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewPaymentMatchListItem[]> {
  const normalizedId = Number.parseInt(String(transactionId), 10);
  const data = await mutateAccountingNewJson<Parameters<typeof mapPaymentMatchSummary>[0][]>(
    "bank-match-generate",
    `/bank-transactions/${normalizedId}/matches/generate`,
    "POST",
    undefined,
    params.signal,
  );
  return data.map(mapPaymentMatchSummary);
}

export async function rejectAccountingNewBankTransactionMatch(
  transactionId: number | string,
  matchId: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewPaymentMatchListItem> {
  const normalizedTransactionId = Number.parseInt(String(transactionId), 10);
  const normalizedMatchId = Number.parseInt(String(matchId), 10);
  const data = await mutateAccountingNewJson<Parameters<typeof mapPaymentMatchSummary>[0]>(
    "bank-match-reject",
    `/bank-transactions/${normalizedTransactionId}/matches/${normalizedMatchId}/reject`,
    "POST",
    undefined,
    params.signal,
  );
  return mapPaymentMatchSummary(data);
}

export async function createAccountingNewTodo(
  payload: AccountingNewTodoCreatePayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewTodoSummary> {
  const data = await mutateAccountingNewJson<Parameters<typeof mapTodoSummary>[0]>(
    "todo-create",
    "/todos",
    "POST",
    payload,
    params.signal,
  );
  return mapTodoSummary(data);
}

export async function completeAccountingNewTodo(
  todoId: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewTodoSummary> {
  const normalizedId = Number.parseInt(String(todoId), 10);
  const data = await mutateAccountingNewJson<Parameters<typeof mapTodoSummary>[0]>(
    "todo-complete",
    `/todos/${normalizedId}/complete`,
    "POST",
    undefined,
    params.signal,
  );
  return mapTodoSummary(data);
}

export async function cancelAccountingNewTodo(
  todoId: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewTodoSummary> {
  const normalizedId = Number.parseInt(String(todoId), 10);
  const data = await mutateAccountingNewJson<Parameters<typeof mapTodoSummary>[0]>(
    "todo-cancel",
    `/todos/${normalizedId}/cancel`,
    "POST",
    undefined,
    params.signal,
  );
  return mapTodoSummary(data);
}

export async function generateAccountingNewTodos(
  params: AccountingNewListParams = {},
): Promise<AccountingNewTodoGenerateResult> {
  const data = await mutateAccountingNewJson<{
    generated_count: number;
    skipped_existing_count: number;
    generated_ids: number[];
  }>("todo-generate", "/todos/generate", "POST", undefined, params.signal);
  return {
    generatedCount: data.generated_count,
    skippedExistingCount: data.skipped_existing_count,
    generatedIds: data.generated_ids,
  };
}

export async function previewAccountingNewReminderEmail(
  invoiceId: number | string,
  params: AccountingNewListParams & { toEmail?: string | null; todoId?: number | null } = {},
): Promise<AccountingNewReminderEmailPreview> {
  const normalizedId = Number.parseInt(String(invoiceId), 10);
  const search = new URLSearchParams();
  if (params.toEmail?.trim()) {
    search.set("to_email", params.toEmail.trim());
  }
  if (params.todoId) {
    search.set("todo_id", String(params.todoId));
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  const data = await fetchAccountingNewJson<{
    invoice_id: number;
    invoice_number: string;
    recipient_email: string;
    subject: string;
    message: string;
    reminder_type: string;
  }>("reminder-preview", `/${normalizedId}/reminder-email/preview${suffix}`, params.signal);

  return {
    invoiceId: data.invoice_id,
    invoiceNumber: data.invoice_number,
    recipientEmail: data.recipient_email,
    subject: data.subject,
    message: data.message,
    reminderType: data.reminder_type,
  };
}

export async function sendAccountingNewReminderEmail(
  invoiceId: number | string,
  payload: AccountingNewReminderEmailSendPayload = {},
  params: AccountingNewListParams = {},
): Promise<{ reminderEmailId: number; sentTo: string; status: string }> {
  const normalizedId = Number.parseInt(String(invoiceId), 10);
  const data = await mutateAccountingNewJson<{
    reminder_email_id: number;
    sent_to: string;
    status: string;
  }>("reminder-send", `/${normalizedId}/reminder-email/send`, "POST", payload, params.signal);

  return {
    reminderEmailId: data.reminder_email_id,
    sentTo: data.sent_to,
    status: data.status,
  };
}

export async function sendAccountingNewDocumentEmail(
  documentId: number | string,
  payload: AccountingNewDocumentEmailSendPayload = {},
  params: AccountingNewListParams = {},
): Promise<AccountingNewDocumentEmailSendResult> {
  const normalizedId = Number.parseInt(String(documentId), 10);
  const data = await mutateAccountingNewJson<{
    invoice_id: number;
    invoice_number: string;
    sent_to: string;
    copied_to: string[];
  }>("document-email-send", `/${normalizedId}/send-email`, "POST", payload, params.signal);

  return {
    invoiceId: data.invoice_id,
    invoiceNumber: data.invoice_number,
    sentTo: data.sent_to,
    copiedTo: data.copied_to,
  };
}

export async function generateAccountingNewRecurringTemplate(
  templateId: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewRecurringGenerationResult> {
  const normalizedId = Number.parseInt(String(templateId), 10);
  const data = await mutateAccountingNewJson<{
    id: number;
    template_id: number;
    generated_invoice_id: number | null;
    generated_expense_id: number | null;
    run_date: string;
    status: string;
    message: string | null;
  }>("recurring-generate", `/recurring-templates/${normalizedId}/generate`, "POST", undefined, params.signal);

  return {
    id: data.id,
    templateId: data.template_id,
    generatedInvoiceId: data.generated_invoice_id,
    generatedExpenseId: data.generated_expense_id,
    runDate: data.run_date,
    status: data.status,
    message: data.message,
  };
}

export async function pauseAccountingNewRecurringTemplate(
  templateId: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewRecurringTemplateSummary> {
  const normalizedId = Number.parseInt(String(templateId), 10);
  const data = await mutateAccountingNewJson<Parameters<typeof mapRecurringTemplateSummary>[0]>(
    "recurring-pause",
    `/recurring-templates/${normalizedId}/pause`,
    "POST",
    undefined,
    params.signal,
  );
  return mapRecurringTemplateSummary(data);
}

export async function activateAccountingNewRecurringTemplate(
  templateId: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewRecurringTemplateSummary> {
  const normalizedId = Number.parseInt(String(templateId), 10);
  const data = await mutateAccountingNewJson<Parameters<typeof mapRecurringTemplateSummary>[0]>(
    "recurring-activate",
    `/recurring-templates/${normalizedId}/activate`,
    "POST",
    undefined,
    params.signal,
  );
  return mapRecurringTemplateSummary(data);
}

export async function cancelAccountingNewRecurringTemplate(
  templateId: number | string,
  params: AccountingNewListParams = {},
): Promise<AccountingNewRecurringTemplateSummary> {
  const normalizedId = Number.parseInt(String(templateId), 10);
  const data = await mutateAccountingNewJson<Parameters<typeof mapRecurringTemplateSummary>[0]>(
    "recurring-cancel",
    `/recurring-templates/${normalizedId}/cancel`,
    "POST",
    undefined,
    params.signal,
  );
  return mapRecurringTemplateSummary(data);
}

export async function createAccountingNewRecurringTemplate(
  payload: import("@/types/accountingNew").AccountingNewRecurringTemplateWritePayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewRecurringTemplateSummary> {
  const data = await mutateAccountingNewJson<Parameters<typeof mapRecurringTemplateSummary>[0]>(
    "recurring-create",
    "/recurring-templates",
    "POST",
    payload,
    params.signal,
  );
  return mapRecurringTemplateSummary(data);
}

export async function updateAccountingNewRecurringTemplate(
  templateId: number | string,
  payload: import("@/types/accountingNew").AccountingNewRecurringTemplateWritePayload,
  params: AccountingNewListParams = {},
): Promise<AccountingNewRecurringTemplateSummary> {
  const normalizedId = Number.parseInt(String(templateId), 10);
  const data = await mutateAccountingNewJson<Parameters<typeof mapRecurringTemplateSummary>[0]>(
    "recurring-update",
    `/recurring-templates/${normalizedId}`,
    "PUT",
    payload,
    params.signal,
  );
  return mapRecurringTemplateSummary(data);
}
