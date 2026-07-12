"use client";

import { FormEvent, useEffect, useState } from "react";

import { useAccountingNewCollapsibleList } from "@/components/admin/accounting-new/useAccountingNewCollapsibleList";
import { AccountingNewConfirmDialog } from "@/components/admin/accounting-new/AccountingNewConfirmDialog";
import { AccountingNewCurrencySelect } from "@/components/admin/accounting-new/AccountingNewCurrencySelect";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { AccountingNewPaymentMethodSelect } from "@/components/admin/accounting-new/AccountingNewPaymentMethodSelect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  AccountingNewRequestError,
  getAccountingNewSettings,
  updateAccountingNewSettings,
} from "@/lib/accountingNew";
import {
  buildAccountingNewSettingsFormStateFromSettings,
  buildAccountingNewSettingsWritePayloadFromForm,
  createEmptyAccountingNewSettingsFormState,
} from "@/lib/accountingNewSettingsWrite";
import type { AccountingNewApiError, AccountingNewSettingsFormState } from "@/types/accountingNew";
import { translateAccountingNewApiError } from "@/components/admin/accounting-new/accountingNewFormat";
import { paymentMethodIdToBackendValue } from "@/lib/accountingNewPaymentMethods";

export function AccountingNewSettingsPanel({ defaultExpanded = false }: { defaultExpanded?: boolean } = {}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const { expanded, toggle, isContentVisible } = useAccountingNewCollapsibleList(defaultExpanded);
  const [form, setForm] = useState<AccountingNewSettingsFormState>(createEmptyAccountingNewSettingsFormState());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [loadError, setLoadError] = useState<AccountingNewApiError | null>(null);
  const [mutationError, setMutationError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const contentVisible = isContentVisible(authRequired, loadError);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSettings() {
      setIsLoading(true);
      setLoadError(null);
      setAuthRequired(false);

      try {
        const settings = await getAccountingNewSettings({ signal: controller.signal });
        setForm(buildAccountingNewSettingsFormStateFromSettings(settings));
      } catch (error) {
        if (controller.signal.aborted) return;
        const apiError =
          error instanceof AccountingNewRequestError
            ? error.apiError
            : {
                resource: "settings",
                message: error instanceof Error ? error.message : t.settingsWrite.mutation.errorTitle,
                status: null,
                requiresLogin: false,
              };
        if (apiError.requiresLogin || apiError.status === 401) {
          setAuthRequired(true);
        } else {
          setLoadError(apiError);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadSettings();
    return () => controller.abort();
  }, [t.settingsWrite.mutation.errorTitle]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMutationError(null);
    setSuccessMessage(null);

    try {
      const settings = await updateAccountingNewSettings(buildAccountingNewSettingsWritePayloadFromForm(form));
      setForm(buildAccountingNewSettingsFormStateFromSettings(settings));
      setSuccessMessage(t.settingsWrite.mutation.success);
    } catch (error) {
      setMutationError(
        error instanceof AccountingNewRequestError
          ? error.apiError
          : {
              resource: "settings-update",
              message: error instanceof Error ? error.message : t.settingsWrite.mutation.errorTitle,
              status: null,
              requiresLogin: false,
            },
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline">{t.settingsWrite.badge}</Badge>
          <Button type="button" variant="outline" size="sm" onClick={toggle}>
            {expanded ? t.settingsWrite.hideSection : t.settingsWrite.showSection}
          </Button>
        </div>
        <div className="space-y-1">
          <CardTitle>{t.settingsWrite.title}</CardTitle>
          <CardDescription>{t.settingsWrite.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t.settingsWrite.sectionCollapsed}</p>

        {authRequired ? (
          <Alert>
            <AlertTitle>{t.auth.documentsTitle}</AlertTitle>
            <AlertDescription>{t.auth.documentsDescription}</AlertDescription>
          </Alert>
        ) : null}

        {loadError ? (
          <Alert variant="destructive">
            <AlertTitle>{t.settingsWrite.mutation.errorTitle}</AlertTitle>
            <AlertDescription>{translateAccountingNewApiError(t, loadError)}</AlertDescription>
          </Alert>
        ) : null}

        {contentVisible ? (
          <>
            {mutationError ? <AccountingNewMutationNotice error={mutationError} /> : null}

            {successMessage ? (
              <Alert className="mb-4">
                <AlertTitle>{t.documentWrite.mutation.successTitle}</AlertTitle>
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            ) : null}

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <form className="space-y-6" onSubmit={handleSubmit}>
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">{t.settingsWrite.sections.issuer}</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t.settingsWrite.fields.ownerEmail} id="ownerEmail" value={form.ownerEmail} onChange={(value) => setForm((c) => ({ ...c, ownerEmail: value }))} />
                <Field label={t.settingsWrite.fields.issuerName} id="issuerName" value={form.issuerName} onChange={(value) => setForm((c) => ({ ...c, issuerName: value }))} />
                <Field label={t.settingsWrite.fields.issuerAddress} id="issuerAddress" value={form.issuerAddress} onChange={(value) => setForm((c) => ({ ...c, issuerAddress: value }))} />
                <Field label={t.settingsWrite.fields.issuerCity} id="issuerCity" value={form.issuerCity} onChange={(value) => setForm((c) => ({ ...c, issuerCity: value }))} />
                <Field label={t.settingsWrite.fields.issuerZip} id="issuerZip" value={form.issuerZip} onChange={(value) => setForm((c) => ({ ...c, issuerZip: value }))} />
                <Field label={t.settingsWrite.fields.issuerIco} id="issuerIco" value={form.issuerIco} onChange={(value) => setForm((c) => ({ ...c, issuerIco: value }))} />
                <Field label={t.settingsWrite.fields.issuerDic} id="issuerDic" value={form.issuerDic} onChange={(value) => setForm((c) => ({ ...c, issuerDic: value }))} />
                <Field label={t.settingsWrite.fields.issuerDataBox} id="issuerDataBox" value={form.issuerDataBox} onChange={(value) => setForm((c) => ({ ...c, issuerDataBox: value }))} />
                <Field label={t.settingsWrite.fields.issuerEmail} id="issuerEmail" value={form.issuerEmail} onChange={(value) => setForm((c) => ({ ...c, issuerEmail: value }))} />
                <Field label={t.settingsWrite.fields.issuerPhone} id="issuerPhone" value={form.issuerPhone} onChange={(value) => setForm((c) => ({ ...c, issuerPhone: value }))} />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">{t.settingsWrite.sections.defaults}</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <AccountingNewCurrencySelect
                  id="defaultCurrency"
                  label={t.settingsWrite.fields.defaultCurrency}
                  value={form.defaultCurrency}
                  onChange={(defaultCurrency) => setForm((c) => ({ ...c, defaultCurrency }))}
                />
                <Field label={t.settingsWrite.fields.defaultDueDays} id="defaultDueDays" value={form.defaultDueDays} onChange={(value) => setForm((c) => ({ ...c, defaultDueDays: value }))} />
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="defaultNote">{t.settingsWrite.fields.defaultNote}</Label>
                  <Textarea id="defaultNote" value={form.defaultNote} onChange={(event) => setForm((c) => ({ ...c, defaultNote: event.target.value }))} />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">{t.settingsWrite.sections.payment}</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <AccountingNewPaymentMethodSelect
                    id="paymentMethod"
                    label={t.settingsWrite.fields.paymentMethod}
                    value={form.paymentMethod}
                    onChange={(paymentMethod) =>
                      setForm((c) => ({ ...c, paymentMethod: paymentMethodIdToBackendValue(paymentMethod) }))
                    }
                  />
                </div>
                <Field label={t.settingsWrite.fields.bankAccountNumber} id="bankAccountNumber" value={form.bankAccountNumber} onChange={(value) => setForm((c) => ({ ...c, bankAccountNumber: value }))} />
                <Field label={t.settingsWrite.fields.bankAccountPrefix} id="bankAccountPrefix" value={form.bankAccountPrefix} onChange={(value) => setForm((c) => ({ ...c, bankAccountPrefix: value }))} />
                <Field label={t.settingsWrite.fields.bankCode} id="bankCode" value={form.bankCode} onChange={(value) => setForm((c) => ({ ...c, bankCode: value }))} />
                <Field label={t.settingsWrite.fields.bankIban} id="bankIban" value={form.bankIban} onChange={(value) => setForm((c) => ({ ...c, bankIban: value }))} />
              </div>
            </section>

            <Button type="submit" disabled={isSaving}>
              {t.settingsWrite.save}
            </Button>
              </form>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
