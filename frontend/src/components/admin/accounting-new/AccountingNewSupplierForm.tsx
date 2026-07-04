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
  createAccountingNewSupplier,
  getAccountingNewSupplier,
  listAccountingNewSuppliers,
  updateAccountingNewSupplier,
} from "@/lib/accountingNew";
import {
  buildAccountingNewSupplierFormStateFromDetail,
  buildAccountingNewSupplierWritePayloadFromForm,
  createEmptyAccountingNewSupplierFormState,
  findAccountingNewSupplierByIco,
} from "@/lib/accountingNewSupplierWrite";
import type { AccountingNewApiError, AccountingNewSupplierFormState, AccountingNewSupplierListItem } from "@/types/accountingNew";

export function AccountingNewSupplierForm({
  mode,
  supplierId,
}: {
  mode: "create" | "edit";
  supplierId?: string;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [form, setForm] = useState<AccountingNewSupplierFormState>(createEmptyAccountingNewSupplierFormState());
  const [existingSuppliers, setExistingSuppliers] = useState<AccountingNewSupplierListItem[]>([]);
  const [duplicateSupplier, setDuplicateSupplier] = useState<AccountingNewSupplierListItem | null>(null);
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const suppliers = await listAccountingNewSuppliers({}, { signal: controller.signal });
        setExistingSuppliers(suppliers);

        if (mode === "edit" && supplierId) {
          const detail = await getAccountingNewSupplier(supplierId, { signal: controller.signal });
          setForm(buildAccountingNewSupplierFormStateFromDetail(detail));
        }
      } catch {
        if (!controller.signal.aborted) {
          setValidationError(t.supplierWrite.loading);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [mode, supplierId, t.supplierWrite.loading]);

  useEffect(() => {
    const match = findAccountingNewSupplierByIco(
      existingSuppliers,
      form.ico,
      mode === "edit" && supplierId ? Number(supplierId) : undefined,
    );
    setDuplicateSupplier(match);
  }, [existingSuppliers, form.ico, mode, supplierId]);

  function validate(): string | null {
    if (!form.name.trim() || !form.email.trim() || !form.address.trim()) {
      return t.supplierWrite.validation.requiredFields;
    }
    if (duplicateSupplier) {
      return t.supplierWrite.validation.duplicateIco;
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
      const payload = buildAccountingNewSupplierWritePayloadFromForm(form);
      const result =
        mode === "create"
          ? await createAccountingNewSupplier(payload)
          : await updateAccountingNewSupplier(supplierId!, payload);

      setSuccessMessage(mode === "create" ? t.supplierWrite.mutation.createSuccess : t.supplierWrite.mutation.updateSuccess);
      window.location.href = `${ACCOUNTING_NEW_ROUTE}/dodavatele/${result.id}`;
    } catch (error) {
      if (error instanceof AccountingNewRequestError) {
        setMutationError(error.apiError);
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t.supplierWrite.loading}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" asChild>
          <Link href={ACCOUNTING_NEW_ROUTE}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={mode === "edit" && supplierId ? `${ACCOUNTING_NEW_ROUTE}/dodavatele/${supplierId}` : ACCOUNTING_NEW_ROUTE}>
            {t.supplierWrite.backToDetail}
          </Link>
        </Button>
      </div>

      <AccountingNewMutationNotice successMessage={successMessage} error={mutationError} />

      {validationError ? (
        <Alert variant="destructive">
          <AlertTitle>{t.supplierWrite.validation.title}</AlertTitle>
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      ) : null}

      {duplicateSupplier ? (
        <Alert>
          <AlertTitle>{t.supplierWrite.duplicate.title}</AlertTitle>
          <AlertDescription>
            {t.supplierWrite.duplicate.description.replace("{name}", duplicateSupplier.name)}
            <Button variant="link" className="h-auto p-0 pl-1" asChild>
              <Link href={`${ACCOUNTING_NEW_ROUTE}/dodavatele/${duplicateSupplier.id}`}>{t.supplierWrite.duplicate.useExisting}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{mode === "create" ? t.supplierWrite.createTitle : t.supplierWrite.editTitle}</CardTitle>
          <CardDescription>{t.supplierWrite.description}</CardDescription>
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
                <Label htmlFor="supplierNote">{t.supplierWrite.fields.note}</Label>
                <Input
                  id="supplierNote"
                  value={form.note}
                  onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplierCountry">{t.supplierWrite.fields.country}</Label>
                <Input
                  id="supplierCountry"
                  value={form.country}
                  onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplierDataBox">{t.supplierWrite.fields.dataBox}</Label>
                <Input
                  id="supplierDataBox"
                  value={form.dataBox}
                  onChange={(event) => setForm((current) => ({ ...current, dataBox: event.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isSaving || Boolean(duplicateSupplier)}>
                {mode === "create" ? t.supplierWrite.save : t.supplierWrite.update}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
