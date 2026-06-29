import { AccountingNewDocumentDetail } from "@/components/admin/accounting-new/AccountingNewDocumentDetail";

export default async function AccountingNewDocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AccountingNewDocumentDetail documentId={id} />;
}
