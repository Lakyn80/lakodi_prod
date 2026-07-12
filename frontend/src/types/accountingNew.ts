export type AccountingNewModuleId =
  | "dashboard"
  | "documents"
  | "subjects"
  | "expenses"
  | "suppliers"
  | "bank-transactions"
  | "payment-matching"
  | "reminders"
  | "recurring"
  | "attachments"
  | "exports"
  | "settings"
  | "audit";

export type AccountingNewModuleAvailability = "placeholder" | "read-only";

export interface AccountingNewModuleDefinition {
  id: AccountingNewModuleId;
  title: string;
  description: string;
  availability: AccountingNewModuleAvailability;
}

export interface AccountingNewApiError {
  resource: string;
  message: string;
  status: number | null;
  requiresLogin: boolean;
}

export type AccountingNewDocumentKind =
  | "invoice"
  | "proforma"
  | "tax_document"
  | "correction"
  | "final_invoice"
  | "quote";

export type AccountingNewPaymentStatus = string;
export type AccountingNewEffectiveStatus = string;

export interface AccountingNewDocumentListItem {
  id: number;
  invoiceNumber: string;
  variableSymbol: string;
  documentKind: AccountingNewDocumentKind | string;
  issueDate: string;
  dueDate: string;
  customerName: string;
  customerEmail: string;
  currency: string;
  total: number;
  totalPaid: number;
  remainingAmount: number;
  status: string;
  paymentStatus: AccountingNewPaymentStatus;
  effectiveStatus: AccountingNewEffectiveStatus;
  createdAt: string;
}

export type AccountingNewDocumentSummary = AccountingNewDocumentListItem;

