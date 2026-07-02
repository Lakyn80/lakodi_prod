"use client";

import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import type { AccountingNewSupplierListItem } from "@/types/accountingNew";

export function AccountingNewSuppliersTable({
  suppliers,
}: {
  suppliers: AccountingNewSupplierListItem[];
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.suppliers.table.supplier}</TableHead>
          <TableHead>{t.suppliers.table.ico}</TableHead>
          <TableHead>{t.suppliers.table.dic}</TableHead>
          <TableHead>{t.suppliers.table.contact}</TableHead>
          <TableHead>{t.suppliers.table.country}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {suppliers.map((supplier) => (
          <TableRow key={supplier.id}>
            <TableCell className="align-top">
              <div className="space-y-1">
                <Link
                  href={`${ACCOUNTING_NEW_ROUTE}/dodavatele/${supplier.id}`}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {supplier.name}
                </Link>
                <p className="text-xs text-muted-foreground">{t.suppliers.table.detail}</p>
              </div>
            </TableCell>
            <TableCell className="align-top">{supplier.ico ?? t.common.noValue}</TableCell>
            <TableCell className="align-top">{supplier.dic ?? t.common.noValue}</TableCell>
            <TableCell className="align-top">
              <div className="space-y-1">
                <p>{supplier.email}</p>
                <p className="text-xs text-muted-foreground">{supplier.phone ?? t.common.noPhone}</p>
              </div>
            </TableCell>
            <TableCell className="align-top">{supplier.country ?? t.common.noValue}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
