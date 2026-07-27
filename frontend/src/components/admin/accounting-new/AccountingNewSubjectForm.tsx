"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AccountingNewAresLookupSection } from "@/components/admin/accounting-new/AccountingNewAresLookupSection";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ACCOUNTING_NEW_ROUTE,
  AccountingNewRequestError,
  createAccountingNewSubject,
  getAccountingNewSubject,
  listAccountingNewSubjects,
  updateAccountingNewSubject,
} from "@/lib/accountingNew";
import { getAccountingNewModuleRoute } from "@/lib/accountingNewModuleRoutes";
import {
  buildAccountingNewSubjectFormStateFromDetail,
  buildAccountingNewSubjectWritePayloadFromForm,
  createEmptyAccountingNewSubjectFormState,
  findAccountingNewSubjectByIco,
} from "@/lib/accountingNewSubjectWrite";
import { consumeAccountingNewAresDraft } from "@/lib/accountingNewAresDraft";
import type { AccountingNewApiError, AccountingNewSubjectFormState, AccountingNewSubjectSummary } from "@/types/accountingNew";

export function AccountingNewSubjectForm({
  mode,
  subjectId,
}: {
  mode: "create" | "edit";
  subjectId?: string;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [form, setForm] = useState<AccountingNewSubjectFormState>(createEmptyAccountingNewSubjectFormState());
  const [existingSubjects, setExistingSubjects] = useState<AccountingNewSubjectSummary[]>([]);
  const [duplicateSubject, setDuplicateSubject] = useState<AccountingNewSubjectSummary | null>(null);
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const subjects = await listAccountingNewSubjects({ signal: controller.signal });
        setExistingSubjects(subjects);

        if (mode === "create") {
          const aresDraft = consumeAccountingNewAresDraft("subject");
          if (aresDraft) {
            setForm((current) => ({
              ...current,
              name: aresDraft.name,
              email: aresDraft.email,
              phone: aresDraft.phone,
              address: aresDraft.address,
              ico: aresDraft.ico,
              dic: aresDraft.dic,
              dataBox: aresDraft.dataBox,
              country: aresDraft.country || current.country,
            }));
          }
        }

        if (mode === "edit" && subjectId) {
          const detail = await getAccountingNewSubject(subjectId, { signal: controller.signal });
          setForm(buildAccountingNewSubjectFormStateFromDetail(detail));
        }
      } catch {
        if (!controller.signal.aborted) {
          setValidationError(t.subjectWrite.loadFailed);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [mode, subjectId, t.subjectWrite.loadFailed]);

  useEffect(() => {
    const match = findAccountingNewSubjectByIco(
      existingSubjects,
      form.ico,
      mode === "edit" && subjectId ? Number(subjectId) : undefined,
    );
    setDuplicateSubject(match);
  }, [existingSubjects, form.ico, mode, subjectId]);

  function validate(): string | null {
    if (!form.name.trim() || !form.email.trim() || !form.address.trim()) {
      return t.subjectWrite.validation.requiredFields;
    }
    if (duplicateSubject) {
      return t.subjectWrite.validation.duplicateIco;
    }
    return null;
  }

  async function submitForm() {
    setValidationError(null);
    setMutationError(null);
    setSuccessMessage(null);

    const error = validate();
    if (error) {
      setValidationError(error);
      return;
    }

    setIsSaving(true);
    try {
      const payload = buildAccountingNewSubjectWritePayloadFromForm(form);
      const result =
        mode === "create"
          ? await createAccountingNewSubject(payload)
          : await updateAccountingNewSubject(subjectId!, payload);

      setSuccessMessage(mode === "create" ? t.subjectWrite.mutation.createSuccess : t.subjectWrite.mutation.updateSuccess);
      window.location.href = `${ACCOUNTING_NEW_ROUTE}/odberatele/${result.id}`;
    } catch (error) {
      if (error instanceof AccountingNewRequestError) {
        setMutationError(error.apiError);
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading && mode === "edit") {
    return <p className="text-sm text-muted-foreground">{t.subjectWrite.loading}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("subjects")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={mode === "edit" && subjectId ? `${ACCOUNTING_NEW_ROUTE}/odberatele/${subjectId}` : getAccountingNewModuleRoute("subjects")}>
            {t.subjectWrite.backToDetail}
          </Link>
        </Button>
      </div>

      <AccountingNewMutationNotice successMessage={successMessage} error={mutationError} />

      {validationError ? (
        <Alert variant="destructive">
          <AlertTitle>{t.subjectWrite.validation.title}</AlertTitle>
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      ) : null}

      {duplicateSubject ? (
        <Alert>
          <AlertTitle>{t.subjectWrite.duplicate.title}</AlertTitle>
          <AlertDescription>
            {t.subjectWrite.duplicate.description.replace("{name}", duplicateSubject.name)}
            <Button variant="link" className="h-auto p-0 pl-1" asChild>
              <Link href={`${ACCOUNTING_NEW_ROUTE}/odberatele/${duplicateSubject.id}`}>{t.subjectWrite.duplicate.useExisting}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle
            data-testid={
              mode === "create"
                ? "accounting-new-subject-form-title-create"
                : "accounting-new-subject-form-title-edit"
            }
          >
            {mode === "create" ? t.subjectWrite.createTitle : t.subjectWrite.editTitle}
          </CardTitle>
          <CardDescription>{t.subjectWrite.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submitForm();
            }}
          >
            <AccountingNewAresLookupSection
              values={form}
              onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="subjectNote">{t.subjectWrite.fields.note}</Label>
                <Input
                  id="subjectNote"
                  value={form.note}
                  onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subjectCountry">{t.subjectWrite.fields.country}</Label>
                <Input
                  id="subjectCountry"
                  value={form.country}
                  onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subjectDataBox">{t.subjectWrite.fields.dataBox}</Label>
                <Input
                  id="subjectDataBox"
                  value={form.dataBox}
                  onChange={(event) => setForm((current) => ({ ...current, dataBox: event.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isSaving || Boolean(duplicateSubject)}>
                {mode === "create" ? t.subjectWrite.save : t.subjectWrite.update}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
