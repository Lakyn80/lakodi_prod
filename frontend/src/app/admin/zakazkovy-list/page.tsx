"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadBlankZakazkovyListPdf } from "@/lib/zakazkovyListPdf";

export default function ZakazkovyListDocumentPage() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      await downloadBlankZakazkovyListPdf();
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "PDF se nepodařilo stáhnout.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <Link href="/admin/">Zpět na zakázky</Link>
        </Button>
      </div>

      <Card className="border-border bg-card" data-testid="zakazkovy-list-document-page">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="rounded-md border border-border bg-secondary p-2">
              <FileText className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <CardTitle className="text-2xl">Zakázkový list</CardTitle>
              <CardDescription>
                Samostatný tiskopis příjmu vozidla (A4). Stáhněte PDF a vyplňte / vytiskněte kdykoliv.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Údaje zákazníka a vozidla</li>
            <li>Kontrola stavu, výbavy a vizuální schéma</li>
            <li>Termíny, platba a podpisy při převzetí i předání</li>
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleDownload()} disabled={downloading} data-testid="zakazkovy-list-download">
              <Download className="mr-2 h-4 w-4" />
              {downloading ? "Stahuji…" : "Stáhnout PDF"}
            </Button>
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
