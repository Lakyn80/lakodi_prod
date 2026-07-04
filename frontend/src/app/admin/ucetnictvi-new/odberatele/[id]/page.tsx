import { AccountingNewSubjectDetail } from "@/components/admin/accounting-new/AccountingNewSubjectDetail";

export default async function AccountingNewSubjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AccountingNewSubjectDetail subjectId={id} />;
}
