import { redirect } from "next/navigation";

import { AdminInvoicesLegacyPage } from "@/components/admin/invoices/AdminInvoicesLegacyPage";
import { isAccountingNewEnabled } from "@/lib/accountingNewFeature";
import { getAccountingNewModuleRoute } from "@/lib/accountingNewModuleRoutes";

export default function AdminInvoicesPage() {
  if (isAccountingNewEnabled()) {
    redirect(getAccountingNewModuleRoute("documents"));
  }

  return <AdminInvoicesLegacyPage />;
}
