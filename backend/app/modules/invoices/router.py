"""API administrace pro faktury."""
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from backend.app.db import get_db
from backend.app.modules.admin.router import require_admin
from backend.app.modules.invoices.ares_service import (
    AresCompanyNotFoundError,
    AresUnavailableError,
    InvalidCompanyNameError,
    InvalidIcoError,
    resolve_ares_provider,
    UnsupportedAresProviderError,
    lookup_ares_company,
    search_ares_companies,
)
from backend.app.modules.invoices.email_service import InvoiceEmailConfigurationError, InvoiceEmailSendError
from backend.app.modules.invoices.pdf_service import InvoicePdfGenerationError
from backend.app.modules.invoices.schemas import (
    AresCompanyLookupResponse,
    FinalInvoiceCreateRequest,
    InvoiceCreate,
    InvoiceDefaultsResponse,
    InvoiceDetailResponse,
    InvoicePaymentCreate,
    InvoicePaymentResponse,
    InvoiceSettingsResponse,
    InvoiceSettingsUpdate,
    InvoiceSendEmailRequest,
    InvoiceSendEmailResponse,
    InvoiceSummaryResponse,
    InvoiceUpdate,
)
from backend.app.modules.invoices.service import (
    InvoiceNotFoundError,
    InvoicePaymentNotFoundError,
    InvoiceValidationError,
    add_invoice_payment,
    create_invoice,
    create_final_invoice_from_proformas,
    create_tax_document_from_proforma_payment,
    delete_invoice_payment,
    get_document_creation_defaults,
    generate_invoice_pdf,
    get_invoice_detail,
    get_invoice_settings,
    list_invoice_payments,
    list_invoices,
    save_invoice_settings,
    send_invoice_email,
    update_invoice,
)

router = APIRouter()


@router.get("/ares/search", response_model=list[AresCompanyLookupResponse])
def admin_search_companies_in_ares(
    name: str = Query(...),
    response: Response = None,
    _: None = Depends(require_admin),
):
    try:
        resolved_provider = resolve_ares_provider()
        if response is not None:
            response.headers["X-Ares-Provider"] = resolved_provider.mode
        return search_ares_companies(name, provider=resolved_provider.provider)
    except InvalidCompanyNameError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except UnsupportedAresProviderError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except AresUnavailableError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/ares/{ico}", response_model=AresCompanyLookupResponse)
def admin_lookup_company_in_ares(
    ico: str,
    response: Response = None,
    _: None = Depends(require_admin),
):
    try:
        resolved_provider = resolve_ares_provider()
        if response is not None:
            response.headers["X-Ares-Provider"] = resolved_provider.mode
        return lookup_ares_company(ico, provider=resolved_provider.provider)
    except InvalidIcoError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except AresCompanyNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except UnsupportedAresProviderError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except AresUnavailableError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("", response_model=InvoiceDetailResponse)
