"""Internal read-only accounting endpoints consumed by the AI platform."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.db import get_db
from backend.app.modules.ai_accounting.auth import (
    ServiceTokenClaims,
    require_ai_accounting_scope,
)
from backend.app.modules.ai_accounting.schemas import (
    InternalDocumentDefaultsResponse,
    InternalInvoiceItemResponse,
    InternalInvoicePaymentResponse,
    InternalOutgoingDocumentResponse,
)
from backend.app.modules.invoices.service import (
    InvoiceNotFoundError,
    InvoiceValidationError,
    get_document_creation_defaults,
    get_invoice_detail,
    list_invoice_payments,
)

router = APIRouter()


@router.get("/document-defaults", response_model=InternalDocumentDefaultsResponse)
def internal_get_document_defaults(
    document_kind: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: ServiceTokenClaims = Depends(require_ai_accounting_scope("lakodi.invoices.read")),
):
    try:
        defaults = get_document_creation_defaults(db, document_kind=document_kind)
        return InternalDocumentDefaultsResponse(
            document_kind=defaults.document_kind,
            document_number=defaults.invoice_number,
            variable_symbol=defaults.variable_symbol,
        )
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/invoices/{invoice_id}", response_model=InternalOutgoingDocumentResponse)
def internal_get_outgoing_document(
    invoice_id: int,
    db: Session = Depends(get_db),
    _: ServiceTokenClaims = Depends(require_ai_accounting_scope("lakodi.invoices.read")),
):
    try:
        invoice = get_invoice_detail(db, invoice_id)
        return _build_outgoing_document_response(invoice)
    except InvoiceNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Faktura nebyla nalezena.") from exc


@router.get("/invoices/{invoice_id}/payments", response_model=list[InternalInvoicePaymentResponse])
def internal_list_invoice_payments(
    invoice_id: int,
    db: Session = Depends(get_db),
    _: ServiceTokenClaims = Depends(require_ai_accounting_scope("lakodi.payments.read")),
):
    try:
        payments = list_invoice_payments(db, invoice_id)
        return [_build_payment_response(payment) for payment in payments]
    except InvoiceNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Faktura nebyla nalezena.") from exc


def _build_outgoing_document_response(invoice) -> InternalOutgoingDocumentResponse:
    return InternalOutgoingDocumentResponse(
        document_id=invoice.id,
        document_number=invoice.invoice_number,
        document_kind=invoice.document_kind,
        status=invoice.status,
        payment_status=getattr(invoice.payment_status, "value", invoice.payment_status),
        currency=invoice.currency,
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
        subject_name=invoice.customer_name,
        total_without_vat=invoice.subtotal,
        total_vat=invoice.vat_amount,
        total_with_vat=invoice.total,
        items=[_build_item_response(item) for item in invoice.items],
        payments=[_build_payment_response(payment) for payment in invoice.payments],
    )


def _build_item_response(item) -> InternalInvoiceItemResponse:
    return InternalInvoiceItemResponse(
        item_id=item.id,
        description=item.description,
        quantity=item.quantity,
        unit_price=item.unit_price,
        total_with_vat=item.line_total,
    )


def _build_payment_response(payment) -> InternalInvoicePaymentResponse:
    return InternalInvoicePaymentResponse(
        payment_id=payment.id,
        amount=payment.amount,
        paid_at=payment.paid_at,
        payment_method=payment.payment_method,
        note=payment.note,
    )
