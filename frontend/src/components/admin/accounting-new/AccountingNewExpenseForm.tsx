"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { AccountingNewAresLookupSection } from "@/components/admin/accounting-new/AccountingNewAresLookupSection";
import { AccountingNewCurrencySelect } from "@/components/admin/accounting-new/AccountingNewCurrencySelect";
import { AccountingNewMoneyInput } from "@/components/admin/accounting-new/AccountingNewMoneyInput";
import { AccountingNewMutationNotice } from "@/components/admin/accounting-new/AccountingNewMutationNotice";
import { AccountingNewPaymentMethodSelect } from "@/components/admin/accounting-new/AccountingNewPaymentMethodSelect";
import { AccountingNewSupplierPicker } from "@/components/admin/accounting-new/AccountingNewSupplierPicker";
import { formatAccountingNewTemplate, translateAccountingNewStatus } from "@/components/admin/accounting-new/accountingNewFormat";
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
  createAccountingNewExpense,
  getAccountingNewExpense,
  getAccountingNewSettings,
  listAccountingNewSuppliers,
  updateAccountingNewExpense,
} from "@/lib/accountingNew";
import { getAccountingNewModuleRoute } from "@/lib/accountingNewModuleRoutes";
import {
  ACCOUNTING_NEW_EXPENSE_STORED_STATUS_IDS,
  applyAccountingNewSettingsToExpenseForm,
  buildAccountingNewExpenseFormStateFromDetail,
  buildAccountingNewExpenseWritePayloadFromForm,
  createEmptyAccountingNewExpenseFormState,
} from "@/lib/accountingNewExpenseWrite";
import {
  applyAccountingNewSupplierToExpenseForm,
  clearAccountingNewSupplierFromExpenseForm,
} from "@/lib/accountingNewSupplierWrite";
import { parseAccountingNewMoneyInput } from "@/lib/accountingNewMoney";
import type { AccountingNewPaymentMethodId } from "@/lib/accountingNewPaymentMethods";
import type { AccountingNewApiError, AccountingNewExpenseFormState, AccountingNewSupplierListItem } from "@/types/accountingNew";

function createEmptyItem() {
  return { description: "", quantity: "1", unitPrice: "0" };
}

