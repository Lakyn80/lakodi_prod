"use client";

import { AccountingNewDocumentStatusBadge } from "@/components/admin/accounting-new/AccountingNewDocumentStatusBadge";

export function AccountingNewRecurringStatusBadge({ label }: { label: string }) {
  return <AccountingNewDocumentStatusBadge label={label} />;
}
