"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  downloadBlankServisniZakazkaPdf,
  downloadBlankZakazkovyListPdf,
} from "@/lib/zakazkovyListPdf";

type FormKind = "zakazkovy-list" | "servisni-zakazka";

export default function ZakazkovyListDocumentPage() {
  const [downloading, setDownloading] = useState<FormKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(kind: FormKind) {
    setDownloading(kind);
    setError(null);
    try {
      if (kind === "zakazkovy-list") {
        await downloadBlankZakazkovyListPdf();
      } else {
        await downloadBlankServisniZakazkaPdf();
      }
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "PDF se nepodařilo stáhnout.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <Link href="/admin/">Zpět na zakázky</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Tiskopisy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Oficiální prázdné PDF formuláře Lakodi ke stažení a tisku.
        </p>
      </div>

      <Card className="border-border bg-card" data-testid="zakazkovy-list-document-page">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="rounded-md border border-border bg-secondary p-2">
              <FileText className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <CardTitle className="text-xl">Zakázkový list</CardTitle>
              <CardDescription>
                Oficiální tiskopis Lakodi (A4) — přesně stejné PDF jako papírový zakázkový list.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => void handleDownload("zakazkovy-list")}
            disabled={downloading !== null}
            data-testid="zakazkovy-list-download"
          >
            <Download className="mr-2 h-4 w-4" />
            {downloading === "zakazkovy-list" ? "Stahuji…" : "Stáhnout PDF"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border bg-card" data-testid="servisni-zakazka-document-page">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="rounded-md border border-border bg-secondary p-2">
              <FileText className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <CardTitle className="text-xl">Servisní zakázka</CardTitle>
              <CardDescription>
                Prázdný list servisní zakázky — přesně stejné PDF jako papírová předloha.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => void handleDownload("servisni-zakazka")}
            disabled={downloading !== null}
            data-testid="servisni-zakazka-download"
          >
            <Download className="mr-2 h-4 w-4" />
            {downloading === "servisni-zakazka" ? "Stahuji…" : "Stáhnout PDF"}
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
