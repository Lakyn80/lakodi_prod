"""Internal accounting endpoints consumed by the AI platform."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.db import get_db
from backend.app.modules.ai_accounting.auth import (
    ServiceTokenClaims,
    require_ai_accounting_scope,
    require_ai_accounting_scopes,
)
from backend.app.modules.ai_accounting.schemas import (
    InternalCustomerAccountingSummaryResponse,
    InternalCustomerSearchItemResponse,
    InternalCustomerSearchResponse,
    InternalDocumentDefaultsResponse,
    InternalDocumentMutationRequest,
    InternalDocumentSendEmailRequest,
    InternalDocumentUpdateRequest,
    InternalExecutionStatusResponse,
    InternalInvoiceCreateRequest,
    InternalInvoiceItemResponse,
    InternalInvoicePaymentResponse,
    InternalInvoiceValidationResponse,
    InternalMonthlyAccountingSummaryResponse,
    InternalOutgoingDocumentResponse,
    InternalOutgoingDocumentListItemResponse,
    InternalOutgoingDocumentListResponse,
    InternalOutgoingDocumentsSummaryResponse,
    InternalSyncChangeItemResponse,
    InternalSyncChangePageResponse,
    InternalSyncIdPageResponse,
)
from backend.app.modules.ai_accounting.sync_feed import (
    list_customer_changes,
    list_customer_ids,
    list_document_changes,
    list_document_ids,
)
from backend.app.modules.invoices.models import AiAccountingExecution
from backend.app.modules.invoices.service import (
    InvoiceNotFoundError,
    InvoiceValidationError,
    OutgoingInvoiceFilters,
    _normalize_vat_rate,
    _quantize_money,
    create_invoice,
    get_customer_accounting_summary,
    get_document_creation_defaults,
    get_invoice_detail,
    get_monthly_accounting_summary,
    get_outgoing_documents_summary,
    list_outgoing_documents,
    list_invoice_payments,
    list_invoice_subjects,
    search_outgoing_documents,
    validate_invoice_create_payload,
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


@router.get("/customers/search", response_model=InternalCustomerSearchResponse)
def internal_search_customers(
    query: str = Query(min_length=1, max_length=256),
    limit: int = Query(default=10, ge=1, le=25),
    db: Session = Depends(get_db),
    _: ServiceTokenClaims = Depends(require_ai_accounting_scope("lakodi.customers.read")),
):
    subjects = list_invoice_subjects(db, search=query)
    bounded_subjects = subjects[:limit]
    return InternalCustomerSearchResponse(
        items=[
            InternalCustomerSearchItemResponse(
                subject_id=subject.id,
                name=subject.name,
                email=subject.email,
                ico=subject.ico,
                dic=subject.dic,
                country=subject.country,
            )
            for subject in bounded_subjects
        ],
        limit=limit,
        total_count=len(subjects),
    )


def _sync_change_response(item) -> InternalSyncChangeItemResponse:
    return InternalSyncChangeItemResponse(
        operation=item.operation,
        entity_type=item.entity_type,
        external_id=item.external_id,
        source_version=item.source_version,
        updated_at=item.updated_at,
        deleted_at=item.deleted_at,
        content_hash=item.content_hash,
        display_name=item.display_name,
        document_number=item.document_number,
        variable_symbol=item.variable_symbol,
        customer_external_id=item.customer_external_id,
        customer_name=item.customer_name,
        customer_ico=item.customer_ico,
        customer_dic=item.customer_dic,
        customer_email=item.customer_email,
        document_status=item.document_status,
        payment_status=item.payment_status,
        currency=item.currency,
        total_amount=item.total_amount,
        issue_date=item.issue_date,
        due_date=item.due_date,
        taxable_supply_date=item.taxable_supply_date,
    )


@router.get("/documents/changes", response_model=InternalSyncChangePageResponse)
def internal_list_document_changes(
    cursor: str | None = Query(default=None, max_length=512),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: ServiceTokenClaims = Depends(require_ai_accounting_scope("lakodi.invoices.read")),
):
    try:
        page = list_document_changes(db, cursor=cursor, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return InternalSyncChangePageResponse(
        items=[_sync_change_response(item) for item in page.items],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.get("/customers/changes", response_model=InternalSyncChangePageResponse)
def internal_list_customer_changes(
    cursor: str | None = Query(default=None, max_length=512),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: ServiceTokenClaims = Depends(require_ai_accounting_scope("lakodi.customers.read")),
):
    try:
        page = list_customer_changes(db, cursor=cursor, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return InternalSyncChangePageResponse(
        items=[_sync_change_response(item) for item in page.items],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.get("/documents/ids", response_model=InternalSyncIdPageResponse)
def internal_list_document_ids(
    cursor: str | None = Query(default=None, max_length=512),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: ServiceTokenClaims = Depends(require_ai_accounting_scope("lakodi.invoices.read")),
):
    try:
        page = list_document_ids(db, cursor=cursor, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return InternalSyncIdPageResponse(
        external_ids=list(page.external_ids),
        content_hashes=page.content_hashes,
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.get("/customers/ids", response_model=InternalSyncIdPageResponse)
def internal_list_customer_ids(
    cursor: str | None = Query(default=None, max_length=512),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: ServiceTokenClaims = Depends(require_ai_accounting_scope("lakodi.customers.read")),
):
    try:
        page = list_customer_ids(db, cursor=cursor, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return InternalSyncIdPageResponse(
        external_ids=list(page.external_ids),
        content_hashes=page.content_hashes,
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


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


@router.post("/invoices/validate", response_model=InternalInvoiceValidationResponse)
def internal_validate_invoice(
    payload: InternalInvoiceCreateRequest,
    db: Session = Depends(get_db),
    _: ServiceTokenClaims = Depends(require_ai_accounting_scope("lakodi.invoices.draft")),
):
    try:
        preview = validate_invoice_create_payload(db, payload.invoice)
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return InternalInvoiceValidationResponse(
        valid=True,
        subject_id=preview.subject_id,
        subject_name=preview.subject_name,
        currency=preview.currency,
        total_without_vat=preview.subtotal,
        total_vat=preview.vat_amount,
        total_with_vat=preview.total,
        vat_rate=preview.vat_rate,
        item_count=preview.item_count,
    )


@router.post("/invoices", response_model=InternalExecutionStatusResponse)
def internal_create_invoice(
    payload: InternalInvoiceCreateRequest,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
    db: Session = Depends(get_db),
    claims: ServiceTokenClaims = Depends(require_ai_accounting_scope("lakodi.invoices.write")),
):
    return _create_invoice_execution(
        db=db,
        claims=claims,
        payload=payload,
        idempotency_key=idempotency_key,
        operation="create_outgoing_invoice",
        force_status=None,
    )


@router.post("/outgoing-documents/drafts", response_model=InternalExecutionStatusResponse)
def internal_create_outgoing_document_draft(
    payload: InternalInvoiceCreateRequest,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
    db: Session = Depends(get_db),
    claims: ServiceTokenClaims = Depends(
        require_ai_accounting_scope("lakodi.invoices.drafts.create")
    ),
):
    """Create only a native Lakodi draft invoice. Never issues or sends."""

    return _create_invoice_execution(
        db=db,
        claims=claims,
        payload=payload,
        idempotency_key=idempotency_key,
        operation="create_outgoing_invoice_draft",
        force_status="draft",
    )


@router.post(
    "/outgoing-documents/{invoice_id}/issue",
    response_model=InternalExecutionStatusResponse,
)
def internal_issue_outgoing_document(
    invoice_id: int,
    payload: InternalDocumentMutationRequest,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
    db: Session = Depends(get_db),
    claims: ServiceTokenClaims = Depends(require_ai_accounting_scope("lakodi.invoices.write")),
):
    if payload.invoice_id != invoice_id:
        raise HTTPException(status_code=422, detail="invoice_id mismatch.")
    from backend.app.modules.ai_accounting.mutations import issue_draft_invoice

    return _mutate_document_execution(
        db=db,
        claims=claims,
        invoice_id=invoice_id,
        execution_id=payload.execution_id,
        proposal_hash=payload.proposal_hash,
        idempotency_key=idempotency_key,
        operation="issue_outgoing_invoice",
        mutator=lambda: issue_draft_invoice(db, invoice_id),
    )


@router.post(
    "/outgoing-documents/{invoice_id}/update",
    response_model=InternalExecutionStatusResponse,
)
def internal_update_outgoing_document(
    invoice_id: int,
    payload: InternalDocumentUpdateRequest,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
    db: Session = Depends(get_db),
    claims: ServiceTokenClaims = Depends(require_ai_accounting_scope("lakodi.invoices.write")),
):
    if payload.invoice_id != invoice_id:
        raise HTTPException(status_code=422, detail="invoice_id mismatch.")
    from backend.app.modules.ai_accounting.mutations import update_draft_invoice

    return _mutate_document_execution(
        db=db,
        claims=claims,
        invoice_id=invoice_id,
        execution_id=payload.execution_id,
        proposal_hash=payload.proposal_hash,
        idempotency_key=idempotency_key,
        operation="update_outgoing_invoice",
        request_extra={"invoice": payload.invoice.model_dump(mode="json")},
        mutator=lambda: update_draft_invoice(db, invoice_id, payload.invoice),
    )


@router.post(
    "/outgoing-documents/{invoice_id}/cancel",
    response_model=InternalExecutionStatusResponse,
)
def internal_cancel_outgoing_document(
    invoice_id: int,
    payload: InternalDocumentMutationRequest,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
    db: Session = Depends(get_db),
    claims: ServiceTokenClaims = Depends(require_ai_accounting_scope("lakodi.invoices.write")),
):
    """Cancel/storno an outgoing invoice. Hard delete is not available."""

    if payload.invoice_id != invoice_id:
        raise HTTPException(status_code=422, detail="invoice_id mismatch.")
    from backend.app.modules.ai_accounting.mutations import cancel_invoice_document

    return _mutate_document_execution(
        db=db,
        claims=claims,
        invoice_id=invoice_id,
        execution_id=payload.execution_id,
        proposal_hash=payload.proposal_hash,
        idempotency_key=idempotency_key,
        operation="cancel_outgoing_invoice",
        mutator=lambda: cancel_invoice_document(db, invoice_id),
    )


@router.post(
    "/outgoing-documents/{invoice_id}/send-email",
    response_model=InternalExecutionStatusResponse,
)
def internal_send_outgoing_document_email(
    invoice_id: int,
    payload: InternalDocumentSendEmailRequest,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
    db: Session = Depends(get_db),
    claims: ServiceTokenClaims = Depends(require_ai_accounting_scope("lakodi.invoices.send")),
):
    if payload.invoice_id != invoice_id:
        raise HTTPException(status_code=422, detail="invoice_id mismatch.")
    from backend.app.modules.ai_accounting.mutations import send_document_email

    email_box: dict[str, Any] = {}

    def _send() -> Any:
        delivery = send_document_email(db, invoice_id, to_email=payload.to_email)
        email_box["delivery"] = delivery
        return get_invoice_detail(db, invoice_id)

    response = _mutate_document_execution(
        db=db,
        claims=claims,
        invoice_id=invoice_id,
        execution_id=payload.execution_id,
        proposal_hash=payload.proposal_hash,
        idempotency_key=idempotency_key,
        operation="send_outgoing_invoice_email",
        request_extra={"to_email": payload.to_email},
        mutator=_send,
    )
    if email_box.get("delivery"):
        return response.model_copy(update={"email_delivery": email_box["delivery"]})
    return response


def _mutate_document_execution(
    *,
    db: Session,
    claims: ServiceTokenClaims,
    invoice_id: int,
    execution_id: str,
    proposal_hash: str,
    idempotency_key: str,
    operation: str,
    mutator: Any,
    request_extra: dict[str, Any] | None = None,
) -> InternalExecutionStatusResponse:
    from backend.app.modules.ai_accounting.logging_util import log_event
    from backend.app.modules.ai_accounting.mutations import begin_or_replay_execution
    from backend.app.modules.ai_accounting.tracing import business_span

    request_hash = _canonical_hash(
        {
            "operation": operation,
            "execution_id": execution_id,
            "proposal_hash": proposal_hash,
            "invoice_id": invoice_id,
            **(request_extra or {}),
        }
    )
    with business_span(
        f"lakodi.invoice.{operation}",
        **{
            "accounting.action_type": operation,
            "accounting.invoice_id": invoice_id,
        },
    ):
        try:
            execution, is_replay = begin_or_replay_execution(
                db,
                tenant_id=claims.tenant_id,
                execution_id=execution_id,
                operation=operation,
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                proposal_hash=proposal_hash,
            )
        except ValueError as exc:
            if str(exc) == "idempotency_conflict":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT, detail="Idempotency conflict."
                ) from exc
            raise

        if is_replay:
            log_event(
                "accounting.lakodi.mutation.idempotent_replay",
                "Lakodi mutation idempotent replay",
                operation=operation,
                execution_id=execution.execution_id,
                invoice_id=execution.invoice_id,
            )
            return _execution_status_response(db, execution)

        try:
            invoice = mutator()
        except InvoiceNotFoundError as exc:
            execution.status = "failed"
            execution.error_code = "not_found"
            db.add(execution)
            db.commit()
            raise HTTPException(status_code=404, detail="Invoice was not found.") from exc
        except InvoiceValidationError as exc:
            execution.status = "failed"
            execution.error_code = "validation_error"
            db.add(execution)
            db.commit()
            log_event(
                "accounting.lakodi.mutation.failed",
                "Lakodi mutation validation failed",
                safe_error_code="validation_error",
                operation=operation,
            )
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:
            # Map invoice email delivery failures to stable client status codes.
            # Unhandled SMTP/config errors previously leaked as opaque HTTP 500.
            from backend.app.modules.invoices.email_service import (
                InvoiceEmailConfigurationError,
                InvoiceEmailSendError,
            )

            if isinstance(exc, InvoiceEmailConfigurationError):
                execution.status = "failed"
                execution.error_code = "email_not_configured"
                db.add(execution)
                db.commit()
                log_event(
                    "accounting.lakodi.mutation.failed",
                    "Lakodi email not configured",
                    safe_error_code="email_not_configured",
                    operation=operation,
                )
                raise HTTPException(status_code=503, detail=str(exc)) from exc
            if isinstance(exc, InvoiceEmailSendError):
                detail = str(exc) or "Invoice email could not be sent."
                missing_recipient = "chybí e-mailová adresa příjemce" in detail.lower()
                execution.status = "failed"
                execution.error_code = (
                    "email_recipient_missing" if missing_recipient else "email_send_failed"
                )
                db.add(execution)
                db.commit()
                log_event(
                    "accounting.lakodi.mutation.failed",
                    "Lakodi email send failed",
                    safe_error_code=execution.error_code,
                    operation=operation,
                )
                status_code = 400 if missing_recipient else 502
                raise HTTPException(status_code=status_code, detail=detail) from exc
            raise

        execution.status = "succeeded"
        execution.invoice_id = invoice.id
        db.add(execution)
        db.commit()
        log_event(
            "accounting.lakodi.mutation.succeeded",
            "Lakodi mutation succeeded",
            operation=operation,
            execution_id=execution_id,
            invoice_id=invoice.id,
            document_status=invoice.status,
        )
        return _execution_status_response(db, execution)


def _create_invoice_execution(
    *,
    db: Session,
    claims: ServiceTokenClaims,
    payload: InternalInvoiceCreateRequest,
    idempotency_key: str,
    operation: str,
    force_status: str | None,
) -> InternalExecutionStatusResponse:
    from backend.app.modules.ai_accounting.correlation import (
        bind_correlation_context,
        build_context,
        clear_correlation_context,
    )
    from backend.app.modules.ai_accounting.logging_util import log_event
    from backend.app.modules.ai_accounting.tracing import business_span

    # Re-bind from verified claims in this worker thread. Sync FastAPI handlers may
    # not see ContextVar values set inside Depends() on another thread.
    bind_correlation_context(
        build_context(
            correlation_id=claims.correlation_id,
            trace_id=claims.trace_id,
            tenant_id=claims.tenant_id,
            execution_id=payload.execution_id,
        )
    )

    span_name = (
        "lakodi.invoice_draft.create"
        if operation == "create_outgoing_invoice_draft"
        else "lakodi.invoice.create"
    )
    with business_span(
        span_name,
        **{
            "accounting.action_type": operation,
            "accounting.document_state": force_status or "unknown",
            "correlation_id": claims.correlation_id,
        },
    ):
        try:
            log_event(
                "accounting.lakodi.draft.request.started"
                if operation == "create_outgoing_invoice_draft"
                else "accounting.lakodi.invoice.request.started",
                "Lakodi invoice execution started",
                operation=operation,
                execution_id=payload.execution_id,
                correlation_id=claims.correlation_id,
                trace_id=claims.trace_id,
            )
            return _create_invoice_execution_body(
                db=db,
                claims=claims,
                payload=payload,
                idempotency_key=idempotency_key,
                operation=operation,
                force_status=force_status,
            )
        finally:
            clear_correlation_context()


def _create_invoice_execution_body(
    *,
    db: Session,
    claims: ServiceTokenClaims,
    payload: InternalInvoiceCreateRequest,
    idempotency_key: str,
    operation: str,
    force_status: str | None,
) -> InternalExecutionStatusResponse:
    from backend.app.modules.ai_accounting.logging_util import log_event

    invoice_payload = payload.invoice
    if force_status is not None:
        if payload.invoice.status != force_status:
            raise HTTPException(
                status_code=422,
                detail=f"This endpoint accepts only status={force_status}.",
            )
        invoice_payload = payload.invoice.model_copy(update={"status": force_status})

    request_hash = _canonical_hash(
        {
            "operation": operation,
            "execution_id": payload.execution_id,
            "proposal_hash": payload.proposal_hash,
            "invoice": invoice_payload.model_dump(mode="json"),
        }
    )
    existing = _find_execution_by_idempotency(
        db,
        tenant_id=claims.tenant_id,
        operation=operation,
        idempotency_key=idempotency_key,
    )
    if existing is not None:
        if existing.request_hash != request_hash:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Idempotency conflict.")
        log_event(
            "accounting.lakodi.draft.idempotent_replay"
            if operation == "create_outgoing_invoice_draft"
            else "accounting.lakodi.invoice.idempotent_replay",
            "Lakodi idempotent execution replay",
            operation=operation,
            execution_id=existing.execution_id,
            invoice_id=existing.invoice_id,
        )
        return _execution_status_response(db, existing)

    execution = AiAccountingExecution(
        tenant_id=claims.tenant_id,
        execution_id=payload.execution_id,
        operation=operation,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        proposal_hash=payload.proposal_hash,
        status="pending",
    )
    db.add(execution)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = _find_execution_by_idempotency(
            db,
            tenant_id=claims.tenant_id,
            operation=operation,
            idempotency_key=idempotency_key,
        )
        if existing is None or existing.request_hash != request_hash:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Idempotency conflict.")
        return _execution_status_response(db, existing)

    try:
        invoice = create_invoice(
            db,
            invoice_payload,
            audit_source="ai_accounting",
            audit_metadata={
                "execution_id": payload.execution_id,
                "proposal_hash": payload.proposal_hash,
                "trace_id": claims.trace_id,
                "correlation_id": claims.correlation_id,
                "user_id": claims.user_id,
                "operation": operation,
            },
        )
    except InvoiceValidationError as exc:
        execution.status = "failed"
        execution.error_code = "validation_error"
        db.add(execution)
        db.commit()
        log_event(
            "accounting.lakodi.draft.failed",
            "Lakodi invoice validation failed",
            safe_error_code="validation_error",
            operation=operation,
        )
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if force_status == "draft" and invoice.status != "draft":
        execution.status = "failed"
        execution.error_code = "draft_only_enforcement_failed"
        db.add(execution)
        db.commit()
        log_event(
            "accounting.lakodi.draft.failed",
            "Draft-only enforcement failed",
            safe_error_code="draft_only_enforcement_failed",
            operation=operation,
        )
        raise HTTPException(
            status_code=500,
            detail="Lakodi did not persist a draft document.",
        )

    execution.status = "succeeded"
    execution.invoice_id = invoice.id
    db.add(execution)
    db.commit()
    log_event(
        "accounting.lakodi.draft.created"
        if operation == "create_outgoing_invoice_draft"
        else "accounting.lakodi.invoice.created",
        "Lakodi invoice execution succeeded",
        operation=operation,
        execution_id=payload.execution_id,
        invoice_id=invoice.id,
        document_status=invoice.status,
        correlation_id=claims.correlation_id,
        trace_id=claims.trace_id,
    )
    return _execution_status_response(db, execution)


@router.get("/executions/{execution_id}", response_model=InternalExecutionStatusResponse)
def internal_get_execution(
    execution_id: str,
    db: Session = Depends(get_db),
    claims: ServiceTokenClaims = Depends(require_ai_accounting_scope("lakodi.invoices.write")),
):
    """Replay-safe execution lookup used by write and draft-create workers.

    Note: draft-create workers also call reconcile via the same idempotency key on
    POST; this endpoint remains gated by write scope for the legacy issue path.
    Draft-create reconciliation primarily uses POST replay.
    """
    execution = (
        db.query(AiAccountingExecution)
        .filter(
            AiAccountingExecution.tenant_id == claims.tenant_id,
            AiAccountingExecution.execution_id == execution_id,
        )
        .first()
    )
    if execution is None:
        raise HTTPException(status_code=404, detail="Execution was not found.")
    return _execution_status_response(db, execution)


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
        subject_id=getattr(invoice, "subject_id", None),
        subject_name=invoice.customer_name,
        vat_rate=Decimal(invoice.vat_rate) if invoice.vat_rate is not None else None,
        total_without_vat=invoice.subtotal,
        total_vat=invoice.vat_amount,
        total_with_vat=invoice.total,
        items=[_build_item_response(item, invoice=invoice) for item in invoice.items],
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


def _build_item_response(item, *, invoice) -> InternalInvoiceItemResponse:
    """Map native InvoiceItem using truthful net/VAT semantics.

    Native columns:
    - unit_price: net unit price (without VAT)
    - line_total: net line total (quantity * unit_price)
    - vat_rate: invoice header only (not stored per item)

    Item vat_amount / total_with_vat are derived with Lakodi money quantization.
    Per-line derived VAT may not sum exactly to header vat_amount (invoice-level
    rounding); header totals remain the source of truth for invoice VAT/gross.
    """

    unit_price = _quantize_money(Decimal(item.unit_price))
    total_without_vat = _quantize_money(Decimal(item.line_total))
    tax_mode = getattr(invoice, "tax_mode", "standard") or "standard"
    header_rate = Decimal(invoice.vat_rate) if invoice.vat_rate is not None else None
    vat_rate: Decimal | None = None
    vat_amount: Decimal | None = None
    total_with_vat: Decimal | None = None

    if tax_mode == "standard" and header_rate is not None:
        vat_rate = _normalize_vat_rate(header_rate)
        vat_amount = _quantize_money(total_without_vat * vat_rate / Decimal("100"))
        total_with_vat = _quantize_money(total_without_vat + vat_amount)
    elif tax_mode == "reverse_charge":
        vat_rate = _normalize_vat_rate(header_rate) if header_rate is not None else None
        vat_amount = Decimal("0.00")
        total_with_vat = total_without_vat

    return InternalInvoiceItemResponse(
        item_id=item.id,
        description=item.description,
        quantity=item.quantity,
        unit=None,
        unit_price_without_vat=unit_price,
        vat_rate=vat_rate,
        total_without_vat=total_without_vat,
        vat_amount=vat_amount,
        total_with_vat=total_with_vat,
        unit_price=unit_price,
    )


def _build_payment_response(payment) -> InternalInvoicePaymentResponse:
    return InternalInvoicePaymentResponse(
        payment_id=payment.id,
        amount=payment.amount,
        paid_at=payment.paid_at,
        payment_method=payment.payment_method,
        note=payment.note,
    )


def _find_execution_by_idempotency(
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


def _execution_status_response(
    db: Session,
    execution: AiAccountingExecution,
) -> InternalExecutionStatusResponse:
    invoice = get_invoice_detail(db, execution.invoice_id) if execution.invoice_id else None
    return InternalExecutionStatusResponse(
        execution_id=execution.execution_id,
        operation=execution.operation,
        status=execution.status,
        proposal_hash=execution.proposal_hash,
        invoice=_build_outgoing_document_response(invoice) if invoice is not None else None,
        error_code=execution.error_code,
    )


def _canonical_hash(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
