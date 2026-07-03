"use client";

import { AccountingNewDocumentStatusBadge } from "@/components/admin/accounting-new/AccountingNewDocumentStatusBadge";

export function AccountingNewTodoStatusBadge({ label }: { label: string }) {
  return <AccountingNewDocumentStatusBadge label={label} />;
}