export interface AccountingNewDocumentItem {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface AccountingNewPaymentSummary {
  id: number;
  invoiceId: number;
  amount: number;
  paidAt: string;
  paymentMethod: string;
  note: string | null;
  createdAt: string;
}

export interface AccountingNewDocumentRelationDocumentSummary {
  id: number;
  documentKind: AccountingNewDocumentKind | string;
  invoiceNumber: string;
  variableSymbol: string;
  issueDate: string;
  dueDate: string;
  customerName: string;
  currency: string;
  total: number;
  effectiveStatus: AccountingNewEffectiveStatus;
  paymentStatus: AccountingNewPaymentStatus;
}

export interface AccountingNewDocumentRelationPaymentSummary {
  id: number;
  amount: number;
  paidAt: string;
  paymentMethod: string;
  note: string | null;
}

export interface AccountingNewDocumentRelationSummary {
  id: number;
  relationType: string;
  sourceInvoiceId: number;
  targetInvoiceId: number;
  sourcePaymentId: number | null;
  createdAt: string;
  sourceDocument: AccountingNewDocumentRelationDocumentSummary | null;
  targetDocument: AccountingNewDocumentRelationDocumentSummary | null;
  sourcePayment: AccountingNewDocumentRelationPaymentSummary | null;
}

export interface AccountingNewDocumentRelationsSummary {
  invoiceId: number;
  outgoingRelations: AccountingNewDocumentRelationSummary[];
  incomingRelations: AccountingNewDocumentRelationSummary[];
  allRelations: AccountingNewDocumentRelationSummary[];
}

export interface AccountingNewDocumentDetail extends AccountingNewDocumentListItem {
  issuerName: string;
  issuerAddress: string;
  issuerCity: string;
  issuerZip: string;
  issuerIco: string;
  issuerDic: string;
  issuerDataBox: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerIco: string | null;
  customerDic: string | null;
  subjectId: number | null;
  note: string | null;
  businessMode: string;
  taxMode: string;
  subtotal: number;
  vatRate: number | null;
  vatAmount: number;
  reverseChargeReason: string | null;
  reverseChargeText: string | null;
  paymentMethod: string;
  bankAccountNumber: string;
  bankAccountPrefix: string | null;
  bankCode: string;
  bankIban: string;
  items: AccountingNewDocumentItem[];
  payments: AccountingNewPaymentSummary[];
}

export interface AccountingNewDocumentFilters {
  query?: string;
  documentKind?: AccountingNewDocumentKind | string | "all";
  paymentStatus?: AccountingNewPaymentStatus | "all";
  effectiveStatus?: AccountingNewEffectiveStatus | "all";
}

export type AccountingNewDocumentDetailState =
  | { status: "loading" }
  | {
      status: "ready";
      detail: AccountingNewDocumentDetail;
      relations: AccountingNewDocumentRelationsSummary | null;
      auditEvents: AccountingNewAuditEventSummary[];
      partialErrors: AccountingNewApiError[];
    }
  | { status: "auth"; error: AccountingNewApiError }
  | { status: "not_found"; error: AccountingNewApiError }
  | { status: "error"; error: AccountingNewApiError };

export type AccountingNewExpenseStatus = string;
export type AccountingNewExpensePaymentStatus = string;

export interface AccountingNewExpenseListItem {
  id: number;
  expenseNumber: string;
  variableSymbol: string;
  supplierId: number | null;
  supplierName: string;
  supplierEmail: string;
  supplierPhone: string | null;
  supplierAddress: string;
  supplierIco: string | null;
  supplierDic: string | null;
  supplierDataBox: string | null;
  supplierCountry: string | null;
  currency: string;
  issueDate: string;
  receivedDate: string;
  dueDate: string;
  taxableSupplyDate: string;
  subtotal: number;
  vatRate: number | null;
  vatAmount: number;
  total: number;
  note: string | null;
  paymentMethod: string;
  bankAccountNumber: string;
  bankAccountPrefix: string | null;
  bankCode: string;
  bankIban: string | null;
  totalPaid: number;
  remainingAmount: number;
  status: AccountingNewExpenseStatus;
  paymentStatus: AccountingNewExpensePaymentStatus;
  createdAt: string;
  updatedAt: string;
}

export type AccountingNewExpenseSummary = AccountingNewExpenseListItem;

export interface AccountingNewExpenseItem {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface AccountingNewExpensePaymentSummary {
  id: number;
  expenseId: number;
  amount: number;
  paidAt: string;
  paymentMethod: string;
  note: string | null;
  createdAt: string;
}

export interface AccountingNewExpenseDetail extends AccountingNewExpenseListItem {
  items: AccountingNewExpenseItem[];
  payments: AccountingNewExpensePaymentSummary[];
}

export interface AccountingNewExpenseFilters {
  query?: string;
  supplierId?: number | "all";
  paymentStatus?: AccountingNewExpensePaymentStatus | "all";
  expenseStatus?: AccountingNewExpenseStatus | "all";
}

export type AccountingNewExpenseDetailState =
  | { status: "loading" }
  | {
      status: "ready";
      detail: AccountingNewExpenseDetail;
      payments: AccountingNewExpensePaymentSummary[];
      auditEvents: AccountingNewAuditEventSummary[];
      partialErrors: AccountingNewApiError[];
    }
  | { status: "auth"; error: AccountingNewApiError }
  | { status: "not_found"; error: AccountingNewApiError }
  | { status: "error"; error: AccountingNewApiError };

export interface AccountingNewTodoSummary {
  id: number;
  invoiceId: number | null;
  expenseId: number | null;
  todoType: string;
  status: string;
  title: string;
  message: string | null;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type AccountingNewTodoListItem = AccountingNewTodoSummary;
export type AccountingNewTodoDetail = AccountingNewTodoSummary;

export interface AccountingNewTodoFilters {
  query?: string;
  status?: string | "all";
  todoType?: string | "all";
}

export type AccountingNewTodoStatus = string;
export type AccountingNewTodoPriority = string;

export interface AccountingNewReminderListItem {
  id: number;
  invoiceId: number | null;
  expenseId: number | null;
  todoType: string;
  status: string;
  title: string;
  message: string | null;
  dueDate: string;
  createdAt: string;
}

export type AccountingNewReminderDetail = AccountingNewReminderListItem;

export interface AccountingNewReminderEmailListItem {
  id: number;
  invoiceId: number;
  invoiceNumber: string | null;
  todoId: number | null;
  reminderType: string;
  status: string;
  recipientEmail: string;
  subject: string;
  message: string;
  sentAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export type AccountingNewReminderEmailDetail = AccountingNewReminderEmailListItem;

export interface AccountingNewReminderEmailFilters {
  query?: string;
  status?: string | "all";
  reminderType?: string | "all";
}

export type AccountingNewTodoDetailState =
  | { status: "loading" }
  | { status: "ready"; detail: AccountingNewTodoDetail }
  | { status: "auth"; error: AccountingNewApiError }
  | { status: "not_found"; error: AccountingNewApiError }
  | { status: "error"; error: AccountingNewApiError };

export type AccountingNewReminderEmailDetailState =
  | { status: "loading" }
  | { status: "ready"; detail: AccountingNewReminderEmailDetail }
  | { status: "auth"; error: AccountingNewApiError }
  | { status: "not_found"; error: AccountingNewApiError }
  | { status: "error"; error: AccountingNewApiError };

export interface AccountingNewBankTransactionListItem {
  id: number;
  externalId: string | null;
  accountIban: string | null;
  accountNumber: string | null;
  bankCode: string | null;
  transactionDate: string;
  bookedDate: string | null;
  amount: number;
  currency: string;
  variableSymbol: string | null;
  constantSymbol: string | null;
  specificSymbol: string | null;
  counterpartyName: string | null;
  counterpartyAccount: string | null;
  counterpartyIban: string | null;
  message: string | null;
  rawPayload: string | null;
  direction: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export type AccountingNewBankTransactionSummary = AccountingNewBankTransactionListItem;

export type AccountingNewBankTransactionDetail = AccountingNewBankTransactionListItem;

export interface AccountingNewBankTransactionFilters {
  query?: string;
  direction?: string | "all";
  status?: string | "all";
}

export interface AccountingNewPaymentMatchListItem {
  id: number;
  bankTransactionId: number;
  invoiceId: number | null;
  expenseId: number | null;
  invoicePaymentId: number | null;
  expensePaymentId: number | null;
  matchType: string;
  confidence: number;
  status: string;
  reason: string | null;
  createdAt: string;
  appliedAt: string | null;
}

export type AccountingNewPaymentMatchDetail = AccountingNewPaymentMatchListItem;

export interface AccountingNewPaymentMatchBankTransactionContext {
  id: number;
  transactionDate: string;
  bookedDate: string | null;
  amount: number;
  currency: string;
  direction: string;
  variableSymbol: string | null;
  message: string | null;
  status: string;
  counterpartyName: string | null;
}

export interface AccountingNewPaymentMatchCandidateSummary {
  invoiceId: number | null;
  expenseId: number | null;
  documentNumber: string | null;
  variableSymbol: string | null;
  counterpartyName: string | null;
  total: number | null;
  remainingAmount: number | null;
  currency: string | null;
}

export interface AccountingNewPaymentMatchDashboardItem extends AccountingNewPaymentMatchListItem {
  bankTransaction: AccountingNewPaymentMatchBankTransactionContext;
  candidate: AccountingNewPaymentMatchCandidateSummary;
}

export function isAccountingNewPaymentMatchDashboardItem(
  match: AccountingNewPaymentMatchListItem,
): match is AccountingNewPaymentMatchDashboardItem {
  return "bankTransaction" in match && "candidate" in match;
}

export interface AccountingNewPaymentMatchCatalogParams {
  status?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export interface AccountingNewPaymentMatchCandidate {
  id: string;
  label: string;
  reason: string | null;
  confidence: number | null;
}

export interface AccountingNewPaymentMatchFilters {
  status?: string | "all";
  matchType?: string | "all";
}

export type AccountingNewBankTransactionDetailState =
  | { status: "loading" }
  | {
      status: "ready";
      detail: AccountingNewBankTransactionDetail;
      matches: AccountingNewPaymentMatchListItem[];
      partialErrors: AccountingNewApiError[];
    }
  | { status: "auth"; error: AccountingNewApiError }
  | { status: "not_found"; error: AccountingNewApiError }
  | { status: "error"; error: AccountingNewApiError };

export interface AccountingNewAuditEventSummary {
  id: number;
  eventType: string;
  entityType: string;
  entityId: number;
  invoiceId: number | null;
  expenseId: number | null;
  subjectId: number | null;
  supplierId: number | null;
  bankTransactionId: number | null;
  paymentMatchId: number | null;
  todoId: number | null;
  attachmentId: number | null;
  recurringTemplateId: number | null;
  reminderEmailId: number | null;
  actorType: string | null;
  actorId: number | null;
  actorEmail: string | null;
  source: string;
  message: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface AccountingNewRecurringTemplateSummary {
  id: number;
  templateType: string;
  documentKind: string | null;
  subjectId: number | null;
  supplierId: number | null;
  name: string;
  status: string;
  recurrenceInterval: string;
  recurrenceCount: number;
  nextRunDate: string;
  lastRunDate: string | null;
  businessMode: string | null;
  taxMode: string | null;
  currency: string;
  vatRate: number | null;
  note: string | null;
  paymentMethod: string | null;
  bankAccountNumber: string | null;
  bankAccountPrefix: string | null;
  bankCode: string | null;
  bankIban: string | null;
  createdAt: string;
  updatedAt: string;
  items: AccountingNewRecurringTemplateItem[];
}

export type AccountingNewRecurringTemplateKind = string;
export type AccountingNewRecurringTemplateStatus = string;
export type AccountingNewRecurringTemplateFrequency = string;

export interface AccountingNewRecurringTemplateItem {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export type AccountingNewRecurringTemplateListItem = AccountingNewRecurringTemplateSummary;
export type AccountingNewRecurringTemplateDetail = AccountingNewRecurringTemplateSummary;

export interface AccountingNewRecurringTemplateFilters {
  query?: string;
  templateType?: AccountingNewRecurringTemplateKind | "all";
  status?: AccountingNewRecurringTemplateStatus | "all";
  documentKind?: string | "all";
}

export interface AccountingNewRecurringGenerationListItem {
  id: number;
  templateId: number;
  generatedInvoiceId: number | null;
  generatedExpenseId: number | null;
  generatedAt: string;
  runDate: string;
  status: string;
  message: string | null;
}

export type AccountingNewRecurringGenerationDetail = AccountingNewRecurringGenerationListItem;

export type AccountingNewRecurringTemplateDetailState =
  | { status: "loading" }
  | {
      status: "ready";
      detail: AccountingNewRecurringTemplateDetail;
      generations: AccountingNewRecurringGenerationListItem[];
      partialErrors: AccountingNewApiError[];
    }
  | { status: "auth"; error: AccountingNewApiError }
  | { status: "not_found"; error: AccountingNewApiError }
  | { status: "error"; error: AccountingNewApiError };

export interface AccountingNewAttachmentSummary {
  id: number;
  invoiceId: number | null;
  expenseId: number | null;
  todoId: number | null;
  bankTransactionId: number | null;
  attachmentType: string;
  status: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string | null;
  note: string | null;
  createdAt: string;
}

export type AccountingNewAttachmentListItem = AccountingNewAttachmentSummary;
export type AccountingNewAttachmentDetail = AccountingNewAttachmentSummary;
export type AccountingNewAttachmentInboxItem = AccountingNewAttachmentSummary;

export type AccountingNewAttachmentStatus = string;

export interface AccountingNewAttachmentFilters {
  query?: string;
  status?: string | "all";
  attachmentType?: string | "all";
  invoiceId?: number;
  expenseId?: number;
  unlinkedOnly?: boolean;
}

export type AccountingNewAttachmentInboxFilters = Pick<
  AccountingNewAttachmentFilters,
  "query" | "status" | "attachmentType"
>;

export interface AccountingNewAttachmentRelation {
  invoiceId: number | null;
  expenseId: number | null;
  todoId: number | null;
  bankTransactionId: number | null;
}

export type AccountingNewAttachmentDetailState =
  | { status: "loading" }
  | { status: "ready"; detail: AccountingNewAttachmentDetail; auditEvents: AccountingNewAuditEventSummary[]; partialErrors: AccountingNewApiError[] }
  | { status: "auth"; error: AccountingNewApiError }
  | { status: "not_found"; error: AccountingNewApiError }
  | { status: "error"; error: AccountingNewApiError };

export interface AccountingNewSubjectSummary {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  address: string;
  ico: string | null;
  dic: string | null;
  dataBox: string | null;
  country: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingNewSupplierListItem {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  address: string;
  ico: string | null;
  dic: string | null;
  dataBox: string | null;
  country: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AccountingNewSupplierSummary = AccountingNewSupplierListItem;

export type AccountingNewSupplierDetail = AccountingNewSupplierListItem;

export interface AccountingNewSupplierFilters {
  query?: string;
  country?: string | "all";
}

export type AccountingNewSupplierDetailState =
  | { status: "loading" }
  | { status: "ready"; detail: AccountingNewSupplierDetail }
  | { status: "auth"; error: AccountingNewApiError }
  | { status: "not_found"; error: AccountingNewApiError }
  | { status: "error"; error: AccountingNewApiError };

export interface AccountingNewDashboardMetrics {
  documentsLoaded: number;
  documentsWithRemainingBalance: number;
  expensesLoaded: number;
  expensesWithRemainingBalance: number;
  todosLoaded: number;
  openTodos: number;
  overdueTodos: number;
  bankTransactionsLoaded: number;
  recurringTemplatesLoaded: number;
  attachmentsLoaded: number;
  auditEventsLoaded: number;
  subjectsLoaded: number;
  suppliersLoaded: number;
}

export interface AccountingNewDashboardData {
  invoices: AccountingNewDocumentListItem[];
  expenses: AccountingNewExpenseSummary[];
  todos: AccountingNewTodoSummary[];
  bankTransactions: AccountingNewBankTransactionSummary[];
  auditEvents: AccountingNewAuditEventSummary[];
  recurringTemplates: AccountingNewRecurringTemplateSummary[];
  attachments: AccountingNewAttachmentSummary[];
  subjects: AccountingNewSubjectSummary[];
  suppliers: AccountingNewSupplierSummary[];
  metrics: AccountingNewDashboardMetrics;
  lastUpdatedAt: string | null;
}

export interface AccountingNewDashboardLoadResult {
  authRequired: boolean;
  dashboard: AccountingNewDashboardData;
  partialErrors: AccountingNewApiError[];
}

export type AccountingNewDocumentStoredStatus = "draft" | "issued" | "cancelled";

export type AccountingNewBusinessMode = "autoservice" | "construction";

export type AccountingNewTaxMode = "standard" | "reverse_charge";

export interface AccountingNewDocumentItemInput {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface AccountingNewDocumentWritePayload {
  invoice_number?: string | null;
  document_kind?: string;
  status?: AccountingNewDocumentStoredStatus;
  issue_date: string;
  due_date: string;
  subject_id?: number | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_ico?: string | null;
  customer_dic?: string | null;
  note?: string | null;
  business_mode: AccountingNewBusinessMode;
  tax_mode: AccountingNewTaxMode;
  currency: string;
  vat_rate?: number | null;
  items: AccountingNewDocumentItemInput[];
}

export interface AccountingNewDocumentPaymentCreatePayload {
  amount: number;
  paid_at: string;
  payment_method: string;
  note?: string | null;
}

export interface AccountingNewDocumentDefaults {
  documentKind: string;
  suggestedInvoiceNumber: string;
  suggestedVariableSymbol: string;
}

export interface AccountingNewDocumentFormItemState {
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface AccountingNewDocumentFormState {
  invoiceNumber: string;
  documentKind: string;
  status: AccountingNewDocumentStoredStatus;
  issueDate: string;
  dueDate: string;
  subjectId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  customerIco: string;
  customerDic: string;
  customerDataBox: string;
  note: string;
  businessMode: AccountingNewBusinessMode;
  taxMode: AccountingNewTaxMode;
  currency: string;
  vatRate: string;
  items: AccountingNewDocumentFormItemState[];
}

export interface AccountingNewDocumentMutationResult {
  detail: AccountingNewDocumentDetail;
}

export type AccountingNewSubjectDetail = AccountingNewSubjectSummary;

export interface AccountingNewSubjectWritePayload {
  name: string;
  email: string;
  phone?: string | null;
  address: string;
  ico?: string | null;
  dic?: string | null;
  data_box?: string | null;
  country?: string | null;
  note?: string | null;
}

export interface AccountingNewSubjectFormState {
  name: string;
  email: string;
  phone: string;
  address: string;
  ico: string;
  dic: string;
  dataBox: string;
  country: string;
  note: string;
}

export type AccountingNewSubjectDetailState =
  | { status: "loading" }
  | { status: "ready"; detail: AccountingNewSubjectDetail }
  | { status: "auth"; error: AccountingNewApiError }
  | { status: "not_found"; error: AccountingNewApiError }
  | { status: "error"; error: AccountingNewApiError };

export interface AccountingNewSupplierWritePayload {
  name: string;
  email: string;
  phone?: string | null;
  address: string;
  ico?: string | null;
  dic?: string | null;
  data_box?: string | null;
  country?: string | null;
  note?: string | null;
}

export type AccountingNewSupplierFormState = AccountingNewSubjectFormState;

export interface AccountingNewExpenseItemInput {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface AccountingNewExpenseWritePayload {
  expense_number?: string | null;
  issue_date: string;
  received_date: string;
  due_date: string;
  taxable_supply_date: string;
  payment_method: string;
  bank_account_number: string;
  bank_account_prefix?: string | null;
  bank_code: string;
  bank_iban?: string | null;
  currency?: string;
  status?: string;
  vat_rate?: number | null;
  note?: string | null;
  supplier_id?: number | null;
  supplier_name?: string | null;
  supplier_email?: string | null;
  supplier_phone?: string | null;
  supplier_address?: string | null;
  supplier_ico?: string | null;
  supplier_dic?: string | null;
  supplier_data_box?: string | null;
  supplier_country?: string | null;
  items: AccountingNewExpenseItemInput[];
}

export interface AccountingNewExpensePaymentCreatePayload {
  amount: number;
  paid_at: string;
  payment_method: string;
  note?: string | null;
}

export interface AccountingNewExpenseFormItemState {
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface AccountingNewExpenseFormState {
  expenseNumber: string;
  issueDate: string;
  receivedDate: string;
  dueDate: string;
  taxableSupplyDate: string;
  paymentMethod: string;
  bankAccountNumber: string;
  bankAccountPrefix: string;
  bankCode: string;
  bankIban: string;
  currency: string;
  vatRate: string;
  status: string;
  note: string;
  supplierId: string;
  supplierName: string;
  supplierEmail: string;
  supplierPhone: string;
  supplierAddress: string;
  supplierIco: string;
  supplierDic: string;
  items: AccountingNewExpenseFormItemState[];
}

export interface AccountingNewSettings {
  ownerEmail: string;
  issuerName: string;
  issuerAddress: string;
  issuerCity: string;
  issuerZip: string;
  issuerIco: string;
  issuerDic: string;
  issuerDataBox: string | null;
  issuerEmail: string | null;
  issuerPhone: string | null;
  defaultCurrency: string;
  defaultDueDays: number;
  defaultNote: string | null;
  paymentMethod: string;
  bankAccountNumber: string;
  bankAccountPrefix: string | null;
  bankCode: string;
  bankIban: string;
  accountLabel: string;
}

export interface AccountingNewSettingsFormState {
  ownerEmail: string;
  issuerName: string;
  issuerAddress: string;
  issuerCity: string;
  issuerZip: string;
  issuerIco: string;
  issuerDic: string;
  issuerDataBox: string;
  issuerEmail: string;
  issuerPhone: string;
  defaultCurrency: string;
  defaultDueDays: string;
  defaultNote: string;
  paymentMethod: string;
  bankAccountNumber: string;
  bankAccountPrefix: string;
  bankCode: string;
  bankIban: string;
}

export interface AccountingNewSettingsWritePayload {
  owner_email: string;
  issuer_name: string | null;
  issuer_address: string | null;
  issuer_city: string | null;
  issuer_zip: string | null;
  issuer_ico: string | null;
  issuer_dic: string | null;
  issuer_data_box: string | null;
  issuer_email: string | null;
  issuer_phone: string | null;
  default_currency: string | null;
  default_due_days: number | null;
  default_note: string | null;
  payment_method: string;
  bank_account_number: string;
  bank_account_prefix: string | null;
  bank_code: string;
  bank_iban: string | null;
}

export interface AccountingNewAttachmentLinkPayload {
  invoice_id?: number;
  expense_id?: number;
  todo_id?: number;
  bank_transaction_id?: number;
}

export interface AccountingNewAttachmentUploadParams {
  file: File;
  attachmentType?: string;
  note?: string | null;
  invoiceId?: number | null;
  expenseId?: number | null;
  todoId?: number | null;
  bankTransactionId?: number | null;
}

export type AccountingNewExportKind = "outgoing-csv" | "outgoing-xlsx" | "expenses-csv" | "expenses-xlsx";

export interface AccountingNewBankTransactionImportItem {
  external_id?: string | null;
  account_iban?: string | null;
  account_number?: string | null;
  bank_code?: string | null;
  transaction_date: string;
  booked_date?: string | null;
  amount: number;
  currency: string;
  variable_symbol?: string | null;
  constant_symbol?: string | null;
  specific_symbol?: string | null;
  counterparty_name?: string | null;
  counterparty_account?: string | null;
  counterparty_iban?: string | null;
  message?: string | null;
  direction: "incoming" | "outgoing";
}

export interface AccountingNewBankTransactionImportPayload {
  transactions: AccountingNewBankTransactionImportItem[];
}

export interface AccountingNewBankTransactionImportResult {
  importedCount: number;
  skippedDuplicateCount: number;
  importedTransactionIds: number[];
  skippedDuplicateIdentifiers: string[];
}

export interface AccountingNewTodoCreatePayload {
  invoice_id?: number | null;
  expense_id?: number | null;
  todo_type?: string;
  status?: string;
  title: string;
  message?: string | null;
  due_date: string;
}

export interface AccountingNewTodoGenerateResult {
  generatedCount: number;
  skippedExistingCount: number;
  generatedIds: number[];
}

export interface AccountingNewReminderEmailPreview {
  invoiceId: number;
  invoiceNumber: string;
  recipientEmail: string;
  subject: string;
  message: string;
  reminderType: string;
}

export interface AccountingNewReminderEmailSendPayload {
  to_email?: string | null;
  todo_id?: number | null;
  subject?: string | null;
  message?: string | null;
}

export interface AccountingNewDocumentEmailSendPayload {
  to_email?: string | null;
}

export interface AccountingNewDocumentEmailSendResult {
  invoiceId: number;
  invoiceNumber: string;
  sentTo: string;
  copiedTo: string[];
}

export interface AccountingNewRecurringGenerationResult {
  id: number;
  templateId: number;
  generatedInvoiceId: number | null;
  generatedExpenseId: number | null;
  runDate: string;
  status: string;
  message: string | null;
}

export interface AccountingNewRecurringTemplateFormItem {
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface AccountingNewRecurringTemplateFormState {
  templateType: "invoice" | "expense";
  documentKind: string;
  name: string;
  status: string;
  recurrenceInterval: string;
  recurrenceCount: string;
  nextRunDate: string;
  businessMode: string;
  taxMode: string;
  currency: string;
  vatRate: string;
  note: string;
  subjectId: string;
  supplierId: string;
  paymentMethod: string;
  bankAccountNumber: string;
  bankAccountPrefix: string;
  bankCode: string;
  bankIban: string;
  items: AccountingNewRecurringTemplateFormItem[];
}

export interface AccountingNewRecurringTemplateWritePayload {
  template_type: "invoice" | "expense";
  document_kind?: string | null;
  subject_id?: number | null;
  supplier_id?: number | null;
  name: string;
  status: string;
  recurrence_interval: string;
  recurrence_count: number;
  next_run_date: string;
  business_mode?: string | null;
  tax_mode?: string | null;
  currency: string;
  vat_rate?: number | null;
  note?: string | null;
  payment_method?: string | null;
  bank_account_number?: string | null;
  bank_account_prefix?: string | null;
  bank_code?: string | null;
  bank_iban?: string | null;
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
  }>;
}
