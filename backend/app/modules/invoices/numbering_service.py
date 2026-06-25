"""Správa číselných řad faktur a budoucích účetních dokladů."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

from sqlalchemy.orm import Session

from backend.app.modules.invoices.models import Invoice, InvoiceSequenceState

DocumentKind = Literal["invoice", "proforma", "tax_document", "correction", "final_invoice", "quote"]

DEFAULT_SEQUENCE_KEY = "default"
DEFAULT_PADDING = 3
MAX_SEQUENCE_DIGITS = 9
SUPPORTED_DOCUMENT_KINDS: set[str] = {
    "invoice",
    "proforma",
    "tax_document",
    "correction",
    "final_invoice",
    "quote",
}


class InvoiceNumberingError(ValueError):
    """Neplatné nebo kolizní číslo faktury."""


@dataclass(frozen=True)
class InvoiceSequencePreview:
    invoice_number: str
    variable_symbol: str
    next_numeric_value: int
    padding: int
    sequence_key: str
    document_kind: str
    sequence_year: int | None
    prefix: str | None


def get_invoice_sequence_preview(db: Session) -> InvoiceSequencePreview:
    state = _get_or_create_sequence_state(db, document_kind="invoice", sequence_year=None, use_legacy_invoice_key=True)
    next_numeric_value = state.last_number + 1
    padding = max(state.padding, DEFAULT_PADDING)
    return _build_preview(
        next_numeric_value=next_numeric_value,
        padding=padding,
        sequence_key=state.sequence_key,
        document_kind=state.document_kind or "invoice",
        sequence_year=state.sequence_year,
        prefix=state.prefix,
    )


def get_document_sequence_preview(
    db: Session,
    *,
    document_kind: DocumentKind,
    reference_date: date | None = None,
) -> InvoiceSequencePreview:
    resolved_year = _resolve_sequence_year(reference_date)
    state = _get_or_create_sequence_state(
        db,
        document_kind=document_kind,
        sequence_year=resolved_year,
        use_legacy_invoice_key=False,
    )
    next_numeric_value = state.last_number + 1
    padding = max(state.padding, DEFAULT_PADDING)
    return _build_preview(
        next_numeric_value=next_numeric_value,
        padding=padding,
        sequence_key=state.sequence_key,
        document_kind=state.document_kind or document_kind,
        sequence_year=state.sequence_year,
        prefix=state.prefix,
    )


def reserve_invoice_sequence(
    db: Session,
    requested_invoice_number: str | None = None,
) -> InvoiceSequencePreview:
    state = _get_or_create_sequence_state(db, document_kind="invoice", sequence_year=None, use_legacy_invoice_key=True)
    requested_number = normalize_invoice_number(requested_invoice_number)

    if requested_number is None:
        next_numeric_value = state.last_number + 1
        padding = max(state.padding, DEFAULT_PADDING)
    else:
        next_numeric_value = int(requested_number)
        padding = max(state.padding, len(requested_number), DEFAULT_PADDING)

    preview = _build_preview(
        next_numeric_value=next_numeric_value,
        padding=padding,
        sequence_key=state.sequence_key,
        document_kind=state.document_kind or "invoice",
        sequence_year=state.sequence_year,
        prefix=state.prefix,
    )
    if _invoice_number_exists(db, preview.invoice_number):
        raise InvoiceNumberingError(f"Číslo faktury {preview.invoice_number} už existuje.")
    if _variable_symbol_exists(db, preview.variable_symbol):
        raise InvoiceNumberingError(f"Variabilní symbol {preview.variable_symbol} už existuje.")

    state.last_number = max(state.last_number, next_numeric_value)
    state.padding = max(state.padding, padding)
    return preview


def reserve_document_sequence(
    db: Session,
    *,
    document_kind: DocumentKind,
    reference_date: date | None = None,
) -> InvoiceSequencePreview:
    resolved_year = _resolve_sequence_year(reference_date)
    state = _get_or_create_sequence_state(
        db,
        document_kind=document_kind,
        sequence_year=resolved_year,
        use_legacy_invoice_key=False,
    )
    next_numeric_value = state.last_number + 1
    padding = max(state.padding, DEFAULT_PADDING)
    preview = _build_preview(
        next_numeric_value=next_numeric_value,
        padding=padding,
        sequence_key=state.sequence_key,
        document_kind=state.document_kind or document_kind,
        sequence_year=state.sequence_year,
        prefix=state.prefix,
    )
    state.last_number = max(state.last_number, next_numeric_value)
    state.padding = max(state.padding, padding)
    return preview


def resolve_invoice_sequence_for_update(
    db: Session,
    *,
    invoice_id: int,
    current_invoice_number: str,
    requested_invoice_number: str | None,
) -> InvoiceSequencePreview:
    state = _get_or_create_sequence_state(db, document_kind="invoice", sequence_year=None, use_legacy_invoice_key=True)
    normalized_requested_number = normalize_invoice_number(requested_invoice_number)
    resolved_invoice_number = normalized_requested_number or current_invoice_number
    next_numeric_value = int(resolved_invoice_number)
    padding = max(state.padding, len(resolved_invoice_number), DEFAULT_PADDING)

    preview = _build_preview(
        next_numeric_value=next_numeric_value,
        padding=padding,
        sequence_key=state.sequence_key,
        document_kind=state.document_kind or "invoice",
        sequence_year=state.sequence_year,
        prefix=state.prefix,
    )
    if _invoice_number_exists(db, preview.invoice_number, exclude_invoice_id=invoice_id):
        raise InvoiceNumberingError(f"Číslo faktury {preview.invoice_number} už existuje.")
    if _variable_symbol_exists(db, preview.variable_symbol, exclude_invoice_id=invoice_id):
        raise InvoiceNumberingError(f"Variabilní symbol {preview.variable_symbol} už existuje.")

    state.last_number = max(state.last_number, next_numeric_value)
    state.padding = max(state.padding, padding)
    return preview


def normalize_invoice_number(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if not cleaned.isdigit():
        raise InvoiceNumberingError("Číslo faktury může obsahovat pouze číslice.")
    if len(cleaned) > MAX_SEQUENCE_DIGITS:
        raise InvoiceNumberingError("Číslo faktury může mít maximálně 9 číslic.")
    if int(cleaned) <= 0:
        raise InvoiceNumberingError("Číslo faktury musí být větší než nula.")
    return cleaned


def _build_preview(
    *,
    next_numeric_value: int,
    padding: int,
    sequence_key: str,
    document_kind: str,
    sequence_year: int | None,
    prefix: str | None,
) -> InvoiceSequencePreview:
    if next_numeric_value <= 0:
        raise InvoiceNumberingError("Číslo faktury musí být větší než nula.")

    resolved_padding = max(padding, DEFAULT_PADDING)
    if sequence_year is None:
        invoice_number = f"{next_numeric_value:0{max(resolved_padding, len(str(next_numeric_value)))}d}"
    else:
        invoice_number = f"{sequence_year}{next_numeric_value:0{resolved_padding}d}"

    if len(invoice_number) > MAX_SEQUENCE_DIGITS:
        raise InvoiceNumberingError("Vyčerpala se číselná řada variabilních symbolů (max. 9 číslic).")

    variable_symbol = invoice_number
    return InvoiceSequencePreview(
        invoice_number=invoice_number,
        variable_symbol=variable_symbol,
        next_numeric_value=next_numeric_value,
        padding=resolved_padding,
        sequence_key=sequence_key,
        document_kind=document_kind,
        sequence_year=sequence_year,
        prefix=prefix,
    )


def _get_or_create_sequence_state(
    db: Session,
    *,
    document_kind: DocumentKind,
    sequence_year: int | None,
    use_legacy_invoice_key: bool,
) -> InvoiceSequenceState:
    _validate_document_kind(document_kind)
    sequence_key = _build_sequence_key(
        document_kind=document_kind,
        sequence_year=sequence_year,
        use_legacy_invoice_key=use_legacy_invoice_key,
    )
    state = (
        db.query(InvoiceSequenceState)
        .filter(InvoiceSequenceState.sequence_key == sequence_key)
        .first()
    )
    if state:
        _backfill_state_metadata(state, document_kind=document_kind, sequence_year=sequence_year)
        return state

    inferred_last_number = 0
    inferred_padding = DEFAULT_PADDING
    if use_legacy_invoice_key and document_kind == "invoice":
        inferred_last_number, inferred_padding = _infer_legacy_invoice_sequence_state(db)

    state = InvoiceSequenceState(
        sequence_key=sequence_key,
        document_kind=document_kind,
        sequence_year=sequence_year,
        prefix=None,
        last_number=inferred_last_number,
        padding=inferred_padding,
    )
    db.add(state)
    db.flush()
    return state


def _build_sequence_key(*, document_kind: str, sequence_year: int | None, use_legacy_invoice_key: bool) -> str:
    if use_legacy_invoice_key and document_kind == "invoice" and sequence_year is None:
        return DEFAULT_SEQUENCE_KEY
    if sequence_year is None:
        return document_kind
    return f"{document_kind}:{sequence_year}"


def _infer_legacy_invoice_sequence_state(db: Session) -> tuple[int, int]:
    inferred_last_number = 0
    inferred_padding = DEFAULT_PADDING
    existing_numbers = db.query(Invoice.invoice_number, Invoice.variable_symbol).all()
    for invoice_number, variable_symbol in existing_numbers:
        if invoice_number and invoice_number.isdigit():
            inferred_last_number = max(inferred_last_number, int(invoice_number))
            inferred_padding = max(inferred_padding, len(invoice_number))
        if variable_symbol and variable_symbol.isdigit():
            inferred_last_number = max(inferred_last_number, int(variable_symbol))
            inferred_padding = max(inferred_padding, len(variable_symbol))
    return inferred_last_number, inferred_padding


def _resolve_sequence_year(reference_date: date | None) -> int:
    return (reference_date or date.today()).year


def _validate_document_kind(document_kind: str) -> None:
    if document_kind not in SUPPORTED_DOCUMENT_KINDS:
        raise InvoiceNumberingError(f"Neznámý typ číselné řady: {document_kind}.")


def _backfill_state_metadata(
    state: InvoiceSequenceState,
    *,
    document_kind: str,
    sequence_year: int | None,
) -> None:
    if state.document_kind is None:
        state.document_kind = document_kind
    if state.sequence_year is None and sequence_year is not None:
        state.sequence_year = sequence_year


def _invoice_number_exists(db: Session, invoice_number: str, *, exclude_invoice_id: int | None = None) -> bool:
    normalized_value = int(invoice_number)
    query = db.query(Invoice.id, Invoice.invoice_number)
    if exclude_invoice_id is not None:
        query = query.filter(Invoice.id != exclude_invoice_id)
    existing_numbers = query.all()
    return any(
        stored_number and stored_number.isdigit() and int(stored_number) == normalized_value
        for _, stored_number in existing_numbers
    )


def _variable_symbol_exists(db: Session, variable_symbol: str, *, exclude_invoice_id: int | None = None) -> bool:
    normalized_value = int(variable_symbol)
    query = db.query(Invoice.id, Invoice.variable_symbol).filter(Invoice.variable_symbol.isnot(None))
    if exclude_invoice_id is not None:
        query = query.filter(Invoice.id != exclude_invoice_id)
    existing_symbols = query.all()
    return any(
        stored_symbol and stored_symbol.isdigit() and int(stored_symbol) == normalized_value
        for _, stored_symbol in existing_symbols
    )
