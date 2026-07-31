"""Zakázkový list PDF — slouží přesný originální tiskopis Lakodi."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from backend.app.modules.zakazky.models import Zakazka

ASSET_FILENAME = "zakazkovy_list_lakodi.pdf"
ASSET_PATH = Path(__file__).resolve().parent / "assets" / ASSET_FILENAME


class ZakazkovyListPdfError(RuntimeError):
    """PDF zakázkového listu se nepodařilo připravit."""


@dataclass(frozen=True)
class ZakazkovyListPdfDocument:
    filename: str
    content: bytes
    content_type: str = "application/pdf"


def build_zakazkovy_list_pdf(*, zakazka: Zakazka | None = None) -> ZakazkovyListPdfDocument:
    """
    Vrátí přesný originální PDF tiskopis.

    Prefill do skenovaného/grafického formuláře bez AcroForm polí
    by změnil vzhled — proto blank i detail používají stejný asset 1:1.
    """
    if not ASSET_PATH.is_file():
        raise ZakazkovyListPdfError(
            f"Chybí originální zakázkový list: {ASSET_PATH.name}"
        )

    content = ASSET_PATH.read_bytes()
    if not content.startswith(b"%PDF"):
        raise ZakazkovyListPdfError("Soubor zakázkového listu není platné PDF.")

    filename = (
        f"zakazkovy-list-{zakazka.id}.pdf" if zakazka is not None else "zakazkovy-list.pdf"
    )
    return ZakazkovyListPdfDocument(filename=filename, content=content)
