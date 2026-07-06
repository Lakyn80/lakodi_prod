import type { Translations } from "@/data/translations";
import { accountingNewModuleRegistry } from "@/lib/accountingNewModules";
import type {
  AccountingNewActionKind,
  AccountingNewActionMetadata,
  AccountingNewCapabilityFlags,
  AccountingNewModuleRegistryEntry,
} from "@/types/accountingNewMetadata";

export interface AccountingNewRagModuleCatalogEntry {
  id: string;
  route: string;
  title: string;
  description: string;
  entityType: string;
  featureStatus: string;
  capabilities: AccountingNewCapabilityFlags;
  actions: AccountingNewRagActionCatalogEntry[];
  searchableFields: Array<{ field: string; label: string; weight: number }>;
  voiceAliases: string[];
  relatedModuleIds: string[];
}

export interface AccountingNewRagActionCatalogEntry {
  id: string;
  label: string;
  kind: AccountingNewActionKind;
  confirmRequired: boolean;
}

const CONFIRM_REQUIRED_ACTIONS = new Set<AccountingNewActionKind>([
  "send",
  "apply",
  "generate",
  "delete",
  "archive",
]);

function getNestedTranslationValue(root: Record<string, unknown>, keyPath: string): string {
  const value = keyPath.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, root);

  return typeof value === "string" ? value : keyPath;
}

function resolveAccountingNewKey(t: Translations["accountingNew"], key: string): string {
  return getNestedTranslationValue(t as unknown as Record<string, unknown>, key);
}

function buildActionsForEntry(entry: AccountingNewModuleRegistryEntry): AccountingNewActionMetadata[] {
  const actions: AccountingNewActionMetadata[] = [];

  if (entry.capabilities.canRead) {
    actions.push({ id: "read", labelKey: "rag.actions.read", kind: "read", confirmRequired: false });
  }
  if (entry.capabilities.canCreate) {
    actions.push({ id: "create", labelKey: "rag.actions.create", kind: "create", confirmRequired: false });
  }
  if (entry.capabilities.canUpdate) {
    actions.push({ id: "update", labelKey: "rag.actions.update", kind: "update", confirmRequired: false });
  }
  if (entry.capabilities.canDelete) {
    actions.push({ id: "delete", labelKey: "rag.actions.delete", kind: "delete", confirmRequired: true });
  }
  if (entry.capabilities.canSend) {
    actions.push({ id: "send", labelKey: "rag.actions.send", kind: "send", confirmRequired: true });
  }
  if (entry.capabilities.canExport) {
    actions.push({ id: "export", labelKey: "rag.actions.export", kind: "export", confirmRequired: false });
  }
  if (entry.capabilities.canImport) {
    actions.push({ id: "import", labelKey: "rag.actions.import", kind: "import", confirmRequired: true });
  }
  if (entry.capabilities.canApply) {
    actions.push({ id: "apply", labelKey: "rag.actions.apply", kind: "apply", confirmRequired: true });
  }
  if (entry.capabilities.canGenerate) {
    actions.push({ id: "generate", labelKey: "rag.actions.generate", kind: "generate", confirmRequired: true });
  }
  if (entry.capabilities.canUpload) {
    actions.push({ id: "upload", labelKey: "rag.actions.upload", kind: "upload", confirmRequired: false });
  }
  if (entry.capabilities.canLink) {
    actions.push({ id: "link", labelKey: "rag.actions.link", kind: "link", confirmRequired: true });
  }
  if (entry.capabilities.canArchive) {
    actions.push({ id: "archive", labelKey: "rag.actions.archive", kind: "archive", confirmRequired: true });
  }

  return actions.map((action) => ({
    ...action,
    confirmRequired: action.confirmRequired || CONFIRM_REQUIRED_ACTIONS.has(action.kind),
  }));
}

export function getAccountingNewRagModuleCatalog(
  t: Translations["accountingNew"],
): AccountingNewRagModuleCatalogEntry[] {
  return accountingNewModuleRegistry.map((entry) => {
    const actions = buildActionsForEntry(entry);

    return {
      id: entry.id,
      route: entry.route,
      title: resolveAccountingNewKey(t, entry.labelKey),
      description: resolveAccountingNewKey(t, entry.descriptionKey),
      entityType: entry.rag.entityType,
      featureStatus: entry.featureStatus,
      capabilities: entry.capabilities,
      actions: actions.map((action) => ({
        id: action.id,
        label: resolveAccountingNewKey(t, action.labelKey),
        kind: action.kind,
        confirmRequired: action.confirmRequired,
      })),
      searchableFields: entry.rag.searchableFields.map((field) => ({
        field: field.field,
        label: resolveAccountingNewKey(t, field.labelKey),
        weight: field.weight,
      })),
      voiceAliases: entry.voice.aliasKeys.map((aliasKey) => resolveAccountingNewKey(t, aliasKey)),
      relatedModuleIds: entry.relatedModuleIds,
    };
  });
}

export function getAccountingNewRagWriteActions(
  t: Translations["accountingNew"],
): AccountingNewRagActionCatalogEntry[] {
  const catalog = getAccountingNewRagModuleCatalog(t);
  const seen = new Set<string>();

  return catalog
    .flatMap((module) =>
      module.actions
        .filter((action) => action.kind !== "read")
        .map((action) => ({ ...action, moduleId: module.id })),
    )
    .filter((action) => {
      const key = `${action.moduleId}:${action.id}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map(({ moduleId: _moduleId, ...action }) => action);
}
