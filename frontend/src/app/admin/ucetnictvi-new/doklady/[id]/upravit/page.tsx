import { AccountingNewDocumentForm } from "@/components/admin/accounting-new/AccountingNewDocumentForm";

export default async function AccountingNewDocumentEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AccountingNewDocumentForm mode="edit" documentId={id} />;
}
