"""Statické servisní tiskopisy PDF — přesné originální soubory Lakodi."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from backend.app.modules.zakazky.models import Zakazka

ASSETS_DIR = Path(__file__).resolve().parent / "assets"

ZAKAZKOVY_LIST_FILENAME = "zakazkovy_list_lakodi.pdf"
SERVISNI_ZAKAZKA_FILENAME = "servisni_zakazka_prazdna.pdf"

# Backward-compatible aliases used by tests.
ASSET_FILENAME = ZAKAZKOVY_LIST_FILENAME
ASSET_PATH = ASSETS_DIR / ZAKAZKOVY_LIST_FILENAME
SERVISNI_ZAKAZKA_ASSET_PATH = ASSETS_DIR / SERVISNI_ZAKAZKA_FILENAME


class ZakazkovyListPdfError(RuntimeError):
    """PDF tiskopisu se nepodařilo připravit."""


@dataclass(frozen=True)
class ZakazkovyListPdfDocument:
    filename: str
    content: bytes
    content_type: str = "application/pdf"


def _load_static_pdf(*, asset_path: Path, missing_message: str, invalid_message: str) -> bytes:
    if not asset_path.is_file():
        raise ZakazkovyListPdfError(missing_message)
    content = asset_path.read_bytes()
    if not content.startswith(b"%PDF"):
        raise ZakazkovyListPdfError(invalid_message)
    return content


def build_zakazkovy_list_pdf(*, zakazka: Zakazka | None = None) -> ZakazkovyListPdfDocument:
    """Vrátí přesný originální zakázkový list (1:1)."""
    content = _load_static_pdf(
        asset_path=ASSET_PATH,
        missing_message=f"Chybí originální zakázkový list: {ASSET_PATH.name}",
        invalid_message="Soubor zakázkového listu není platné PDF.",
    )
    filename = (
        f"zakazkovy-list-{zakazka.id}.pdf" if zakazka is not None else "zakazkovy-list.pdf"
    )
    return ZakazkovyListPdfDocument(filename=filename, content=content)


def build_servisni_zakazka_pdf(*, zakazka: Zakazka | None = None) -> ZakazkovyListPdfDocument:
    """Vrátí přesný originální prázdný list servisní zakázky (1:1)."""
    content = _load_static_pdf(
        asset_path=SERVISNI_ZAKAZKA_ASSET_PATH,
        missing_message=f"Chybí originální servisní zakázka: {SERVISNI_ZAKAZKA_ASSET_PATH.name}",
        invalid_message="Soubor servisní zakázky není platné PDF.",
    )
    filename = (
        f"servisni-zakazka-{zakazka.id}.pdf" if zakazka is not None else "servisni-zakazka.pdf"
    )
    return ZakazkovyListPdfDocument(filename=filename, content=content)
