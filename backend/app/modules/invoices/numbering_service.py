"""Správa číselné řady faktur a variabilních symbolů."""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from backend.app.modules.invoices.models import Invoice, InvoiceSequenceState

DEFAULT_SEQUENCE_KEY = "default"
DEFAULT_PADDING = 3
MAX_SEQUENCE_DIGITS = 9


class InvoiceNumberingError(ValueError):
    """Neplatné nebo kolizní číslo faktury."""


@dataclass(frozen=True)
class InvoiceSequencePreview:
    invoice_number: str
    variable_symbol: str
    next_numeric_value: int
    padding: int


def get_invoice_sequence_preview(db: Session) -> InvoiceSequencePreview:
    state = _get_or_create_sequence_state(db)
    next_numeric_value = state.last_number + 1
    padding = max(state.padding, DEFAULT_PADDING)
    return _build_preview(next_numeric_value, padding)


def reserve_invoice_sequence(
    db: Session,
    requested_invoice_number: str | None = None,
) -> InvoiceSequencePreview:
    state = _get_or_create_sequence_state(db)
    requested_number = normalize_invoice_number(requested_invoice_number)

    if requested_number is None:
        next_numeric_value = state.last_number + 1
        padding = max(state.padding, DEFAULT_PADDING)
    else:
        next_numeric_value = int(requested_number)
        padding = max(state.padding, len(requested_number), DEFAULT_PADDING)

    preview = _build_preview(next_numeric_value, padding)
    if _invoice_number_exists(db, preview.invoice_number):
        raise InvoiceNumberingError(f"Číslo faktury {preview.invoice_number} už existuje.")
    if _variable_symbol_exists(db, preview.variable_symbol):
        raise InvoiceNumberingError(f"Variabilní symbol {preview.variable_symbol} už existuje.")

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
    state = _get_or_create_sequence_state(db)
    normalized_requested_number = normalize_invoice_number(requested_invoice_number)
    resolved_invoice_number = normalized_requested_number or current_invoice_number
    next_numeric_value = int(resolved_invoice_number)
    padding = max(state.padding, len(resolved_invoice_number), DEFAULT_PADDING)

    preview = _build_preview(next_numeric_value, padding)
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


def _build_preview(next_numeric_value: int, padding: int) -> InvoiceSequencePreview:
    if next_numeric_value <= 0:
        raise InvoiceNumberingError("Číslo faktury musí být větší než nula.")
    if len(str(next_numeric_value)) > MAX_SEQUENCE_DIGITS:
        raise InvoiceNumberingError("Vyčerpala se číselná řada variabilních symbolů (max. 9 číslic).")
    resolved_padding = max(padding, len(str(next_numeric_value)), DEFAULT_PADDING)
    invoice_number = f"{next_numeric_value:0{resolved_padding}d}"
    variable_symbol = invoice_number
    return InvoiceSequencePreview(
        invoice_number=invoice_number,
        variable_symbol=variable_symbol,
        next_numeric_value=next_numeric_value,
        padding=resolved_padding,
    )


def _get_or_create_sequence_state(db: Session) -> InvoiceSequenceState:
    state = (
        db.query(InvoiceSequenceState)
        .filter(InvoiceSequenceState.sequence_key == DEFAULT_SEQUENCE_KEY)
        .first()
    )
    if state:
        return state

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

    state = InvoiceSequenceState(
        sequence_key=DEFAULT_SEQUENCE_KEY,
        last_number=inferred_last_number,
        padding=inferred_padding,
    )
    db.add(state)
    db.flush()
    return state


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
