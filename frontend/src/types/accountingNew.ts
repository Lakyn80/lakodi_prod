export type AccountingNewModuleId =
  | "dashboard"
  | "documents"
  | "expenses"
  | "suppliers"
  | "bank-transactions"
  | "payment-matching"
  | "reminders"
  | "recurring"
  | "attachments"
  | "exports"
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
