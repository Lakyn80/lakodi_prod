import { AccountingNewReminderEmailDetail } from "@/components/admin/accounting-new/AccountingNewReminderEmailDetail";

export default async function AccountingNewReminderEmailDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invoiceId?: string }>;
}) {
  const { id } = await params;
  const { invoiceId } = await searchParams;

  return <AccountingNewReminderEmailDetail reminderEmailId={id} invoiceId={invoiceId ?? null} />;
}
