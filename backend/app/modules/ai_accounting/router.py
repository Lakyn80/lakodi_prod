"""Internal read-only accounting endpoints consumed by the AI platform."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.db import get_db
from backend.app.modules.ai_accounting.auth import (
    ServiceTokenClaims,
    require_ai_accounting_scope,
    require_ai_accounting_scopes,
)
from backend.app.modules.ai_accounting.schemas import (
    InternalCustomerAccountingSummaryResponse,
    InternalDocumentDefaultsResponse,
    InternalInvoiceItemResponse,
    InternalInvoicePaymentResponse,
    InternalMonthlyAccountingSummaryResponse,
    InternalOutgoingDocumentResponse,
    InternalOutgoingDocumentListItemResponse,
    InternalOutgoingDocumentListResponse,
    InternalOutgoingDocumentsSummaryResponse,
)
from backend.app.modules.invoices.service import (
    InvoiceNotFoundError,
    InvoiceValidationError,
    OutgoingInvoiceFilters,
    get_customer_accounting_summary,
    get_document_creation_defaults,
    get_invoice_detail,
    get_monthly_accounting_summary,
    get_outgoing_documents_summary,
    list_outgoing_documents,
    list_invoice_payments,
    search_outgoing_documents,
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


@router.get("/invoices/search", response_model=InternalOutgoingDocumentListResponse)
def internal_search_outgoing_documents(
    query: str = Query(min_length=1, max_length=256),
    customer_query: str | None = Query(default=None, max_length=256),
    invoice_number: str | None = Query(default=None, max_length=64),
    status: str | None = Query(default=None, max_length=64),
    payment_status: str | None = Query(default=None, max_length=32),
    currency: str | None = Query(default=None, max_length=8),
    issue_date_from: str | None = Query(default=None),
    issue_date_to: str | None = Query(default=None),
    due_date_from: str | None = Query(default=None),
    due_date_to: str | None = Query(default=None),
    paid_date_from: str | None = Query(default=None),
    paid_date_to: str | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10000),
    sort: str = Query(default="issue_date_desc"),
    db: Session = Depends(get_db),
    _: ServiceTokenClaims = Depends(require_ai_accounting_scope("lakodi.invoices.read")),
):
    try:
        page = search_outgoing_documents(
            db,
            filters=_filters(
                query=query,
                customer_query=customer_query,
                invoice_number=invoice_number,
                status=status,
                payment_status=payment_status,
                currency=currency,
                issue_date_from=issue_date_from,
                issue_date_to=issue_date_to,
                due_date_from=due_date_from,
                due_date_to=due_date_to,
                paid_date_from=paid_date_from,
                paid_date_to=paid_date_to,
            ),
            limit=limit,
            offset=offset,
            sort=sort,
        )
        return _build_document_list_response(page)
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/invoices", response_model=InternalOutgoingDocumentListResponse)
def internal_list_outgoing_documents(
    customer_query: str | None = Query(default=None, max_length=256),
    invoice_number: str | None = Query(default=None, max_length=64),
    status: str | None = Query(default=None, max_length=64),
    payment_status: str | None = Query(default=None, max_length=32),
    currency: str | None = Query(default=None, max_length=8),
    issue_date_from: str | None = Query(default=None),
    issue_date_to: str | None = Query(default=None),
    due_date_from: str | None = Query(default=None),
    due_date_to: str | None = Query(default=None),
    paid_date_from: str | None = Query(default=None),
    paid_date_to: str | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10000),
    sort: str = Query(default="issue_date_desc"),
    db: Session = Depends(get_db),
    _: ServiceTokenClaims = Depends(require_ai_accounting_scope("lakodi.invoices.read")),
):
    try:
        page = list_outgoing_documents(
            db,
            filters=_filters(
                customer_query=customer_query,
                invoice_number=invoice_number,
                status=status,
                payment_status=payment_status,
                currency=currency,
                issue_date_from=issue_date_from,
                issue_date_to=issue_date_to,
                due_date_from=due_date_from,
                due_date_to=due_date_to,
                paid_date_from=paid_date_from,
                paid_date_to=paid_date_to,
            ),
            limit=limit,
            offset=offset,
            sort=sort,
        )
        return _build_document_list_response(page)
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/invoices/summary", response_model=InternalOutgoingDocumentsSummaryResponse)
def internal_get_outgoing_documents_summary(
    customer_query: str | None = Query(default=None, max_length=256),
    invoice_number: str | None = Query(default=None, max_length=64),
    status: str | None = Query(default=None, max_length=64),
    payment_status: str | None = Query(default=None, max_length=32),
    currency: str | None = Query(default=None, max_length=8),
    issue_date_from: str | None = Query(default=None),
    issue_date_to: str | None = Query(default=None),
    due_date_from: str | None = Query(default=None),
    due_date_to: str | None = Query(default=None),
    paid_date_from: str | None = Query(default=None),
    paid_date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: ServiceTokenClaims = Depends(
        require_ai_accounting_scopes(("lakodi.invoices.read", "lakodi.payments.read"))
    ),
):
    try:
        summary = get_outgoing_documents_summary(
            db,
            filters=_filters(
                customer_query=customer_query,
                invoice_number=invoice_number,
                status=status,
                payment_status=payment_status,
                currency=currency,
                issue_date_from=issue_date_from,
                issue_date_to=issue_date_to,
                due_date_from=due_date_from,
                due_date_to=due_date_to,
                paid_date_from=paid_date_from,
                paid_date_to=paid_date_to,
            ),
        )
        return _build_summary_response(summary)
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/customers/summary", response_model=InternalCustomerAccountingSummaryResponse)
def internal_get_customer_accounting_summary(
    customer_query: str = Query(min_length=1, max_length=256),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: ServiceTokenClaims = Depends(
        require_ai_accounting_scopes(("lakodi.invoices.read", "lakodi.payments.read"))
    ),
):
    try:
        result = get_customer_accounting_summary(
            db,
            customer_query=customer_query,
            date_from=_parse_date(date_from),
            date_to=_parse_date(date_to),
        )
        return InternalCustomerAccountingSummaryResponse(
            customer_query=result.customer_query,
            ambiguous=result.ambiguous,
            customer_matches=result.customer_matches,
            summary=_build_summary_response(result.summary) if result.summary else None,
        )
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/monthly-summary", response_model=InternalMonthlyAccountingSummaryResponse)
def internal_get_monthly_accounting_summary(
    year: int = Query(ge=2000, le=2100),
    month: int = Query(ge=1, le=12),
    db: Session = Depends(get_db),
    _: ServiceTokenClaims = Depends(
        require_ai_accounting_scopes(("lakodi.invoices.read", "lakodi.payments.read"))
    ),
):
    try:
        summary = get_monthly_accounting_summary(db, year=year, month=month)
        base = _build_summary_response(summary)
        return InternalMonthlyAccountingSummaryResponse(
            year=year,
            month=month,
            document_count=base.document_count,
            currencies=base.currencies,
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


def _build_document_list_response(page) -> InternalOutgoingDocumentListResponse:
    return InternalOutgoingDocumentListResponse(
        items=[_build_document_list_item_response(invoice) for invoice in page.items],
        limit=page.limit,
        offset=page.offset,
        total_count=page.total_count,
        sort=page.sort,
    )


def _build_document_list_item_response(invoice) -> InternalOutgoingDocumentListItemResponse:
    return InternalOutgoingDocumentListItemResponse(
        document_id=invoice.id,
        document_number=invoice.invoice_number,
        document_kind=invoice.document_kind,
        status=invoice.status,
        payment_status=getattr(invoice, "payment_status", "unpaid"),
        currency=invoice.currency,
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
        subject_name=invoice.customer_name,
        total_without_vat=invoice.subtotal,
        total_vat=invoice.vat_amount,
        total_with_vat=invoice.total,
        received_payments=getattr(invoice, "total_paid", 0),
        outstanding_amount=getattr(invoice, "remaining_amount", invoice.total),
    )


def _build_summary_response(summary) -> InternalOutgoingDocumentsSummaryResponse:
    return InternalOutgoingDocumentsSummaryResponse(
        document_count=summary.document_count,
        currencies=[
            {
                "currency": item.currency,
                "document_count": item.document_count,
                "invoiced_without_vat": item.invoiced_without_vat,
                "vat": item.vat,
                "invoiced_with_vat": item.invoiced_with_vat,
                "received_payments": item.received_payments,
                "outstanding_amount": item.outstanding_amount,
            }
            for item in summary.currencies
        ],
    )


def _filters(
    *,
    query: str | None = None,
    customer_query: str | None = None,
    invoice_number: str | None = None,
    status: str | None = None,
    payment_status: str | None = None,
    currency: str | None = None,
    issue_date_from: str | None = None,
    issue_date_to: str | None = None,
    due_date_from: str | None = None,
    due_date_to: str | None = None,
    paid_date_from: str | None = None,
    paid_date_to: str | None = None,
) -> OutgoingInvoiceFilters:
    return OutgoingInvoiceFilters(
        query=query,
        customer_query=customer_query,
        invoice_number=invoice_number,
        status=status,
        payment_status=payment_status,
        currency=currency,
        issue_date_from=_parse_date(issue_date_from),
        issue_date_to=_parse_date(issue_date_to),
        due_date_from=_parse_date(due_date_from),
        due_date_to=_parse_date(due_date_to),
        paid_date_from=_parse_date(paid_date_from),
        paid_date_to=_parse_date(paid_date_to),
    )


def _parse_date(value: str | None) -> date | None:
    if value is None or not value.strip():
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError as exc:
        raise InvoiceValidationError("Datum musi byt ve formatu YYYY-MM-DD.") from exc


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
