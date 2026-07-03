import type { AccountingNewModuleAvailability, AccountingNewModuleId as AccountingNewGridModuleId } from "@/types/accountingNew";

export type AccountingNewModuleId =
  | "dashboard"
  | "documents"
  | "document-detail"
  | "expenses"
  | "expense-detail"
  | "suppliers"
  | "supplier-detail"
  | "bank-transactions"
  | "bank-transaction-detail"
  | "payment-matching"
  | "reminders"
  | "todo-detail"
  | "reminder-emails"
  | "reminder-email-detail"
  | "attachments"
  | "recurring"
  | "recurring-detail"
  | "exports"
  | "audit";

export type AccountingNewEntityType =
  | "dashboard"
  | "document"
  | "expense"
  | "supplier"
  | "bankTransaction"
  | "bank_transaction"
  | "paymentMatch"
  | "payment_match"
  | "auditEvent"
  | "audit_event"
  | "attachment"
  | "reminder"
  | "todo"
  | "reminderEmail"
  | "reminder_email"
  | "recurringTemplate"
  | "recurring_template"
  | "recurringGeneration"
  | "recurring_generation"
  | "export";

export type AccountingNewFeatureStatus = "implemented-read-only" | "deferred" | "future";

export type AccountingNewSearchableField =
  | "number"
  | "invoiceNumber"
  | "expenseNumber"
  | "variableSymbol"
  | "customerName"
  | "supplierName"
  | "counterpartyName"
  | "amount"
  | "currency"
  | "issueDate"
  | "dueDate"
  | "paymentStatus"
  | "effectiveStatus"
  | "status"
  | "reason"
  | "confidence"
  | "message"
  | "note"
  | "rawPayload"
  | "country"
  | "ico"
  | "dic"
  | "documentsLoaded"
  | "expensesLoaded"
  | "bankTransactionsLoaded"
  | "title"
  | "priority"
  | "relatedDocumentNumber"
  | "relatedInvoiceNumber"
  | "recipientEmail"
  | "subject"
  | "bodyPreview"
  | "sentAt"
  | "createdAt"
  | "templateNumber"
  | "frequency"
  | "interval"
  | "nextRunAt"
  | "lastRunAt"
  | "startDate"
  | "endDate"
  | "documentType"
  | "runDate"
  | "originalFilename"
  | "attachmentType"
  | "name"
  | "entityType"
  | "eventType";

export interface AccountingNewSearchableFieldMetadata {
  field: AccountingNewSearchableField;
  labelKey: string;
  weight: number;
}

export interface AccountingNewRagMetadata {
  entityType: AccountingNewEntityType;
  labelKey: string;
  searchableFields: AccountingNewSearchableFieldMetadata[];
}

export interface AccountingNewVoiceMetadata {
  labelKey: string;
  aliasKeys: string[];
}

export interface AccountingNewCapabilityFlags {
  read: AccountingNewModuleAvailability;
  write: boolean;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canSend: boolean;
  canExport: boolean;
  canImport: boolean;
  canApply: boolean;
  canGenerate: boolean;
}

export interface AccountingNewModuleRegistryEntry {
  id: AccountingNewModuleId;
  route: string;
  labelKey: string;
  descriptionKey: string;
  entityType: AccountingNewEntityType;
  capabilities: AccountingNewCapabilityFlags;
  readAvailability: AccountingNewModuleAvailability;
  writeEnabled: boolean;
  featureStatus: AccountingNewFeatureStatus;
  rag: AccountingNewRagMetadata;
  voice: AccountingNewVoiceMetadata;
  relatedModuleIds: AccountingNewModuleId[];
  gridModuleId?: AccountingNewGridModuleId;
}
