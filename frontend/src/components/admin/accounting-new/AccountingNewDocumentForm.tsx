"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { AccountingNewAresLookupSection } from "@/components/admin/accounting-new/AccountingNewAresLookupSection";
import { AccountingNewCurrencySelect } from "@/components/admin/accounting-new/AccountingNewCurrencySelect";
import { AccountingNewMoneyInput } from "@/components/admin/accounting-new/AccountingNewMoneyInput";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { AccountingNewSubjectPicker } from "@/components/admin/accounting-new/AccountingNewSubjectPicker";
import {
  formatAccountingNewTemplate,
  translateAccountingNewDocumentKind,
} from "@/components/admin/accounting-new/accountingNewFormat";
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
  createAccountingNewDocument,
  getAccountingNewDocument,
  getAccountingNewDocumentDefaults,
  getAccountingNewSettings,
  listAccountingNewSubjects,
  updateAccountingNewDocument,
} from "@/lib/accountingNew";
import { getAccountingNewModuleRoute } from "@/lib/accountingNewModuleRoutes";
import {
  buildAccountingNewDocumentFormStateFromDetail,
  buildAccountingNewDocumentWritePayloadFromForm,
  canAccountingNewDocumentEdit,
  createEmptyAccountingNewDocumentFormState,
} from "@/lib/accountingNewDocumentWrite";
import { parseAccountingNewMoneyInput } from "@/lib/accountingNewMoney";
import {
  applyAccountingNewSubjectToDocumentForm,
  buildAccountingNewCustomerInputFromDocumentForm,
  resolveOrCreateAccountingNewCustomer,
} from "@/lib/accountingNewCustomerPersistence";
import { normalizeAccountingNewCurrency } from "@/lib/accountingNewCurrencies";
import type { AccountingNewApiError, AccountingNewDocumentFormState, AccountingNewSubjectSummary } from "@/types/accountingNew";

const DOCUMENT_KINDS = ["invoice", "proforma", "tax_document", "correction", "final_invoice", "quote"] as const;

function createEmptyItem() {
  return { description: "", quantity: "1", unitPrice: "0" };
}

