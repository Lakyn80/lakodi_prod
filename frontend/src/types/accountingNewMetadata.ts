import type { AccountingNewModuleAvailability, AccountingNewModuleId } from "@/types/accountingNew";

export type AccountingNewMetadataModuleId =
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
  | "attachments"
  | "recurring"
  | "exports"
  | "audit";

export type AccountingNewEntityType =
  | "dashboard"
  | "document"
  | "expense"
  | "supplier"
  | "bank_transaction"
  | "payment_match"
  | "todo"
  | "attachment"
  | "recurring_template"
  | "audit_event";

export type AccountingNewFeatureStatus = "implemented-read-only" | "deferred" | "future";

export interface AccountingNewSearchableFieldMetadata {
  field: string;
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

export interface AccountingNewModuleRegistryEntry {
  id: AccountingNewMetadataModuleId;
  route: string;
  labelKey: string;
  descriptionKey: string;
  entityType: AccountingNewEntityType;
  readAvailability: AccountingNewModuleAvailability;
  writeEnabled: boolean;
  featureStatus: AccountingNewFeatureStatus;
  rag: AccountingNewRagMetadata;
  voice: AccountingNewVoiceMetadata;
  relatedModuleIds: AccountingNewMetadataModuleId[];
  gridModuleId?: AccountingNewModuleId;
}
