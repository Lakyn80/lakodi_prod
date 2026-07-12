import { redirect } from "next/navigation";

import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";

export default function AccountingNewBankTransactionsIndexPage() {
  redirect(`${ACCOUNTING_NEW_ROUTE}#bank-transactions`);
}