export function AccountingNewDocumentForm({
  mode,
  documentId,
}: {
  mode: "create" | "edit";
  documentId?: string;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [form, setForm] = useState<AccountingNewDocumentFormState>(createEmptyAccountingNewDocumentFormState());
  const [subjects, setSubjects] = useState<AccountingNewSubjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [notEditable, setNotEditable] = useState(false);

  const selectedSubject = useMemo(
    () => subjects.find((subject) => String(subject.id) === form.subjectId) ?? null,
    [form.subjectId, subjects],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialData() {
      try {
        const [loadedSubjects, defaults, settings] = await Promise.all([
          listAccountingNewSubjects({ signal: controller.signal }),
          getAccountingNewDocumentDefaults("invoice", { signal: controller.signal }),
          getAccountingNewSettings({ signal: controller.signal }).catch(() => null),
        ]);

        setSubjects(loadedSubjects);

        if (mode === "create") {
          setForm((current) => ({
            ...current,
            invoiceNumber: defaults.suggestedInvoiceNumber,
            currency: normalizeAccountingNewCurrency(settings?.defaultCurrency ?? current.currency),
          }));
        }

        if (mode === "edit" && documentId) {
          const detail = await getAccountingNewDocument(documentId, { signal: controller.signal });
          if (!canAccountingNewDocumentEdit(detail)) {
            setNotEditable(true);
          }
          setForm(buildAccountingNewDocumentFormStateFromDetail(detail));
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

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
  }, [documentId, mode]);

  async function refreshDefaults(documentKind: string) {
    try {
      const defaults = await getAccountingNewDocumentDefaults(documentKind);
      if (mode === "create") {
        setForm((current) => ({
          ...current,
          documentKind,
          invoiceNumber: defaults.suggestedInvoiceNumber,
        }));
      } else {
        setForm((current) => ({ ...current, documentKind }));
      }
    } catch (error) {
      if (error instanceof AccountingNewRequestError) {
        setMutationError(error.apiError);
      }
    }
  }

  function validateForm(): string | null {
    if (!form.issueDate || !form.dueDate) {
      return t.documentWrite.validation.requiredDates;
    }

    if (form.dueDate < form.issueDate) {
      return t.documentWrite.validation.dueBeforeIssue;
    }

    if (!form.subjectId && (!form.customerName.trim() || !form.customerEmail.trim() || !form.customerAddress.trim())) {
      return t.documentWrite.validation.customerRequired;
    }

    if (form.taxMode === "standard" && !form.vatRate.trim()) {
      return t.documentWrite.validation.vatRequired;
    }

    if (form.items.length === 0 || form.items.some((item) => !item.description.trim())) {
      return t.documentWrite.validation.itemsRequired;
    }

    if (form.items.some((item) => Number(item.quantity.replace(",", ".")) <= 0)) {
      return t.documentWrite.validation.itemNumbers;
    }

    if (form.items.some((item) => !parseAccountingNewMoneyInput(item.unitPrice, form.currency).ok)) {
      return t.money.invalidFormat;
    }

    return null;
  }

  function getPersistenceSuccessMessage(
    result: Awaited<ReturnType<typeof resolveOrCreateAccountingNewCustomer>>,
  ): string | null {
    if (result.status === "created") {
      return t.customerPersistence.customerSaved;
    }

    if (result.status === "reused") {
      if (result.matchField === "ico") {
        return t.customerPersistence.existingCustomerReused;
      }
      return t.customerPersistence.duplicateCustomerFound;
    }

    return null;
  }

  async function submitForm(statusOverride: "draft" | "issued") {
    setValidationError(null);
    setMutationError(null);
    setSuccessMessage(null);

    const validation = validateForm();
    if (validation) {
      setValidationError(validation);
      return;
    }

    setIsSubmitting(true);

    try {
      let workingForm = form;
      let persistenceNotice: string | null = null;

      if (!form.subjectId.trim()) {
        const persistence = await resolveOrCreateAccountingNewCustomer(
          subjects,
          buildAccountingNewCustomerInputFromDocumentForm(form),
        );

        if (persistence.status === "ambiguous") {
          setValidationError(
            formatAccountingNewTemplate(t.customerPersistence.ambiguousCustomerMatch, {
              count: persistence.matches.length,
            }),
          );
          return;
        }

        if (persistence.status === "failed") {
          setMutationError(persistence.error);
          return;
        }

        if (persistence.status === "skipped") {
          setValidationError(t.customerPersistence.customerPersistenceRequired);
          return;
        }

        workingForm = applyAccountingNewSubjectToDocumentForm(form, persistence.subject);
        setForm(workingForm);

        if (persistence.status === "created") {
          setSubjects((current) => [...current, persistence.subject]);
        }

        persistenceNotice = getPersistenceSuccessMessage(persistence);
      }

      const payload = buildAccountingNewDocumentWritePayloadFromForm(workingForm, {
        status: statusOverride,
      });

      const detail =
        mode === "create"
          ? await createAccountingNewDocument(payload)
          : await updateAccountingNewDocument(documentId ?? "", payload);

      setSuccessMessage(
        persistenceNotice ??
          (mode === "create" ? t.documentWrite.mutation.createSuccess : t.documentWrite.mutation.updateSuccess),
      );

      window.location.href = `${ACCOUNTING_NEW_ROUTE}/doklady/${detail.id}`;
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_MONEY") {
        setValidationError(t.money.invalidFormat);
        return;
      }

      if (error instanceof AccountingNewRequestError) {
        setMutationError(error.apiError);
      } else {
        setMutationError({
          resource: "document-form",
          message: t.errors.actionFailed,
          status: null,
          requiresLogin: false,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading && mode === "edit") {
    return <p className="text-sm text-muted-foreground">{t.documentWrite.loading}</p>;
  }

  if (notEditable) {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href={documentId ? `${ACCOUNTING_NEW_ROUTE}/doklady/${documentId}` : getAccountingNewModuleRoute("documents")}>
            {t.documentWrite.backToDetail}
          </Link>
        </Button>
        <Alert>
          <AlertTitle data-testid="accounting-new-document-form-title-not-editable">
            {t.documentWrite.notEditableTitle}
          </AlertTitle>
          <AlertDescription>{t.documentWrite.notEditableDescription}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("documents")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={mode === "edit" && documentId ? `${ACCOUNTING_NEW_ROUTE}/doklady/${documentId}` : getAccountingNewModuleRoute("documents")}>
            {t.documentWrite.backToDetail}
          </Link>
        </Button>
      </div>

      <Alert>
        <AlertTitle>{t.documentWrite.legacyNoticeTitle}</AlertTitle>
        <AlertDescription>{t.documentWrite.legacyNoticeDescription}</AlertDescription>
      </Alert>

      <AccountingNewMutationNotice successMessage={successMessage} error={mutationError} />

      {validationError ? (
        <Alert variant="destructive">
          <AlertTitle>{t.documentWrite.validation.title}</AlertTitle>
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle
            data-testid={
              mode === "create"
                ? "accounting-new-document-form-title-create"
                : "accounting-new-document-form-title-edit"
            }
          >
            {mode === "create" ? t.documentWrite.createTitle : t.documentWrite.editTitle}
          </CardTitle>
          <CardDescription>{mode === "create" ? t.documentWrite.createDescription : t.documentWrite.editDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              // Edit must preserve stored status (issued stays issued; draft stays draft).
              const statusOverride = mode === "edit" && form.status === "issued" ? "issued" : "draft";
              void submitForm(statusOverride);
            }}
          >
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">{t.documentWrite.customerSectionTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.documentWrite.customerSectionDescription}</p>
              </div>
              <AccountingNewSubjectPicker
                subjects={subjects}
                selectedSubjectId={form.subjectId}
                onSelect={(subject) => {
                  setForm((current) => ({
                    ...current,
                    subjectId: String(subject.id),
                    customerName: subject.name,
                    customerEmail: subject.email,
                    customerPhone: subject.phone ?? "",
                    customerAddress: subject.address,
                    customerIco: subject.ico ?? "",
                    customerDic: subject.dic ?? "",
                  }));
                }}
                onClear={() => setForm((current) => ({ ...current, subjectId: "" }))}
              />
              {selectedSubject ? (
                <p className="text-sm text-muted-foreground">
                  {formatAccountingNewTemplate(t.documentWrite.subjectSelectedHint, { name: selectedSubject.name })}
                </p>
              ) : null}
              <AccountingNewAresLookupSection
                values={{
                  name: form.customerName,
                  email: form.customerEmail,
                  phone: form.customerPhone,
                  address: form.customerAddress,
                  ico: form.customerIco,
                  dic: form.customerDic,
                  dataBox: form.customerDataBox,
                  country: "CZ",
                }}
                onChange={(patch) =>
                  setForm((current) => ({
                    ...current,
                    subjectId: "",
                    customerName: patch.name ?? current.customerName,
                    customerEmail: patch.email ?? current.customerEmail,
                    customerPhone: patch.phone ?? current.customerPhone,
                    customerAddress: patch.address ?? current.customerAddress,
                    customerIco: patch.ico ?? current.customerIco,
                    customerDic: patch.dic ?? current.customerDic,
                    customerDataBox: patch.dataBox ?? current.customerDataBox,
                  }))
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="documentKind">{t.documentWrite.fields.documentKind}</Label>
                <select
                  id="documentKind"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.documentKind}
                  onChange={(event) => void refreshDefaults(event.target.value)}
                  disabled={mode === "edit"}
                >
                  {DOCUMENT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {translateAccountingNewDocumentKind(t, kind)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoiceNumber">{t.documentWrite.fields.invoiceNumber}</Label>
                <Input
                  id="invoiceNumber"
                  value={form.invoiceNumber}
                  onChange={(event) => setForm((current) => ({ ...current, invoiceNumber: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issueDate">{t.documentWrite.fields.issueDate}</Label>
                <Input
                  id="issueDate"
                  type="date"
                  value={form.issueDate}
                  onChange={(event) => setForm((current) => ({ ...current, issueDate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">{t.documentWrite.fields.dueDate}</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                />
              </div>
              <AccountingNewCurrencySelect
                id="currency"
                label={t.documentWrite.fields.currency}
                value={form.currency}
                onChange={(currency) => setForm((current) => ({ ...current, currency }))}
                required
              />
              <div className="space-y-2">
                <Label htmlFor="businessMode">{t.documentWrite.fields.businessMode}</Label>
                <select
                  id="businessMode"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.businessMode}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      businessMode: event.target.value as AccountingNewDocumentFormState["businessMode"],
                    }))
                  }
                >
                  <option value="autoservice">{t.documentWrite.businessModes.autoservice}</option>
                  <option value="construction">{t.documentWrite.businessModes.construction}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxMode">{t.documentWrite.fields.taxMode}</Label>
                <select
                  id="taxMode"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.taxMode}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      taxMode: event.target.value as AccountingNewDocumentFormState["taxMode"],
                    }))
                  }
                >
                  <option value="standard">{t.documentWrite.taxModes.standard}</option>
                  <option value="reverse_charge">{t.documentWrite.taxModes.reverse_charge}</option>
                </select>
              </div>
              {form.taxMode === "standard" ? (
                <div className="space-y-2">
                  <Label htmlFor="vatRate">{t.documentWrite.fields.vatRate}</Label>
                  <Input
                    id="vatRate"
                    value={form.vatRate}
                    onChange={(event) => setForm((current) => ({ ...current, vatRate: event.target.value }))}
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{t.documentWrite.itemsSectionTitle}</h2>
                  <p className="text-sm text-muted-foreground">{t.documentWrite.itemsSectionDescription}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm((current) => ({ ...current, items: [...current.items, createEmptyItem()] }))}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t.documentWrite.addItem}
                </Button>
              </div>
              {form.items.map((item, index) => (
                <div key={index} className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-[1.4fr,0.5fr,0.5fr,auto]">
                  <div className="space-y-2">
                    <Label>{t.documentWrite.fields.itemDescription}</Label>
                    <Input
                      value={item.description}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          items: current.items.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, description: event.target.value } : entry,
                          ),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.documentWrite.fields.itemQuantity}</Label>
                    <Input
                      value={item.quantity}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          items: current.items.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, quantity: event.target.value } : entry,
                          ),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <AccountingNewMoneyInput
                      id={`itemUnitPrice-${index}`}
                      label={t.documentWrite.fields.itemUnitPrice}
                      value={item.unitPrice}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          items: current.items.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, unitPrice: value } : entry,
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
                      disabled={form.items.length <= 1}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          items: current.items.filter((_, entryIndex) => entryIndex !== index),
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
              <Label htmlFor="note">{t.documentWrite.fields.note}</Label>
              <Textarea
                id="note"
                value={form.note}
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {mode === "create"
                  ? t.documentWrite.saveDraft
                  : form.status === "issued"
                    ? t.documentWrite.updateIssued
                    : t.documentWrite.updateDraft}
              </Button>
              {mode === "create" ? (
                <Button type="button" variant="secondary" disabled={isSubmitting} onClick={() => void submitForm("issued")}>
                  {t.documentWrite.saveAndIssue}
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
