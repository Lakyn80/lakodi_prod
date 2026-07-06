import { AccountingNewRecurringTemplateForm } from "@/components/admin/accounting-new/AccountingNewRecurringTemplateForm";

export default async function AccountingNewRecurringTemplateEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AccountingNewRecurringTemplateForm mode="edit" templateId={id} />;
}
