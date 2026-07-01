import { AccountingNewSupplierDetail } from "@/components/admin/accounting-new/AccountingNewSupplierDetail";

export default async function AccountingNewSupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AccountingNewSupplierDetail supplierId={id} />;
}
