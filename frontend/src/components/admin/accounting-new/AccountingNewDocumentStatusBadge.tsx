import { Badge } from "@/components/ui/badge";

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
  return <Badge variant={getVariant(label)}>{label}</Badge>;
}
