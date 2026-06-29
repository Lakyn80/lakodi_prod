export type AccountingNewModuleId =
  | "dashboard"
  | "documents"
  | "subjects"
  | "expenses"
  | "suppliers"
  | "bank-matching"
  | "todos-reminders"
  | "recurring"
  | "attachments"
  | "audit"
  | "settings";

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

export interface AccountingNewDocumentSummary {
  id: number;
  invoiceNumber: string;
  variableSymbol: string;
  documentKind: string;
  issueDate: string;
  dueDate: string;
  customerName: string;
  customerEmail: string;
  currency: string;
  total: number;
  totalPaid: number;
  remainingAmount: number;
  status: string;
  paymentStatus: string;
  effectiveStatus: string;
  createdAt: string;
}

export interface AccountingNewExpenseSummary {
  id: number;
  expenseNumber: string;
  variableSymbol: string;
  supplierId: number | null;
  supplierName: string;
  supplierEmail: string;
  currency: string;
  issueDate: string;
  receivedDate: string;
  dueDate: string;
  total: number;
  totalPaid: number;
  remainingAmount: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
}

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

export interface AccountingNewBankTransactionSummary {
  id: number;
  externalId: string | null;
  transactionDate: string;
  bookedDate: string | null;
  amount: number;
  currency: string;
  variableSymbol: string | null;
  counterpartyName: string | null;
  message: string | null;
  direction: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

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
  currency: string;
  vatRate: number | null;
  createdAt: string;
  updatedAt: string;
}

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

export interface AccountingNewSupplierSummary {
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
  invoices: AccountingNewDocumentSummary[];
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
