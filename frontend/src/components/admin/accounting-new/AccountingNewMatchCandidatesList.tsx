import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AccountingNewPaymentMatchCandidate } from "@/types/accountingNew";

export function AccountingNewMatchCandidatesList({
  candidates,
  deferredNote,
}: {
  candidates?: AccountingNewPaymentMatchCandidate[];
  deferredNote: string;
}) {
  if (!candidates || candidates.length === 0) {
    return (
      <Alert>
        <AlertTitle>Matching candidates deferred</AlertTitle>
        <AlertDescription>{deferredNote}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {candidates.map((candidate) => (
        <div key={candidate.id} className="rounded-lg border border-border bg-background p-4">
          <p className="font-medium text-foreground">{candidate.label}</p>
          <p className="mt-2 text-sm text-muted-foreground">{candidate.reason ?? "Bez vysvětlení kandidáta."}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {candidate.confidence !== null ? `Confidence ${candidate.confidence}` : "Confidence neuvedena"}
          </p>
        </div>
      ))}
    </div>
  );
}
