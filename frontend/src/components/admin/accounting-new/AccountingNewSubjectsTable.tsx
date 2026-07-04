"use client";

import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import type { AccountingNewSubjectSummary } from "@/types/accountingNew";

export function AccountingNewSubjectsTable({ subjects }: { subjects: AccountingNewSubjectSummary[] }) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.subjects.table.subject}</TableHead>
          <TableHead>{t.subjects.table.ico}</TableHead>
          <TableHead>{t.subjects.table.dic}</TableHead>
          <TableHead>{t.subjects.table.contact}</TableHead>
          <TableHead>{t.subjects.table.country}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {subjects.map((subject) => (
          <TableRow key={subject.id}>
            <TableCell className="align-top">
              <div className="space-y-1">
                <Link
                  href={`${ACCOUNTING_NEW_ROUTE}/odberatele/${subject.id}`}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {subject.name}
                </Link>
                <p className="text-xs text-muted-foreground">{t.subjects.table.detail}</p>
              </div>
            </TableCell>
            <TableCell className="align-top">{subject.ico ?? t.common.noValue}</TableCell>
            <TableCell className="align-top">{subject.dic ?? t.common.noValue}</TableCell>
            <TableCell className="align-top">
              <div className="space-y-1">
                <p>{subject.email}</p>
                <p className="text-xs text-muted-foreground">{subject.phone ?? t.common.noPhone}</p>
              </div>
            </TableCell>
            <TableCell className="align-top">{subject.country ?? t.common.noValue}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
