"use client";

import { useCallback, useState } from "react";

import type { AccountingNewApiError } from "@/types/accountingNew";

export function useAccountingNewCollapsibleList(defaultExpanded = false) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggle = useCallback(() => {
    setExpanded((current) => !current);
  }, []);

  const isContentVisible = useCallback(
    (authRequired: boolean, error: AccountingNewApiError | null) => expanded && !authRequired && !error,
    [expanded],
  );

  return {
    expanded,
    setExpanded,
    toggle,
    isContentVisible,
  };
}
