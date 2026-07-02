"use client";

import { Badge } from "@/components/ui/badge";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateAccountingNewStatus } from "@/components/admin/accounting-new/accountingNewFormat";

function getVariant(value: string): "default" | "secondary" | "outline" {
  const normalized = value.trim().toLowerCase();

  if (normalized.includes("paid") || normalized.includes("uhra") || normalized === "done" || normalized === "completed") {
    return "default";
  }

  if (normalized.includes("overdue") || normalized.includes("unpaid") || normalized.includes("open")) {
    return "outline";
  }

  return "secondary";
}

export function AccountingNewDocumentStatusBadge({
  label,
}: {
  label: string;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;

  return <Badge variant={getVariant(label)}>{translateAccountingNewStatus(t, label)}</Badge>;
}
