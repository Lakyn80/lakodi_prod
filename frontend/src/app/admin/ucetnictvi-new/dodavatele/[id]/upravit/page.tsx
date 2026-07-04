import { AccountingNewSupplierForm } from "@/components/admin/accounting-new/AccountingNewSupplierForm";

export default async function AccountingNewSupplierEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AccountingNewSupplierForm mode="edit" supplierId={id} />;
}
