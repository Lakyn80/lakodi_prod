import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import type { AccountingNewSupplierListItem } from "@/types/accountingNew";

export function AccountingNewSuppliersTable({
  suppliers,
}: {
  suppliers: AccountingNewSupplierListItem[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Dodavatel</TableHead>
          <TableHead>IČO</TableHead>
          <TableHead>DIČ</TableHead>
          <TableHead>Kontakt</TableHead>
          <TableHead>Země</TableHead>
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
                <p className="text-xs text-muted-foreground">Read-only detail</p>
              </div>
            </TableCell>
            <TableCell className="align-top">{supplier.ico ?? "Neuvedeno"}</TableCell>
            <TableCell className="align-top">{supplier.dic ?? "Neuvedeno"}</TableCell>
            <TableCell className="align-top">
              <div className="space-y-1">
                <p>{supplier.email}</p>
                <p className="text-xs text-muted-foreground">{supplier.phone ?? "Telefon neuveden"}</p>
              </div>
            </TableCell>
            <TableCell className="align-top">{supplier.country ?? "Neuvedeno"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
