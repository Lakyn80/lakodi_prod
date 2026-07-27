"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { AccountingNewCurrencySelect } from "@/components/admin/accounting-new/AccountingNewCurrencySelect";
import { AccountingNewMoneyInput } from "@/components/admin/accounting-new/AccountingNewMoneyInput";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { AccountingNewPaymentMethodSelect } from "@/components/admin/accounting-new/AccountingNewPaymentMethodSelect";
import { AccountingNewSubjectPicker } from "@/components/admin/accounting-new/AccountingNewSubjectPicker";
import { AccountingNewSupplierPicker } from "@/components/admin/accounting-new/AccountingNewSupplierPicker";
import { translateAccountingNewRecurringFrequency } from "@/components/admin/accounting-new/accountingNewFormat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ACCOUNTING_NEW_ROUTE,
  AccountingNewRequestError,
  createAccountingNewRecurringTemplate,
  getAccountingNewRecurringTemplate,
  listAccountingNewSubjects,
  listAccountingNewSuppliers,
  updateAccountingNewRecurringTemplate,
} from "@/lib/accountingNew";
import { getAccountingNewModuleRoute } from "@/lib/accountingNewModuleRoutes";
import { parseAccountingNewMoneyInput } from "@/lib/accountingNewMoney";
import {
  ACCOUNTING_NEW_RECURRING_INTERVALS,
  ACCOUNTING_NEW_RECURRING_STATUSES,
  buildAccountingNewRecurringTemplateFormStateFromDetail,
  buildAccountingNewRecurringTemplateWritePayloadFromForm,
  createEmptyAccountingNewRecurringTemplateFormState,
} from "@/lib/accountingNewRecurringWrite";
import { applyAccountingNewSupplierToRecurringTemplateForm } from "@/lib/accountingNewSupplierWrite";
import type {
  AccountingNewApiError,
  AccountingNewRecurringTemplateFormState,
  AccountingNewSubjectSummary,
  AccountingNewSupplierListItem,
} from "@/types/accountingNew";

function createEmptyItem() {
  return { description: "", quantity: "1", unitPrice: "0" };
}