export function AccountingNewExpenseForm({
  mode,
  expenseId,
}: {
  mode: "create" | "edit";
  expenseId?: string;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const [form, setForm] = useState<AccountingNewExpenseFormState>(createEmptyAccountingNewExpenseFormState());
  const [suppliers, setSuppliers] = useState<AccountingNewSupplierListItem[]>([]);
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<AccountingNewApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => String(supplier.id) === form.supplierId) ?? null,
    [form.supplierId, suppliers],
  );

  function handleSupplierSelect(supplier: AccountingNewSupplierListItem) {
    setForm((current) => applyAccountingNewSupplierToExpenseForm(current, supplier));
  }

  function handleSupplierClear() {
    setForm((current) => clearAccountingNewSupplierFromExpenseForm(current));
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialData() {
      try {
        const [loadedSuppliers, settings] = await Promise.all([
          listAccountingNewSuppliers({}, { signal: controller.signal }),
          mode === "create"
            ? getAccountingNewSettings({ signal: controller.signal }).catch(() => null)
            : Promise.resolve(null),
        ]);
        setSuppliers(loadedSuppliers);

        if (mode === "create" && settings) {
          setForm((current) => applyAccountingNewSettingsToExpenseForm(current, settings));
        }

        if (mode === "edit" && expenseId) {
          const detail = await getAccountingNewExpense(expenseId, { signal: controller.signal });
          setForm(buildAccountingNewExpenseFormStateFromDetail(detail));
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
  }, [expenseId, mode]);

  function validate(): string | null {
    if (!form.issueDate || !form.receivedDate || !form.dueDate || !form.taxableSupplyDate) {
      return t.expenseWrite.validation.requiredDates;
    }

    if (!form.supplierId && (!form.supplierName.trim() || !form.supplierEmail.trim() || !form.supplierAddress.trim())) {
      return t.expenseWrite.validation.supplierRequired;
    }

    if (form.items.length === 0 || form.items.every((item) => !item.description.trim())) {
      return t.expenseWrite.validation.itemsRequired;
    }

    if (form.items.some((item) => Number(item.quantity.replace(",", ".")) <= 0)) {
      return t.expenseWrite.validation.itemNumbers;
    }

    if (form.items.some((item) => !parseAccountingNewMoneyInput(item.unitPrice, form.currency).ok)) {
      return t.money.invalidFormat;
    }

    if (!form.bankAccountNumber.trim() || !form.bankCode.trim()) {
      return t.expenseWrite.validation.bankAccountRequired;
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
      const payload = buildAccountingNewExpenseWritePayloadFromForm(form);
      const result =
        mode === "create" ? await createAccountingNewExpense(payload) : await updateAccountingNewExpense(expenseId!, payload);

      setSuccessMessage(mode === "create" ? t.expenseWrite.mutation.createSuccess : t.expenseWrite.mutation.updateSuccess);
      window.location.href = `${ACCOUNTING_NEW_ROUTE}/vydaje/${result.id}`;
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_MONEY") {
        setValidationError(t.money.invalidFormat);
        return;
      }

      if (error instanceof AccountingNewRequestError) {
        setMutationError(error.apiError);
      } else {
        setMutationError({
          resource: "expense-form",
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
    return <p className="text-sm text-muted-foreground">{t.expenseWrite.loading}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" asChild>
          <Link href={getAccountingNewModuleRoute("expenses")}>{t.navigation.backToDashboard}</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={mode === "edit" && expenseId ? `${ACCOUNTING_NEW_ROUTE}/vydaje/${expenseId}` : getAccountingNewModuleRoute("expenses")}>
            {t.expenseWrite.backToDetail}
          </Link>
        </Button>
      </div>

      <AccountingNewMutationNotice successMessage={successMessage} error={mutationError} />

      {validationError ? (
        <Alert variant="destructive">
          <AlertTitle>{t.expenseWrite.validation.title}</AlertTitle>
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle
            data-testid={
              mode === "create"
                ? "accounting-new-expense-form-title-create"
                : "accounting-new-expense-form-title-edit"
            }
          >
            {mode === "create" ? t.expenseWrite.createTitle : t.expenseWrite.editTitle}
          </CardTitle>
          <CardDescription>{t.expenseWrite.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submitForm();
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expenseNumber">{t.expenseWrite.fields.expenseNumber}</Label>
                <Input
                  id="expenseNumber"
                  value={form.expenseNumber}
                  onChange={(event) => setForm((current) => ({ ...current, expenseNumber: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expenseStatus">{t.expenseWrite.fields.status}</Label>
                <select
                  id="expenseStatus"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                >
                  {ACCOUNTING_NEW_EXPENSE_STORED_STATUS_IDS.map((statusId) => (
                    <option key={statusId} value={statusId}>
                      {translateAccountingNewStatus(t, statusId)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="issueDate">{t.expenseWrite.fields.issueDate}</Label>
                <Input
                  id="issueDate"
                  type="date"
                  value={form.issueDate}
                  onChange={(event) => setForm((current) => ({ ...current, issueDate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="receivedDate">{t.expenseWrite.fields.receivedDate}</Label>
                <Input
                  id="receivedDate"
                  type="date"
                  value={form.receivedDate}
                  onChange={(event) => setForm((current) => ({ ...current, receivedDate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">{t.expenseWrite.fields.dueDate}</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxableSupplyDate">{t.expenseWrite.fields.taxableSupplyDate}</Label>
                <Input
                  id="taxableSupplyDate"
                  type="date"
                  value={form.taxableSupplyDate}
                  onChange={(event) => setForm((current) => ({ ...current, taxableSupplyDate: event.target.value }))}
                />
              </div>
              <AccountingNewPaymentMethodSelect
                id="paymentMethod"
                label={t.expenseWrite.fields.paymentMethod}
                value={form.paymentMethod}
                onChange={(value: AccountingNewPaymentMethodId) =>
                  setForm((current) => ({ ...current, paymentMethod: value }))
                }
              />
              <AccountingNewCurrencySelect
                id="currency"
                label={t.expenseWrite.fields.currency}
                value={form.currency}
                onChange={(currency) => setForm((current) => ({ ...current, currency }))}
                required
              />
              <div className="space-y-2">
                <Label htmlFor="vatRate">{t.expenseWrite.fields.vatRate}</Label>
                <Input
                  id="vatRate"
                  value={form.vatRate}
                  onChange={(event) => setForm((current) => ({ ...current, vatRate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAccountNumber">{t.expenseWrite.fields.bankAccountNumber}</Label>
                <Input
                  id="bankAccountNumber"
                  value={form.bankAccountNumber}
                  onChange={(event) => setForm((current) => ({ ...current, bankAccountNumber: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAccountPrefix">{t.expenseWrite.fields.bankAccountPrefix}</Label>
                <Input
                  id="bankAccountPrefix"
                  value={form.bankAccountPrefix}
                  onChange={(event) => setForm((current) => ({ ...current, bankAccountPrefix: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankCode">{t.expenseWrite.fields.bankCode}</Label>
                <Input
                  id="bankCode"
                  value={form.bankCode}
                  onChange={(event) => setForm((current) => ({ ...current, bankCode: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankIban">{t.expenseWrite.fields.bankIban}</Label>
                <Input
                  id="bankIban"
                  value={form.bankIban}
                  onChange={(event) => setForm((current) => ({ ...current, bankIban: event.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">{t.expenseDetail.supplierTitle}</h2>
              </div>
              <AccountingNewSupplierPicker
                suppliers={suppliers}
                selectedSupplierId={form.supplierId}
                onSelect={handleSupplierSelect}
                onClear={handleSupplierClear}
              />
              {selectedSupplier ? (
                <p className="text-sm text-muted-foreground">
                  {formatAccountingNewTemplate(t.supplierPersistence.supplierSelectedHint, { name: selectedSupplier.name })}
                </p>
              ) : null}
              <AccountingNewAresLookupSection
                values={{
                  name: form.supplierName,
                  email: form.supplierEmail,
                  phone: form.supplierPhone,
                  address: form.supplierAddress,
                  ico: form.supplierIco,
                  dic: form.supplierDic,
                  dataBox: "",
                  country: "CZ",
                }}
                onChange={(patch) =>
                  setForm((current) => ({
                    ...current,
                    supplierId: "",
                    supplierName: patch.name ?? current.supplierName,
                    supplierEmail: patch.email ?? current.supplierEmail,
                    supplierPhone: patch.phone ?? current.supplierPhone,
                    supplierAddress: patch.address ?? current.supplierAddress,
                    supplierIco: patch.ico ?? current.supplierIco,
                    supplierDic: patch.dic ?? current.supplierDic,
                  }))
                }
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">{t.expenseDetail.itemsTitle}</h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm((current) => ({ ...current, items: [...current.items, createEmptyItem()] }))}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t.expenseWrite.addItem}
                </Button>
              </div>
              {form.items.map((item, index) => (
                <div key={index} className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-[1.4fr,0.5fr,0.5fr,auto]">
                  <div className="space-y-2">
                    <Label>{t.expenseWrite.fields.itemDescription}</Label>
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
                    <Label>{t.expenseWrite.fields.itemQuantity}</Label>
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
                      id={`expenseItemUnitPrice-${index}`}
                      label={t.expenseWrite.fields.itemUnitPrice}
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
                      variant="ghost"
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
              <Label htmlFor="expenseNote">{t.expenseWrite.fields.note}</Label>
              <Textarea
                id="expenseNote"
                value={form.note}
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isSaving}>
                {mode === "create" ? t.expenseWrite.save : t.expenseWrite.update}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
