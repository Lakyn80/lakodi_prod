import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACCOUNTING_NEW_ROUTE } from "@/lib/accountingNew";
import type { AccountingNewDocumentListItem } from "@/types/accountingNew";
import { AccountingNewDocumentStatusBadge } from "@/components/admin/accounting-new/AccountingNewDocumentStatusBadge";
import { AccountingNewMoney } from "@/components/admin/accounting-new/AccountingNewMoney";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" }).format(date);
}

export function AccountingNewDocumentsTable({
  documents,
}: {
  documents: AccountingNewDocumentListItem[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Doklad</TableHead>
          <TableHead>Druh</TableHead>
          <TableHead>Odběratel</TableHead>
          <TableHead>Vystavení</TableHead>
          <TableHead>Splatnost</TableHead>
          <TableHead className="text-right">Celkem</TableHead>
          <TableHead>Stavy</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((document) => (
          <TableRow key={document.id}>
            <TableCell className="align-top">
              <div className="space-y-1">
                <Link
                  href={`${ACCOUNTING_NEW_ROUTE}/doklady/${document.id}`}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {document.invoiceNumber}
                </Link>
                <p className="text-xs text-muted-foreground">VS {document.variableSymbol}</p>
              </div>
            </TableCell>
            <TableCell className="align-top">
              <Badge variant="outline">{document.documentKind}</Badge>
            </TableCell>
            <TableCell className="align-top">
              <div className="space-y-1">
                <p className="font-medium text-foreground">{document.customerName}</p>
                <p className="text-xs text-muted-foreground">{document.customerEmail}</p>
              </div>
            </TableCell>
            <TableCell className="align-top">{formatDate(document.issueDate)}</TableCell>
            <TableCell className="align-top">{formatDate(document.dueDate)}</TableCell>
            <TableCell className="text-right align-top">
              <div className="space-y-1">
                <AccountingNewMoney amount={document.total} currency={document.currency} className="font-medium text-foreground" />
                <p className="text-xs text-muted-foreground">{document.currency}</p>
              </div>
            </TableCell>
            <TableCell className="align-top">
              <div className="flex flex-wrap gap-2">
                <AccountingNewDocumentStatusBadge label={document.paymentStatus} />
                <AccountingNewDocumentStatusBadge label={document.effectiveStatus} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
