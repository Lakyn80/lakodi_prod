import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AccountingNewPaymentMatchListItem } from "@/types/accountingNew";
import { AccountingNewDocumentStatusBadge } from "@/components/admin/accounting-new/AccountingNewDocumentStatusBadge";
import { formatAccountingNewDateTime } from "@/components/admin/accounting-new/accountingNewFormat";

export function AccountingNewPaymentMatchesTable({
  matches,
}: {
  matches: AccountingNewPaymentMatchListItem[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Typ</TableHead>
          <TableHead>Vazba</TableHead>
          <TableHead>Confidence</TableHead>
          <TableHead>Stav</TableHead>
          <TableHead>Důvod</TableHead>
          <TableHead>Vytvořeno</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {matches.map((match) => (
          <TableRow key={match.id}>
            <TableCell className="align-top">{match.matchType}</TableCell>
            <TableCell className="align-top">
              <div className="space-y-1">
                <p>{match.invoiceId !== null ? `Faktura #${match.invoiceId}` : "Faktura nenavázána"}</p>
                <p className="text-xs text-muted-foreground">
                  {match.expenseId !== null ? `Výdaj #${match.expenseId}` : "Výdaj nenavázán"}
                </p>
              </div>
            </TableCell>
            <TableCell className="align-top">{match.confidence}</TableCell>
            <TableCell className="align-top">
              <AccountingNewDocumentStatusBadge label={match.status} />
            </TableCell>
            <TableCell className="align-top">{match.reason ?? "Bez detailu"}</TableCell>
            <TableCell className="align-top">
              <div className="space-y-1">
                <p>{formatAccountingNewDateTime(match.createdAt)}</p>
                <p className="text-xs text-muted-foreground">
                  {match.appliedAt ? `Applied ${formatAccountingNewDateTime(match.appliedAt)}` : "Neaplikováno"}
                </p>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
