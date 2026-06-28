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

export interface AccountingNewModuleDefinition {
  id: AccountingNewModuleId;
  title: string;
  description: string;
  availability: "placeholder";
}
