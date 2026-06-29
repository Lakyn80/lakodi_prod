"use client";

import { useDeferredValue, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountingNewApiError, AccountingNewDocumentListItem } from "@/types/accountingNew";
import { AccountingNewDocumentsTable } from "@/components/admin/accounting-new/AccountingNewDocumentsTable";

function normalizeFilterValue(value: string): string {
  return value.trim().toLowerCase();
}

function matchesQuery(document: AccountingNewDocumentListItem, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [
    document.invoiceNumber,
    document.variableSymbol,
    document.customerName,
    document.customerEmail,
    document.documentKind,
  ]
    .map(normalizeFilterValue)
    .join(" ");

  return haystack.includes(query);
}

export function AccountingNewDocumentsPanel({
  documents,
  isLoading,
  authRequired,
  error,
}: {
  documents: AccountingNewDocumentListItem[];
  isLoading: boolean;
  authRequired: boolean;
  error: AccountingNewApiError | null;
}) {
  const [query, setQuery] = useState("");
  const [documentKind, setDocumentKind] = useState("all");
  const [effectiveStatus, setEffectiveStatus] = useState("all");
  const deferredQuery = useDeferredValue(query);

  const kindOptions = Array.from(new Set(documents.map((document) => document.documentKind))).sort((left, right) =>
    left.localeCompare(right, "cs"),
  );
  const effectiveStatusOptions = Array.from(new Set(documents.map((document) => document.effectiveStatus))).sort((left, right) =>
    left.localeCompare(right, "cs"),
  );

  const filteredDocuments = documents.filter((document) => {
    if (!matchesQuery(document, normalizeFilterValue(deferredQuery))) {
      return false;
    }

    if (documentKind !== "all" && document.documentKind !== documentKind) {
      return false;
    }

    if (effectiveStatus !== "all" && document.effectiveStatus !== effectiveStatus) {
      return false;
    }

    return true;
  });

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Read-only</Badge>
          <Badge variant="outline">Doklady</Badge>
        </div>
        <div className="space-y-1">
          <CardTitle>Read-only seznam účetních dokladů</CardTitle>
          <CardDescription>
            Tento přehled používá pouze nové paralelní GET endpointy. Neobsahuje žádné create, edit, delete ani migrační akce.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {authRequired ? (
          <Alert>
            <AlertTitle>Pro načtení dokladů je nutné přihlášení</AlertTitle>
            <AlertDescription>
              Accounting document list zůstává bezpečný. Bez admin session se pouze nezobrazí data, ale starý invoicing UI tím zůstává nedotčený.
            </AlertDescription>
          </Alert>
        ) : null}

        {error && !authRequired ? (
          <Alert variant="destructive">
            <AlertTitle>Read-only seznam dokladů se nepodařilo načíst</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        {!authRequired && !error ? (
          <>
            <div className="grid gap-3 md:grid-cols-[2fr,1fr,1fr]">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Hledat podle čísla dokladu, VS, odběratele nebo druhu"
                aria-label="Hledat dokumenty"
              />

              <select
                value={documentKind}
                onChange={(event) => setDocumentKind(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label="Filtrovat podle druhu dokumentu"
              >
                <option value="all">Všechny druhy</option>
                {kindOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <select
                value={effectiveStatus}
                onChange={(event) => setEffectiveStatus(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label="Filtrovat podle výsledného stavu"
              >
                <option value="all">Všechny stavy</option>
                {effectiveStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{filteredDocuments.length} zobrazených dokladů</span>
              <span>·</span>
              <span>detail vede pouze do nové paralelní route `/admin/ucetnictvi-new/doklady/[id]`</span>
            </div>
          </>
        ) : null}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : null}

        {!isLoading && !authRequired && !error && filteredDocuments.length > 0 ? (
          <AccountingNewDocumentsTable documents={filteredDocuments} />
        ) : null}

        {!isLoading && !authRequired && !error && documents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            Backend zatím nevrátil žádné read-only dokumenty. Nová paralelní sekce přesto zůstává připravená a staré vydané faktury v `/admin/invoices` zůstávají beze změny.
          </div>
        ) : null}

        {!isLoading && !authRequired && !error && documents.length > 0 && filteredDocuments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            Aktuální filtry nevrátily žádný dokument. Zkuste upravit hledání nebo vrátit filtry na `Všechny`.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