def admin_create_invoice(
    body: InvoiceCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return create_invoice(db, body)
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/defaults", response_model=InvoiceDefaultsResponse)
def admin_get_invoice_defaults(
    document_kind: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        defaults = get_document_creation_defaults(db, document_kind=document_kind)
        return {
            "document_kind": defaults.document_kind,
            "suggested_invoice_number": defaults.invoice_number,
            "suggested_variable_symbol": defaults.variable_symbol,
        }
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/settings", response_model=InvoiceSettingsResponse)
def admin_get_invoice_settings(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        settings = get_invoice_settings(db)
        return _build_settings_response(settings)
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/settings", response_model=InvoiceSettingsResponse)
def admin_update_invoice_settings(
    body: InvoiceSettingsUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        settings = save_invoice_settings(db, body)
        return _build_settings_response(settings)
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/final-invoice", response_model=InvoiceDetailResponse)
def admin_create_final_invoice(
    body: FinalInvoiceCreateRequest,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return create_final_invoice_from_proformas(db, body)
    except InvoiceNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Faktura nebyla nalezena.") from exc
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/{invoice_id}", response_model=InvoiceDetailResponse)
def admin_update_invoice(
    invoice_id: int,
    body: InvoiceUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return update_invoice(db, invoice_id, body)
    except InvoiceNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Faktura nebyla nalezena.") from exc
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("", response_model=list[InvoiceSummaryResponse])
def admin_list_invoices(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    return list_invoices(db)


@router.get("/{invoice_id}/payments", response_model=list[InvoicePaymentResponse])
def admin_list_invoice_payments(
    invoice_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return list_invoice_payments(db, invoice_id)
    except InvoiceNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Faktura nebyla nalezena.") from exc


@router.post("/{invoice_id}/payments", response_model=InvoiceDetailResponse)
def admin_add_invoice_payment(
    invoice_id: int,
    body: InvoicePaymentCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return add_invoice_payment(db, invoice_id, body)
    except InvoiceNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Faktura nebyla nalezena.") from exc
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{invoice_id}/payments/{payment_id}", response_model=InvoiceDetailResponse)
def admin_delete_invoice_payment(
    invoice_id: int,
    payment_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return delete_invoice_payment(db, invoice_id, payment_id)
    except InvoiceNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Faktura nebyla nalezena.") from exc
    except InvoicePaymentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{invoice_id}/payments/{payment_id}/tax-document", response_model=InvoiceDetailResponse)
def admin_create_tax_document_from_proforma_payment(
    invoice_id: int,
    payment_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return create_tax_document_from_proforma_payment(db, invoice_id, payment_id)
    except InvoiceNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Faktura nebyla nalezena.") from exc
    except InvoicePaymentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{invoice_id}/pdf")
def admin_get_invoice_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        pdf_document = generate_invoice_pdf(db, invoice_id)
        return Response(
            content=pdf_document.content,
            media_type=pdf_document.content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{pdf_document.filename}"',
            },
        )
    except InvoiceNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Faktura nebyla nalezena.") from exc
    except InvoicePdfGenerationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/{invoice_id}/send-email", response_model=InvoiceSendEmailResponse)
def admin_send_invoice_email(
    invoice_id: int,
    body: InvoiceSendEmailRequest | None = Body(default=None),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        payload = body or InvoiceSendEmailRequest()
        result = send_invoice_email(db, invoice_id, to_email=payload.to_email)
        return {
            "ok": True,
            "invoice_id": result.invoice_id,
            "invoice_number": result.invoice_number,
            "sent_to": result.sent_to,
            "copied_to": list(result.copied_to),
        }
    except InvoiceNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Faktura nebyla nalezena.") from exc
    except InvoicePdfGenerationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except InvoiceEmailConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except InvoiceEmailSendError as exc:
        detail = str(exc) or "Fakturu se nepodařilo odeslat e-mailem."
        status_code = 400 if "chybí e-mailová adresa příjemce" in detail.lower() else 502
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.get("/{invoice_id}", response_model=InvoiceDetailResponse)
def admin_get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return get_invoice_detail(db, invoice_id)
    except InvoiceNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Faktura nebyla nalezena.") from exc


def _build_settings_response(settings) -> dict:
    return {
        "owner_email": settings.owner_email,
        "issuer_name": settings.issuer_profile.company_name,
        "issuer_address": settings.issuer_profile.company_address,
        "issuer_city": settings.issuer_profile.company_city,
        "issuer_zip": settings.issuer_profile.company_zip,
        "issuer_ico": settings.issuer_profile.company_ico,
        "issuer_dic": settings.issuer_profile.company_dic,
        "issuer_data_box": settings.issuer_profile.company_data_box,
        "issuer_email": settings.issuer_profile.company_email,
        "issuer_phone": settings.issuer_profile.company_phone,
        "default_currency": settings.invoice_defaults.default_currency,
        "default_due_days": settings.invoice_defaults.default_due_days,
        "default_note": settings.invoice_defaults.default_note,
        "payment_method": settings.payment_profile.payment_method,
        "bank_account_number": settings.payment_profile.account_number,
        "bank_account_prefix": settings.payment_profile.account_prefix,
        "bank_code": settings.payment_profile.bank_code,
        "bank_iban": settings.payment_profile.iban,
        "account_label": settings.payment_profile.account_label,
    }
