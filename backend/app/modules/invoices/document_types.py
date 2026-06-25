"""Minimal backend foundation for invoice-like document kinds."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

DocumentKind = Literal["invoice", "proforma", "tax_document", "correction", "final_invoice", "quote"]

DEFAULT_DOCUMENT_KIND = "invoice"
SUPPORTED_DOCUMENT_KINDS: tuple[DocumentKind, ...] = (
    "invoice",
    "proforma",
    "tax_document",
    "correction",
    "final_invoice",
    "quote",
)


@dataclass(frozen=True)
class DocumentKindMetadata:
    machine_value: DocumentKind
    internal_label: str
    numbering_prefix: str | None
    allows_payment_tracking: bool
    allows_pdf_email: bool
    participates_in_total_calculation: bool
    allows_manual_create: bool
    requires_source_relation: bool
    supports_tax_document_generation: bool
    supports_final_invoice_settlement: bool


DOCUMENT_KIND_METADATA: dict[DocumentKind, DocumentKindMetadata] = {
    "invoice": DocumentKindMetadata(
        machine_value="invoice",
        internal_label="Faktura",
        numbering_prefix=None,
        allows_payment_tracking=True,
        allows_pdf_email=True,
        participates_in_total_calculation=True,
        allows_manual_create=True,
        requires_source_relation=False,
        supports_tax_document_generation=False,
        supports_final_invoice_settlement=False,
    ),
    "proforma": DocumentKindMetadata(
        machine_value="proforma",
        internal_label="Proforma",
        numbering_prefix="1",
        allows_payment_tracking=True,
        allows_pdf_email=True,
        participates_in_total_calculation=True,
        allows_manual_create=True,
        requires_source_relation=False,
        supports_tax_document_generation=True,
        supports_final_invoice_settlement=False,
    ),
    "tax_document": DocumentKindMetadata(
        machine_value="tax_document",
        internal_label="Daňový doklad",
        numbering_prefix="2",
        allows_payment_tracking=False,
        allows_pdf_email=True,
        participates_in_total_calculation=True,
        allows_manual_create=False,
        requires_source_relation=True,
        supports_tax_document_generation=False,
        supports_final_invoice_settlement=False,
    ),
    "correction": DocumentKindMetadata(
        machine_value="correction",
        internal_label="Opravný doklad",
        numbering_prefix="3",
        allows_payment_tracking=False,
        allows_pdf_email=True,
        participates_in_total_calculation=True,
        allows_manual_create=True,
        requires_source_relation=False,
        supports_tax_document_generation=False,
        supports_final_invoice_settlement=False,
    ),
    "final_invoice": DocumentKindMetadata(
        machine_value="final_invoice",
        internal_label="Konečná faktura",
        numbering_prefix="4",
        allows_payment_tracking=False,
        allows_pdf_email=True,
        participates_in_total_calculation=True,
        allows_manual_create=True,
        requires_source_relation=False,
        supports_tax_document_generation=False,
        supports_final_invoice_settlement=False,
    ),
    "quote": DocumentKindMetadata(
        machine_value="quote",
        internal_label="Cenová nabídka",
        numbering_prefix="5",
        allows_payment_tracking=False,
        allows_pdf_email=True,
        participates_in_total_calculation=True,
        allows_manual_create=True,
        requires_source_relation=False,
        supports_tax_document_generation=False,
        supports_final_invoice_settlement=False,
    ),
}


def normalize_document_kind(value: str | None, *, default_to_invoice: bool = True) -> str | None:
    if value is None:
        return DEFAULT_DOCUMENT_KIND if default_to_invoice else None
    cleaned = value.strip()
    if not cleaned:
        return DEFAULT_DOCUMENT_KIND if default_to_invoice else None
    if cleaned not in DOCUMENT_KIND_METADATA:
        supported = ", ".join(SUPPORTED_DOCUMENT_KINDS)
        raise ValueError(f"Neplatný typ dokladu. Povolené hodnoty: {supported}.")
    return cleaned


def get_document_kind_metadata(document_kind: str | None) -> DocumentKindMetadata:
    normalized = normalize_document_kind(document_kind)
    return DOCUMENT_KIND_METADATA[normalized]
