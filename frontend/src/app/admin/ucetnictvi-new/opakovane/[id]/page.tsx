import { AccountingNewRecurringTemplateDetail } from "@/components/admin/accounting-new/AccountingNewRecurringTemplateDetail";

export default async function AccountingNewRecurringTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AccountingNewRecurringTemplateDetail templateId={id} />;
}
