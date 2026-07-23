"""Idempotent document mutations for the AI accounting internal API."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.modules.invoices.models import AiAccountingExecution, Invoice
from backend.app.modules.invoices.schemas import (
    InvoiceItemCreate,
    InvoiceUpdate,
)
from backend.app.modules.invoices.service import (
    InvoiceNotFoundError,
    InvoiceValidationError,
    get_invoice_detail,
    send_invoice_email,
    update_invoice,
)


def invoice_to_update_payload(invoice: Invoice, *, status: str | None = None) -> InvoiceUpdate:
    """Rebuild a full InvoiceUpdate from a persisted invoice (status override optional)."""

    items = [
        InvoiceItemCreate(
            description=item.description,
            quantity=Decimal(str(item.quantity)),
            unit_price=Decimal(str(item.unit_price)),
        )
        for item in list(invoice.items or [])
    ]
    if not items:
        raise InvoiceValidationError("Invoice has no line items.")
    return InvoiceUpdate(
        invoice_number=invoice.invoice_number,
        document_kind=invoice.document_kind,
        status=status or invoice.status,
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
        subject_id=invoice.subject_id,
        customer_name=invoice.customer_name,
        customer_email=invoice.customer_email or None,
        customer_phone=invoice.customer_phone,
        customer_address=invoice.customer_address,
        customer_ico=invoice.customer_ico,
        customer_dic=invoice.customer_dic,
        note=invoice.note,
        business_mode=invoice.business_mode,
        tax_mode=invoice.tax_mode,
        currency=invoice.currency,
        vat_rate=Decimal(str(invoice.vat_rate)) if invoice.vat_rate is not None else None,
        items=items,
    )


def issue_draft_invoice(db: Session, invoice_id: int) -> Invoice:
    invoice = get_invoice_detail(db, invoice_id)
    if invoice.status != "draft":
        raise InvoiceValidationError("Only draft invoices can be issued.")
    payload = invoice_to_update_payload(invoice, status="issued")
    return update_invoice(db, invoice_id, payload)


def cancel_invoice_document(db: Session, invoice_id: int) -> Invoice:
    """Cancel (storno) an outgoing invoice. Hard delete is not supported by Lakodi."""

    invoice = get_invoice_detail(db, invoice_id)
    if invoice.status == "cancelled":
        return invoice
    if invoice.status not in {"draft", "issued"}:
        raise InvoiceValidationError("Only draft or issued invoices can be cancelled.")
    payload = invoice_to_update_payload(invoice, status="cancelled")
    return update_invoice(db, invoice_id, payload)


def update_draft_invoice(db: Session, invoice_id: int, payload: InvoiceUpdate) -> Invoice:
    invoice = get_invoice_detail(db, invoice_id)
    if invoice.status != "draft":
        raise InvoiceValidationError("Only draft invoices can be updated by the AI agent.")
    if payload.status is not None and payload.status != "draft":
        raise InvoiceValidationError("Draft update must keep status=draft.")
    merged = payload.model_copy(update={"status": "draft"})
    return update_invoice(db, invoice_id, merged)


def send_document_email(db: Session, invoice_id: int, *, to_email: str | None = None) -> dict[str, Any]:
    invoice = get_invoice_detail(db, invoice_id)
    if invoice.status == "draft":
        raise InvoiceValidationError("Draft invoices cannot be emailed until issued.")
    if invoice.status == "cancelled":
        raise InvoiceValidationError("Cancelled invoices cannot be emailed.")
    result = send_invoice_email(db, invoice_id, to_email=to_email)
    return {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "sent_to": result.sent_to,
        "copied_to": list(result.copied_to or []),
    }


def find_execution_by_idempotency(
    db: Session,
    *,
    tenant_id: str,
    operation: str,
    idempotency_key: str,
) -> AiAccountingExecution | None:
    return (
        db.query(AiAccountingExecution)
        .filter(
            AiAccountingExecution.tenant_id == tenant_id,
            AiAccountingExecution.operation == operation,
            AiAccountingExecution.idempotency_key == idempotency_key,
        )
        .first()
    )


def begin_or_replay_execution(
    db: Session,
    *,
    tenant_id: str,
    execution_id: str,
    operation: str,
    idempotency_key: str,
    request_hash: str,
    proposal_hash: str,
) -> tuple[AiAccountingExecution, bool]:
    """Return (execution, is_replay). Raises IntegrityError path as conflict via caller."""

    existing = find_execution_by_idempotency(
        db,
        tenant_id=tenant_id,
        operation=operation,
        idempotency_key=idempotency_key,
    )
    if existing is not None:
        if existing.request_hash != request_hash:
            raise ValueError("idempotency_conflict")
        return existing, True

    execution = AiAccountingExecution(
        tenant_id=tenant_id,
        execution_id=execution_id,
        operation=operation,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        proposal_hash=proposal_hash,
        status="pending",
    )
    db.add(execution)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = find_execution_by_idempotency(
            db,
            tenant_id=tenant_id,
            operation=operation,
            idempotency_key=idempotency_key,
        )
        if existing is None or existing.request_hash != request_hash:
            raise ValueError("idempotency_conflict")
        return existing, True
    return execution, False
