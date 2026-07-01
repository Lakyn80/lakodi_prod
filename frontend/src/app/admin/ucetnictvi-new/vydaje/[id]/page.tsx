import { AccountingNewExpenseDetail } from "@/components/admin/accounting-new/AccountingNewExpenseDetail";

export default async function AccountingNewExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AccountingNewExpenseDetail expenseId={id} />;
}
