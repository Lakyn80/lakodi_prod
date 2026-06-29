import { adminApiUrl, apiFetchOptions } from "@/lib/api";
import type {
  AccountingNewApiError,
  AccountingNewAttachmentSummary,
  AccountingNewAuditEventSummary,
  AccountingNewBankTransactionSummary,
  AccountingNewDashboardData,
  AccountingNewDashboardLoadResult,
  AccountingNewDocumentSummary,
  AccountingNewExpenseSummary,
  AccountingNewModuleDefinition,
  AccountingNewRecurringTemplateSummary,
  AccountingNewSubjectSummary,
  AccountingNewSupplierSummary,
  AccountingNewTodoSummary,
} from "@/types/accountingNew";

export const ACCOUNTING_NEW_ROUTE = "/admin/ucetnictvi-new";
export const ACCOUNTING_NEW_LABEL = "ÚčetnictvíNew";

export const accountingNewModules: AccountingNewModuleDefinition[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Read-only přehled načtených dokladů, výdajů, úkolů a auditních událostí.",
    availability: "read-only",
  },
  {
    id: "documents",
    title: "Doklady",
    description: "Read-only načtení faktur, proforem, daňových dokladů, konečných faktur, oprav a nabídek.",
    availability: "read-only",
  },
  {
    id: "subjects",
    title: "Zákazníci",
    description: "Read-only seznam subjektů a snapshotově bezpečných údajů pro nové účetnictví.",
    availability: "read-only",
  },
  {
    id: "expenses",
    title: "Výdaje",
    description: "Read-only přehled přijatých dokladů a jejich aktuálních stavů úhrad.",
    availability: "read-only",
  },
  {
    id: "suppliers",
    title: "Dodavatelé",
    description: "Read-only registr dodavatelů připravený pro další paralelní accounting workflow.",
    availability: "read-only",
  },
  {
    id: "bank-matching",
    title: "Banka / párování",
    description: "Read-only načtení bankovních transakcí bez importu, párování nebo potvrzovacích kroků.",
    availability: "read-only",
  },
  {
    id: "todos-reminders",
    title: "Úkoly / upomínky",
    description: "Read-only přehled otevřených úkolů a připravených účetních připomínek.",
    availability: "read-only",
  },
  {
    id: "recurring",
    title: "Opakované doklady",
    description: "Read-only seznam šablon bez generování nebo změny pravidelných dokladů.",
    availability: "read-only",
  },
  {
    id: "attachments",
    title: "Přílohy / inbox",
    description: "Read-only inbox příloh a vazeb k dokladům bez archivace nebo linkování.",
    availability: "read-only",
  },
  {
    id: "audit",
    title: "Audit log",
    description: "Read-only append-only audit události napříč accounting moduly.",
    availability: "read-only",
  },
  {
    id: "settings",
    title: "Nastavení",
    description: "Konfigurační moduly zůstávají v této fázi pouze připravené, bez načtení write formulářů.",
    availability: "placeholder",
  },
];

const ACCOUNTING_NEW_INVOICES_BASE = "/invoices";

export interface AccountingNewListParams {
  signal?: AbortSignal;
}

