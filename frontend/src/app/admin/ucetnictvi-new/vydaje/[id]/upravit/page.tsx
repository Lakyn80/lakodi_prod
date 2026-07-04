import { AccountingNewExpenseForm } from "@/components/admin/accounting-new/AccountingNewExpenseForm";

export default async function AccountingNewExpenseEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AccountingNewExpenseForm mode="edit" expenseId={id} />;
}
