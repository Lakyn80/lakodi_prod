import { AccountingNewAttachmentDetail } from "@/components/admin/accounting-new/AccountingNewAttachmentDetail";

export default async function AccountingNewAttachmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AccountingNewAttachmentDetail attachmentId={id} />;
}
