import type { AccountingNewModuleId } from "@/types/accountingNew";

export const ACCOUNTING_NEW_BASE_ROUTE = "/admin/ucetnictvi-new";

const ACCOUNTING_NEW_MODULE_ROUTES: Record<AccountingNewModuleId, string> = {
  dashboard: ACCOUNTING_NEW_BASE_ROUTE,
  documents: `${ACCOUNTING_NEW_BASE_ROUTE}/doklady`,
  subjects: `${ACCOUNTING_NEW_BASE_ROUTE}/odberatele`,
  expenses: `${ACCOUNTING_NEW_BASE_ROUTE}/vydaje`,
  suppliers: `${ACCOUNTING_NEW_BASE_ROUTE}/dodavatele`,
  "bank-transactions": `${ACCOUNTING_NEW_BASE_ROUTE}/bankovni-transakce`,
  "payment-matching": `${ACCOUNTING_NEW_BASE_ROUTE}/parovani-plateb`,
  reminders: `${ACCOUNTING_NEW_BASE_ROUTE}/ukoly`,
  attachments: `${ACCOUNTING_NEW_BASE_ROUTE}/prilohy`,
  recurring: `${ACCOUNTING_NEW_BASE_ROUTE}/opakovane`,
  settings: `${ACCOUNTING_NEW_BASE_ROUTE}/nastaveni`,
  exports: `${ACCOUNTING_NEW_BASE_ROUTE}/exporty`,
  audit: `${ACCOUNTING_NEW_BASE_ROUTE}/audit`,
  "ai-assistant": `${ACCOUNTING_NEW_BASE_ROUTE}/ai-asistent`,
};

export function getAccountingNewModuleRoute(moduleId: AccountingNewModuleId): string {
  return ACCOUNTING_NEW_MODULE_ROUTES[moduleId];
}

export const accountingNewHashRedirects: Record<string, string> = {
  documents: getAccountingNewModuleRoute("documents"),
  subjects: getAccountingNewModuleRoute("subjects"),
  expenses: getAccountingNewModuleRoute("expenses"),
  suppliers: getAccountingNewModuleRoute("suppliers"),
  "bank-transactions": getAccountingNewModuleRoute("bank-transactions"),
  "payment-matching": getAccountingNewModuleRoute("payment-matching"),
  reminders: getAccountingNewModuleRoute("reminders"),
  "reminder-emails": getAccountingNewModuleRoute("reminders"),
  attachments: getAccountingNewModuleRoute("attachments"),
  "attachment-inbox": getAccountingNewModuleRoute("attachments"),
  recurring: getAccountingNewModuleRoute("recurring"),
  settings: getAccountingNewModuleRoute("settings"),
  exports: getAccountingNewModuleRoute("exports"),
  audit: getAccountingNewModuleRoute("audit"),
  "ai-assistant": getAccountingNewModuleRoute("ai-assistant"),
};
