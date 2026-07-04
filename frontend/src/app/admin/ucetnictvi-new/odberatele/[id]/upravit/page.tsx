import { AccountingNewSubjectForm } from "@/components/admin/accounting-new/AccountingNewSubjectForm";

export default async function AccountingNewSubjectEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AccountingNewSubjectForm mode="edit" subjectId={id} />;
}