export function AccountingNewRecurringTemplateForm({
  mode,
  templateId,
}: {
  mode: "create" | "edit";
  templateId?: string;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [form, setForm] = useState<AccountingNewRecurringTemplateFormState>(
    createEmptyAccountingNewRecurringTemplateFormState(),
  );
  const [suppliers, setSuppliers] = useState<AccountingNewSupplierListItem[]>([]);
  const [subjects, setSubjects] = useState<AccountingNewSubjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<AccountingNewApiError | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialData() {
      try {
        const [loadedSuppliers, loadedSubjects] = await Promise.all([
          listAccountingNewSuppliers({}, { signal: controller.signal }),
          listAccountingNewSubjects({ signal: controller.signal }),
        ]);
        setSuppliers(loadedSuppliers);
        setSubjects(loadedSubjects);

        if (mode === "edit" && templateId) {
          const detail = await getAccountingNewRecurringTemplate(templateId, { signal: controller.signal });
          setForm(buildAccountingNewRecurringTemplateFormStateFromDetail(detail));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof AccountingNewRequestError) {
          setMutationError(error.apiError);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialData();
    return () => controller.abort();
  }, [mode, templateId]);

  function validate(): string | null {
    if (!form.name.trim()) {
      return t.recurringForm.validation.nameRequired;
    }

    if (!form.nextRunDate) {
      return t.recurringForm.validation.nextRunDateRequired;
    }

    if (form.templateType === "invoice" && !form.subjectId.trim()) {
      return t.recurringForm.validation.subjectRequired;
    }

    if (form.templateType === "expense") {
      if (!form.supplierId.trim()) {
        return t.recurringForm.validation.supplierRequired;
      }
      if (!form.bankAccountNumber.trim() || !form.bankCode.trim()) {
        return t.recurringForm.validation.paymentRequired;
      }
    }

    if (form.items.length === 0 || form.items.every((item) => !item.description.trim())) {
      return t.recurringForm.validation.itemsRequired;
    }

    if (form.items.some((item) => Number(item.quantity.replace(",", ".")) <= 0)) {
      return t.recurringForm.validation.itemNumbers;
    }

    if (form.items.some((item) => !parseAccountingNewMoneyInput(item.unitPrice, form.currency).ok)) {
      return t.money.invalidFormat;
    }

    return null;
  }

  async function submitForm() {
    setValidationError(null);
    setMutationError(null);

    const error = validate();
    if (error) {
      setValidationError(error);
      return;
    }

    setIsSaving(true);
    try {
      const payload = buildAccountingNewRecurringTemplateWritePayloadFromForm(form);
      const result =
        mode === "create"
          ? await createAccountingNewRecurringTemplate(payload)
          : await updateAccountingNewRecurringTemplate(templateId!, payload);

      window.location.href = `${ACCOUNTING_NEW_ROUTE}/opakovane/${result.id}`;
    } catch (submitError) {
      if (submitError instanceof Error && submitError.message === "INVALID_MONEY") {
        setValidationError(t.money.invalidFormat);
        return;
      }

      if (submitError instanceof AccountingNewRequestError) {
        setMutationError(submitError.apiError);
      } else {
        setMutationError({
          resource: "recurring-form",
          message: t.errors.actionFailed,
          status: null,
          requiresLogin: false,
        });
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t.recurringForm.loading}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("recurring")}>{t.navigation.backToDashboard}</Link>
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle
            data-testid={
              mode === "create"
                ? "accounting-new-recurring-form-title-create"
                : "accounting-new-recurring-form-title-edit"
            }
          >
            {mode === "create" ? t.recurringForm.createTitle : t.recurringForm.editTitle}
          </CardTitle>
          <CardDescription>{t.recurringForm.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {validationError ? (
            <Alert variant="destructive">
              <AlertTitle>{t.recurringForm.validation.title}</AlertTitle>
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          ) : null}
          {mutationError ? <AccountingNewMutationNotice error={mutationError} /> : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="template-type">{t.recurringForm.fields.templateType}</Label>
              <select
                id="template-type"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.templateType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    templateType: event.target.value as AccountingNewRecurringTemplateFormState["templateType"],
                  }))
                }
              >
                <option value="invoice">{t.recurringForm.templateTypes.invoice}</option>
                <option value="expense">{t.recurringForm.templateTypes.expense}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-name">{t.recurringForm.fields.name}</Label>
              <Input
                id="template-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            {form.templateType === "invoice" ? (
              <div className="space-y-2">
                <Label htmlFor="document-kind">{t.recurringForm.fields.documentKind}</Label>
                <select
                  id="document-kind"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.documentKind}
                  onChange={(event) => setForm((current) => ({ ...current, documentKind: event.target.value }))}
                >
                  <option value="invoice">{t.documentKinds.invoice}</option>
                  <option value="proforma">{t.documentKinds.proforma}</option>
                </select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="template-status">{t.recurringForm.fields.status}</Label>
              <select
                id="template-status"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              >
                {ACCOUNTING_NEW_RECURRING_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurrence-interval">{t.recurringForm.fields.recurrenceInterval}</Label>
              <select
                id="recurrence-interval"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.recurrenceInterval}
                onChange={(event) => setForm((current) => ({ ...current, recurrenceInterval: event.target.value }))}
              >
                {ACCOUNTING_NEW_RECURRING_INTERVALS.map((interval) => (
                  <option key={interval} value={interval}>
                    {translateAccountingNewRecurringFrequency(t, interval)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurrence-count">{t.recurringForm.fields.recurrenceCount}</Label>
              <Input
                id="recurrence-count"
                inputMode="numeric"
                value={form.recurrenceCount}
                onChange={(event) => setForm((current) => ({ ...current, recurrenceCount: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next-run-date">{t.recurringForm.fields.nextRunDate}</Label>
              <Input
                id="next-run-date"
                type="date"
                value={form.nextRunDate}
                onChange={(event) => setForm((current) => ({ ...current, nextRunDate: event.target.value }))}
              />
            </div>
            <AccountingNewCurrencySelect
              id="currency"
              label={t.recurringForm.fields.currency}
              value={form.currency}
              onChange={(currency) => setForm((current) => ({ ...current, currency }))}
            />
          </div>

          {form.templateType === "invoice" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <AccountingNewSubjectPicker
                subjects={subjects}
                selectedSubjectId={form.subjectId}
                onSelect={(subject) => setForm((current) => ({ ...current, subjectId: String(subject.id) }))}
                onClear={() => setForm((current) => ({ ...current, subjectId: "" }))}
              />
              <div className="space-y-2">
                <Label htmlFor="business-mode">{t.recurringForm.fields.businessMode}</Label>
                <select
                  id="business-mode"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.businessMode}
                  onChange={(event) => setForm((current) => ({ ...current, businessMode: event.target.value }))}
                >
                  <option value="autoservice">{t.documentWrite.businessModes.autoservice}</option>
                  <option value="construction">{t.documentWrite.businessModes.construction}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax-mode">{t.recurringForm.fields.taxMode}</Label>
                <select
                  id="tax-mode"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.taxMode}
                  onChange={(event) => setForm((current) => ({ ...current, taxMode: event.target.value }))}
                >
                  <option value="standard">{t.documentWrite.taxModes.standard}</option>
                  <option value="reverse_charge">{t.documentWrite.taxModes.reverse_charge}</option>
                </select>
              </div>
              {form.taxMode === "standard" ? (
                <div className="space-y-2">
                  <Label htmlFor="vat-rate">{t.recurringForm.fields.vatRate}</Label>
                  <Input
                    id="vat-rate"
                    inputMode="decimal"
                    value={form.vatRate}
                    onChange={(event) => setForm((current) => ({ ...current, vatRate: event.target.value }))}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <AccountingNewSupplierPicker
              suppliers={suppliers}
              selectedSupplierId={form.supplierId}
              onSelect={(supplier) =>
                setForm((current) => applyAccountingNewSupplierToRecurringTemplateForm(current, supplier))
              }
              onClear={() => setForm((current) => ({ ...current, supplierId: "" }))}
            />
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <AccountingNewPaymentMethodSelect
              id="payment-method"
              label={t.recurringForm.fields.paymentMethod}
              value={form.paymentMethod}
              onChange={(paymentMethod) => setForm((current) => ({ ...current, paymentMethod }))}
            />
            <div className="space-y-2">
              <Label htmlFor="bank-account">{t.recurringForm.fields.bankAccountNumber}</Label>
              <Input
                id="bank-account"
                value={form.bankAccountNumber}
                onChange={(event) => setForm((current) => ({ ...current, bankAccountNumber: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank-code">{t.recurringForm.fields.bankCode}</Label>
              <Input
                id="bank-code"
                value={form.bankCode}
                onChange={(event) => setForm((current) => ({ ...current, bankCode: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank-iban">{t.recurringForm.fields.bankIban}</Label>
              <Input
                id="bank-iban"
                value={form.bankIban}
                onChange={(event) => setForm((current) => ({ ...current, bankIban: event.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">{t.recurringForm.itemsTitle}</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForm((current) => ({ ...current, items: [...current.items, createEmptyItem()] }))}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t.recurringForm.addItem}
              </Button>
            </div>
            {form.items.map((item, index) => (
              <div key={index} className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-[2fr,1fr,1fr,auto]">
                <div className="space-y-2">
                  <Label>{t.recurringForm.fields.itemDescription}</Label>
                  <Input
                    value={item.description}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        items: current.items.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, description: event.target.value } : row,
                        ),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.recurringForm.fields.itemQuantity}</Label>
                  <Input
                    inputMode="decimal"
                    value={item.quantity}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        items: current.items.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, quantity: event.target.value } : row,
                        ),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <AccountingNewMoneyInput
                    id={`item-unit-price-${index}`}
                    label={t.recurringForm.fields.itemUnitPrice}
                    value={item.unitPrice}
                    onChange={(unitPrice) =>
                      setForm((current) => ({
                        ...current,
                        items: current.items.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, unitPrice } : row,
                        ),
                      }))
                    }
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={form.items.length === 1}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        items: current.items.filter((_, rowIndex) => rowIndex !== index),
                      }))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">{t.recurringForm.fields.note}</Label>
            <Textarea
              id="note"
              value={form.note}
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
            />
          </div>

          <div className="sticky bottom-0 z-10 -mx-6 border-t border-border bg-card/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/80">
            <Button type="button" className="min-h-11 w-full sm:w-auto" disabled={isSaving} onClick={() => void submitForm()}>
              {isSaving ? t.recurringForm.saving : mode === "create" ? t.recurringForm.createAction : t.recurringForm.saveAction}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
