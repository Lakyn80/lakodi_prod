import type { AccountingNewModuleDefinition } from "@/types/accountingNew";

export const ACCOUNTING_NEW_ROUTE = "/admin/ucetnictvi-new";
export const ACCOUNTING_NEW_LABEL = "ÚčetnictvíNew";

export const accountingNewModules: AccountingNewModuleDefinition[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Přehled neuhrazených dokladů, výdajů, úkolů a auditních událostí.",
    availability: "placeholder",
  },
  {
    id: "documents",
    title: "Doklady",
    description: "Faktury, proformy, daňové doklady, konečné faktury, opravy a nabídky.",
    availability: "placeholder",
  },
  {
    id: "subjects",
    title: "Zákazníci",
    description: "Evidence subjektů a snapshotů odběratelů pro nové účetnictví.",
    availability: "placeholder",
  },
  {
    id: "expenses",
    title: "Výdaje",
    description: "Přijaté doklady, stavy úhrad a exportní přehledy výdajů.",
    availability: "placeholder",
  },
  {
    id: "suppliers",
    title: "Dodavatelé",
    description: "Samostatný registr dodavatelů pro nové účetní workflow.",
    availability: "placeholder",
  },
  {
    id: "bank-matching",
    title: "Banka / párování",
    description: "Import transakcí, návrhy párování a bezpečné potvrzovací kroky.",
    availability: "placeholder",
  },
  {
    id: "todos-reminders",
    title: "Úkoly / upomínky",
    description: "Přehled otevřených úkolů a historie připravených upomínek.",
    availability: "placeholder",
  },
  {
    id: "recurring",
    title: "Opakované doklady",
    description: "Šablony a budoucí generování pravidelných faktur a výdajů.",
    availability: "placeholder",
  },
  {
    id: "attachments",
    title: "Přílohy / inbox",
    description: "Nový inbox příloh, propojení k dokladům a bezpečné archivace.",
    availability: "placeholder",
  },
  {
    id: "audit",
    title: "Audit log",
    description: "Append-only účetní události a filtrování změn napříč moduly.",
    availability: "placeholder",
  },
  {
    id: "settings",
    title: "Nastavení",
    description: "Výchozí firemní údaje, číslování a budoucí konfigurace účetnictví.",
    availability: "placeholder",
  },
];
