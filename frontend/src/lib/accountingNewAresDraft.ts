import type { AccountingNewAresFieldValues } from "@/lib/accountingNewAres";

const ARES_DRAFT_STORAGE_KEY = "lakodi-accounting-ares-draft";

export type AccountingNewAresDraftTarget = "subject" | "supplier";

type AccountingNewAresDraft = {
  target: AccountingNewAresDraftTarget;
  values: AccountingNewAresFieldValues;
  savedAt: number;
};

export function saveAccountingNewAresDraft(
  target: AccountingNewAresDraftTarget,
  values: AccountingNewAresFieldValues,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const draft: AccountingNewAresDraft = {
    target,
    values,
    savedAt: Date.now(),
  };

  window.sessionStorage.setItem(ARES_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function consumeAccountingNewAresDraft(
  target: AccountingNewAresDraftTarget,
): AccountingNewAresFieldValues | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(ARES_DRAFT_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const draft = JSON.parse(raw) as AccountingNewAresDraft;
    if (draft.target !== target) {
      return null;
    }

    window.sessionStorage.removeItem(ARES_DRAFT_STORAGE_KEY);
    return draft.values;
  } catch {
    window.sessionStorage.removeItem(ARES_DRAFT_STORAGE_KEY);
    return null;
  }
}
