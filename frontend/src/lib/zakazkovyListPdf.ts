import { apiFetchOptions, zakazkyUrl } from "@/lib/api";

function extractFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition);
  return match?.[1] ?? null;
}

async function downloadPdfBlob(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(zakazkyUrl(path), {
    ...apiFetchOptions,
    method: "GET",
    headers: {
      Accept: "application/pdf",
    },
  });

  if (response.status === 401) {
    window.location.href = "/admin/login";
    throw new Error("Authentication required");
  }

  if (!response.ok) {
    let message = "PDF se nepodařilo stáhnout.";
    try {
      const payload = (await response.json()) as { detail?: string };
      if (typeof payload.detail === "string" && payload.detail.trim()) {
        message = payload.detail.trim();
      }
    } catch {
      // keep fallback
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const filename = extractFilename(response.headers.get("content-disposition")) ?? fallbackName;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadBlankZakazkovyListPdf(): Promise<void> {
  await downloadPdfBlob("/zakazkovy-list/pdf", "zakazkovy-list.pdf");
}

export async function downloadZakazkovyListPdfForZakazka(zakazkaId: number | string): Promise<void> {
  const id = String(zakazkaId).trim();
  await downloadPdfBlob(`/${id}/zakazkovy-list/pdf`, `zakazkovy-list-${id}.pdf`);
}

export async function downloadBlankServisniZakazkaPdf(): Promise<void> {
  await downloadPdfBlob("/servisni-zakazka/pdf", "servisni-zakazka.pdf");
}

export async function downloadServisniZakazkaPdfForZakazka(zakazkaId: number | string): Promise<void> {
  const id = String(zakazkaId).trim();
  await downloadPdfBlob(`/${id}/servisni-zakazka/pdf`, `servisni-zakazka-${id}.pdf`);
}
