/** Production builds keep new accounting off until explicitly enabled at build time. */
export function isAccountingNewEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ACCOUNTING_NEW_ENABLED === "true";
}
