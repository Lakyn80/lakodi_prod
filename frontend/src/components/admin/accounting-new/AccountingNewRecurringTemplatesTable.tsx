"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import type { AccountingNewRecurringTemplateListItem } from "@/types/accountingNew";
import { AccountingNewMoney } from "@/components/admin/accounting-new/AccountingNewMoney";
import { AccountingNewRecurringStatusBadge } from "@/components/admin/accounting-new/AccountingNewRecurringStatusBadge";
import {
  formatAccountingNewDate,
  formatAccountingNewTemplate,
  translateAccountingNewDocumentKind,
  translateAccountingNewRecurringFrequency,
  translateAccountingNewRecurringKind,
} from "@/components/admin/accounting-new/accountingNewFormat";

function getRecurringTemplateTotal(template: AccountingNewRecurringTemplateListItem): number {
  return template.items.reduce((sum, item) => sum + item.lineTotal, 0);
}

function getRelatedPartyLabel(
  template: AccountingNewRecurringTemplateListItem,
  t: (typeof translations)["cs"]["accountingNew"],
  subjectLabels: Record<number, string>,
  supplierLabels: Record<number, string>,
): string {
  if (template.templateType === "invoice" && template.subjectId) {
    return subjectLabels[template.subjectId] ?? formatAccountingNewTemplate(t.recurring.relatedSubject, { id: template.subjectId });
  }

  if (template.templateType === "expense" && template.supplierId) {
    return supplierLabels[template.supplierId] ?? formatAccountingNewTemplate(t.recurring.relatedSupplier, { id: template.supplierId });
  }

  return t.common.noValue;
}

export function AccountingNewRecurringTemplatesTable({
  templates,
  subjectLabels,
  supplierLabels,
}: {
  templates: AccountingNewRecurringTemplateListItem[];
  subjectLabels: Record<number, string>;
  supplierLabels: Record<number, string>;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.recurring.table.name}</TableHead>
          <TableHead>{t.recurring.table.kind}</TableHead>
          <TableHead>{t.recurring.table.status}</TableHead>
          <TableHead>{t.recurring.table.schedule}</TableHead>
          <TableHead>{t.recurring.table.relatedParty}</TableHead>
          <TableHead className="text-right">{t.recurring.table.amount}</TableHead>
          <TableHead>{t.recurring.table.nextRun}</TableHead>
          <TableHead>{t.recurring.table.lastRun}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {templates.map((template) => (
          <TableRow key={template.id}>
            <TableCell className="align-top max-md:text-left" data-label={t.recurring.table.name}>
              <div className="space-y-1">
                <Link
                  href={`${ACCOUNTING_NEW_ROUTE}/opakovane/${template.id}`}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {template.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {formatAccountingNewTemplate(t.recurring.table.templateNumber, { id: template.id })}
                </p>
              </div>
            </TableCell>
            <TableCell className="align-top max-md:text-left" data-label={t.recurring.table.kind}>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{translateAccountingNewRecurringKind(t, template.templateType)}</Badge>
                {template.documentKind ? (
                  <Badge variant="secondary">{translateAccountingNewDocumentKind(t, template.documentKind)}</Badge>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="align-top max-md:text-left" data-label={t.recurring.table.status}>
              <AccountingNewRecurringStatusBadge label={template.status} />
            </TableCell>
            <TableCell className="align-top" data-label={t.recurring.table.schedule}>
              {formatAccountingNewTemplate(t.recurring.frequencyWithCount, {
                frequency: translateAccountingNewRecurringFrequency(t, template.recurrenceInterval),
                count: template.recurrenceCount,
              })}
            </TableCell>
            <TableCell className="align-top max-md:text-left" data-label={t.recurring.table.relatedParty}>{getRelatedPartyLabel(template, t, subjectLabels, supplierLabels)}</TableCell>
            <TableCell className="text-right align-top" data-label={t.recurring.table.amount}>
              <AccountingNewMoney amount={getRecurringTemplateTotal(template)} currency={template.currency} className="font-medium text-foreground" />
            </TableCell>
            <TableCell className="align-top" data-label={t.recurring.table.nextRun}>{formatAccountingNewDate(template.nextRunDate, language, t.common.noValue)}</TableCell>
            <TableCell className="align-top" data-label={t.recurring.table.lastRun}>{formatAccountingNewDate(template.lastRunDate, language, t.common.noValue)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
