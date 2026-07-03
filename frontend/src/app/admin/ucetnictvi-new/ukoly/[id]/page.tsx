import { AccountingNewTodoDetail } from "@/components/admin/accounting-new/AccountingNewTodoDetail";

export default async function AccountingNewTodoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AccountingNewTodoDetail todoId={id} />;
}