class AccountingNewRequestError extends Error {
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

function mapInvoiceSummary(item: {
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
}): AccountingNewDocumentSummary {
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

function mapExpenseSummary(item: {
  id: number;
  expense_number: string;
  variable_symbol: string;
  supplier_id: number | null;
  supplier_name: string;
  supplier_email: string;
  currency: string;
  issue_date: string;
  received_date: string;
  due_date: string;
  total: number;
  total_paid: number;
  remaining_amount: number;
  status: string;
  payment_status: string;
  created_at: string;
  updated_at: string;
}): AccountingNewExpenseSummary {
  return {
    id: item.id,
    expenseNumber: item.expense_number,
    variableSymbol: item.variable_symbol,
    supplierId: item.supplier_id,
    supplierName: item.supplier_name,
    supplierEmail: item.supplier_email,
    currency: item.currency,
    issueDate: item.issue_date,
    receivedDate: item.received_date,
    dueDate: item.due_date,
    total: item.total,
    totalPaid: item.total_paid,
    remainingAmount: item.remaining_amount,
    status: item.status,
    paymentStatus: item.payment_status,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
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
  transaction_date: string;
  booked_date: string | null;
  amount: number;
  currency: string;
  variable_symbol: string | null;
  counterparty_name: string | null;
  message: string | null;
  direction: string;
  status: string;
  created_at: string;
  updated_at: string;
}): AccountingNewBankTransactionSummary {
  return {
    id: item.id,
    externalId: item.external_id,
    transactionDate: item.transaction_date,
    bookedDate: item.booked_date,
    amount: item.amount,
    currency: item.currency,
    variableSymbol: item.variable_symbol,
    counterpartyName: item.counterparty_name,
    message: item.message,
    direction: item.direction,
    status: item.status,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
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
  currency: string;
  vat_rate: number | null;
  created_at: string;
  updated_at: string;
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
    currency: item.currency,
    vatRate: item.vat_rate,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
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
}): AccountingNewSupplierSummary {
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

async function buildApiError(resource: string, response: Response): Promise<AccountingNewApiError> {
  let message = `Read-only načtení selhalo (${response.status}).`;

  try {
    const payload = (await response.json()) as { detail?: string };
    if (typeof payload.detail === "string" && payload.detail.trim()) {
      message = payload.detail;
    }
  } catch {
    if (response.status === 401) {
      message = "Pro načtení read-only accounting dashboardu je nutné přihlášení do adminu.";
    }
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
    message: error instanceof Error ? error.message : "Read-only načtení selhalo kvůli síťové chybě.",
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

export async function listAccountingNewInvoices(
  params: AccountingNewListParams = {},
): Promise<AccountingNewDocumentSummary[]> {
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

  return data.map(mapInvoiceSummary);
}

export async function listAccountingNewExpenses(
  params: AccountingNewListParams = {},
): Promise<AccountingNewExpenseSummary[]> {
  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      expense_number: string;
      variable_symbol: string;
      supplier_id: number | null;
      supplier_name: string;
      supplier_email: string;
      currency: string;
      issue_date: string;
      received_date: string;
      due_date: string;
      total: number;
      total_paid: number;
      remaining_amount: number;
      status: string;
      payment_status: string;
      created_at: string;
      updated_at: string;
    }>
  >("expenses", "/expenses", params.signal);

  return data.map(mapExpenseSummary);
}

export async function listAccountingNewTodos(
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

  return data.map(mapTodoSummary);
}

export async function listAccountingNewBankTransactions(
  params: AccountingNewListParams = {},
): Promise<AccountingNewBankTransactionSummary[]> {
  const data = await fetchAccountingNewJson<
    Array<{
      id: number;
      external_id: string | null;
      transaction_date: string;
      booked_date: string | null;
      amount: number;
      currency: string;
      variable_symbol: string | null;
      counterparty_name: string | null;
      message: string | null;
      direction: string;
      status: string;
      created_at: string;
      updated_at: string;
    }>
  >("bank-transactions", "/bank-transactions", params.signal);

  return data.map(mapBankTransactionSummary);
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
  params: AccountingNewListParams = {},
): Promise<AccountingNewRecurringTemplateSummary[]> {
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
      currency: string;
      vat_rate: number | null;
      created_at: string;
      updated_at: string;
    }>
  >("recurring-templates", "/recurring-templates", params.signal);

  return data.map(mapRecurringTemplateSummary);
}

export async function listAccountingNewAttachments(
  params: AccountingNewListParams = {},
): Promise<AccountingNewAttachmentSummary[]> {
  const data = await fetchAccountingNewJson<
    Array<{
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
    }>
  >("attachments", "/attachments", params.signal);

  return data.map(mapAttachmentSummary);
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
  params: AccountingNewListParams = {},
): Promise<AccountingNewSupplierSummary[]> {
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

  return data.map(mapSupplierSummary);
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
    listAccountingNewExpenses(params),
    listAccountingNewTodos(params),
    listAccountingNewBankTransactions(params),
    listAccountingNewAuditEvents(params),
    listAccountingNewRecurringTemplates(params),
    listAccountingNewAttachments(params),
    listAccountingNewSubjects(params),
    listAccountingNewSuppliers(params),
  ]);
  const partialErrors: AccountingNewApiError[] = [];
  let authRequired = false;

  function applyResult<T>(
    resource: string,
    result: PromiseSettledResult<T>,
    onSuccess: (value: T) => void,
  ) {
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
