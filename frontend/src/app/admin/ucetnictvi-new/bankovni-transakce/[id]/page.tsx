import { AccountingNewBankTransactionDetail } from "@/components/admin/accounting-new/AccountingNewBankTransactionDetail";

export default async function AccountingNewBankTransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AccountingNewBankTransactionDetail transactionId={id} />;
}
