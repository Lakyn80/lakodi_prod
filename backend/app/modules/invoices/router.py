"""API administrace pro faktury."""
from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from backend.app.db import get_db
from backend.app.modules.admin.router import require_admin
from backend.app.modules.invoices.accounting_exports import (
    AccountingExportError,
    ExpenseExportFilters,
    OutgoingExportFilters,
    build_expenses_csv_export,
    build_expenses_xlsx_export,
    build_outgoing_csv_export,
    build_outgoing_xlsx_export,
)
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
    CorrectionInvoiceCreateRequest,
    FinalInvoiceCreateRequest,
    InvoiceBankTransactionIgnoreResponse,
    InvoiceBankTransactionImportRequest,
    InvoiceBankTransactionImportResponse,
    InvoiceBankTransactionResponse,
    InvoiceCreate,
    InvoiceDocumentRelationResponse,
    InvoiceDefaultsResponse,
    InvoiceDetailResponse,
    InvoiceExpenseCreate,
    InvoiceExpenseDeleteResponse,
    InvoiceExpenseDetailResponse,
    InvoiceExpensePaymentCreate,
    InvoiceExpensePaymentResponse,
    InvoiceExpenseSummaryResponse,
    InvoiceExpenseUpdate,
    InvoicePaymentMatchResponse,
    InvoicePaymentCreate,
    InvoicePaymentResponse,
    InvoiceRelationsSummaryResponse,
    InvoiceSupplierCreate,
    InvoiceSupplierDeleteResponse,
    InvoiceSupplierResponse,
    InvoiceSupplierUpdate,
    InvoiceTodoCreate,
    InvoiceTodoDeleteResponse,
    InvoiceTodoGenerateResponse,
    InvoiceTodoResponse,
    InvoiceTodoUpdate,
    InvoiceSubjectCreate,
    InvoiceSubjectDeleteResponse,
    InvoiceSubjectResponse,
    InvoiceSubjectUpdate,
    InvoiceSettingsResponse,
    InvoiceSettingsUpdate,
    InvoiceSendEmailRequest,
    InvoiceSendEmailResponse,
    InvoiceSummaryResponse,
    InvoiceUpdate,
    QuoteConvertRequest,
)
from backend.app.modules.invoices.service import (
    InvoiceBankTransactionNotFoundError,
    InvoiceExpenseNotFoundError,
    InvoiceExpensePaymentNotFoundError,
    InvoiceNotFoundError,
    InvoicePaymentMatchNotFoundError,
    InvoicePaymentNotFoundError,
    InvoiceSupplierNotFoundError,
    InvoiceSubjectNotFoundError,
    InvoiceTodoNotFoundError,
    InvoiceValidationError,
    apply_invoice_payment_match,
    add_invoice_expense_payment,
    add_invoice_payment,
    cancel_invoice_todo,
    complete_invoice_todo,
    convert_quote_to_document,
    create_invoice_expense,
    create_invoice_supplier,
    create_invoice_subject,
    create_invoice_todo,
    create_correction_from_invoice,
    create_invoice,
    create_final_invoice_from_proformas,
    create_tax_document_from_proforma_payment,
    delete_invoice_expense,
    delete_invoice_expense_payment,
    delete_invoice_supplier,
    delete_invoice_subject,
    delete_invoice_payment,
    delete_invoice_todo,
    generate_invoice_payment_matches,
    generate_invoice_todos,
    get_document_creation_defaults,
    get_invoice_bank_transaction_detail,
    get_invoice_expense_detail,
    generate_invoice_pdf,
    get_invoice_detail,
    get_invoice_relations_summary,
    get_invoice_settings,
    get_invoice_supplier_detail,
    get_invoice_subject_detail,
    get_invoice_todo_detail,
    ignore_invoice_bank_transaction,
    import_invoice_bank_transactions,
    list_invoice_bank_transactions,
    list_invoice_document_relations,
    list_invoice_expense_payments,
    list_invoice_expenses,
    list_invoice_suppliers,
    list_invoice_subjects,
    list_invoice_payments,
    list_invoice_todos,
    list_invoices,
    save_invoice_settings,
    send_invoice_email,
    reject_invoice_payment_match,
    list_invoice_payment_matches,
    update_invoice_expense,
    update_invoice_supplier,
    update_invoice_subject,
    update_invoice_todo,
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


@router.get("/exports/outgoing.csv")
def admin_export_outgoing_csv(
    document_kind: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    status: str | None = Query(default=None),
    customer_query: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    filters = _build_outgoing_export_filters(
        document_kind=document_kind,
        date_from=date_from,
        date_to=date_to,
        status=status,
        customer_query=customer_query,
    )
    content = build_outgoing_csv_export(db, filters)
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="lakodi_outgoing_documents.csv"'},
    )


@router.get("/exports/outgoing.xlsx")
def admin_export_outgoing_xlsx(
    document_kind: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    status: str | None = Query(default=None),
    customer_query: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    filters = _build_outgoing_export_filters(
        document_kind=document_kind,
        date_from=date_from,
        date_to=date_to,
        status=status,
        customer_query=customer_query,
    )
    try:
        content = build_outgoing_xlsx_export(db, filters)
    except AccountingExportError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="lakodi_outgoing_documents.xlsx"'},
    )


@router.get("/exports/expenses.csv")
def admin_export_expenses_csv(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    status: str | None = Query(default=None),
    supplier_query: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    filters = _build_expense_export_filters(
        date_from=date_from,
        date_to=date_to,
        status=status,
        supplier_query=supplier_query,
    )
    content = build_expenses_csv_export(db, filters)
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="lakodi_expenses.csv"'},
    )


@router.get("/exports/expenses.xlsx")
def admin_export_expenses_xlsx(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    status: str | None = Query(default=None),
    supplier_query: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    filters = _build_expense_export_filters(
        date_from=date_from,
        date_to=date_to,
        status=status,
        supplier_query=supplier_query,
    )
    try:
        content = build_expenses_xlsx_export(db, filters)
    except AccountingExportError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="lakodi_expenses.xlsx"'},
    )


@router.get("/todos", response_model=list[InvoiceTodoResponse])
def admin_list_invoice_todos(
    status: str | None = Query(default=None),
    todo_type: str | None = Query(default=None),
    invoice_id: int | None = Query(default=None),
    expense_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return list_invoice_todos(
            db,
            status=status,
            todo_type=todo_type,
            invoice_id=invoice_id,
            expense_id=expense_id,
        )
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/todos", response_model=InvoiceTodoResponse)
def admin_create_invoice_todo(
    body: InvoiceTodoCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return create_invoice_todo(db, body)
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/todos/generate", response_model=InvoiceTodoGenerateResponse)
def admin_generate_invoice_todos(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    result = generate_invoice_todos(db)
    return {
        "ok": True,
        "generated_count": len(result.generated_ids),
        "skipped_existing_count": result.skipped_existing_count,
        "generated_ids": result.generated_ids,
    }


@router.get("/relations", response_model=list[InvoiceDocumentRelationResponse])
def admin_list_invoice_relations(
    relation_type: str | None = Query(default=None),
    source_invoice_id: int | None = Query(default=None),
    target_invoice_id: int | None = Query(default=None),
    source_payment_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return list_invoice_document_relations(
            db,
            relation_type=relation_type,
            source_invoice_id=source_invoice_id,
            target_invoice_id=target_invoice_id,
            source_payment_id=source_payment_id,
        )
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/todos/{todo_id}", response_model=InvoiceTodoResponse)
def admin_get_invoice_todo(
    todo_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return get_invoice_todo_detail(db, todo_id)
    except InvoiceTodoNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/todos/{todo_id}", response_model=InvoiceTodoResponse)
def admin_update_invoice_todo(
    todo_id: int,
    body: InvoiceTodoUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return update_invoice_todo(db, todo_id, body)
    except InvoiceTodoNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/todos/{todo_id}/complete", response_model=InvoiceTodoResponse)
def admin_complete_invoice_todo(
    todo_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return complete_invoice_todo(db, todo_id)
    except InvoiceTodoNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/todos/{todo_id}/cancel", response_model=InvoiceTodoResponse)
def admin_cancel_invoice_todo(
    todo_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return cancel_invoice_todo(db, todo_id)
    except InvoiceTodoNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/todos/{todo_id}", response_model=InvoiceTodoDeleteResponse)
def admin_delete_invoice_todo(
    todo_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        deleted_todo_id = delete_invoice_todo(db, todo_id)
        return {"ok": True, "todo_id": deleted_todo_id}
    except InvoiceTodoNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/subjects", response_model=list[InvoiceSubjectResponse])
def admin_list_invoice_subjects(
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    return list_invoice_subjects(db, search=search)


@router.post("/subjects", response_model=InvoiceSubjectResponse)
def admin_create_invoice_subject(
    body: InvoiceSubjectCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return create_invoice_subject(db, body)
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/subjects/{subject_id}", response_model=InvoiceSubjectResponse)
def admin_get_invoice_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return get_invoice_subject_detail(db, subject_id)
    except InvoiceSubjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/subjects/{subject_id}", response_model=InvoiceSubjectResponse)
def admin_update_invoice_subject(
    subject_id: int,
    body: InvoiceSubjectUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return update_invoice_subject(db, subject_id, body)
    except InvoiceSubjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/subjects/{subject_id}", response_model=InvoiceSubjectDeleteResponse)
def admin_delete_invoice_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        deleted_subject_id = delete_invoice_subject(db, subject_id)
        return {"ok": True, "subject_id": deleted_subject_id}
    except InvoiceSubjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/suppliers", response_model=list[InvoiceSupplierResponse])
def admin_list_invoice_suppliers(
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    return list_invoice_suppliers(db, search=search)


@router.post("/suppliers", response_model=InvoiceSupplierResponse)
def admin_create_invoice_supplier(
    body: InvoiceSupplierCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return create_invoice_supplier(db, body)
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/suppliers/{supplier_id}", response_model=InvoiceSupplierResponse)
def admin_get_invoice_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return get_invoice_supplier_detail(db, supplier_id)
    except InvoiceSupplierNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/suppliers/{supplier_id}", response_model=InvoiceSupplierResponse)
def admin_update_invoice_supplier(
    supplier_id: int,
    body: InvoiceSupplierUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return update_invoice_supplier(db, supplier_id, body)
    except InvoiceSupplierNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/suppliers/{supplier_id}", response_model=InvoiceSupplierDeleteResponse)
def admin_delete_invoice_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        deleted_supplier_id = delete_invoice_supplier(db, supplier_id)
        return {"ok": True, "supplier_id": deleted_supplier_id}
    except InvoiceSupplierNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/bank-transactions", response_model=list[InvoiceBankTransactionResponse])
def admin_list_invoice_bank_transactions(
    status: str | None = Query(default=None),
    direction: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return list_invoice_bank_transactions(db, status=status, direction=direction)
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/bank-transactions/import", response_model=InvoiceBankTransactionImportResponse)
def admin_import_invoice_bank_transactions(
    body: InvoiceBankTransactionImportRequest,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        result = import_invoice_bank_transactions(db, body)
        return {
            "imported_count": result.imported_count,
            "skipped_duplicate_count": result.skipped_duplicate_count,
            "imported_transaction_ids": result.imported_transaction_ids,
            "skipped_duplicate_identifiers": result.skipped_duplicate_identifiers,
        }
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/bank-transactions/{transaction_id}", response_model=InvoiceBankTransactionResponse)
def admin_get_invoice_bank_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return get_invoice_bank_transaction_detail(db, transaction_id)
    except InvoiceBankTransactionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/bank-transactions/{transaction_id}/ignore", response_model=InvoiceBankTransactionIgnoreResponse)
def admin_ignore_invoice_bank_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        transaction = ignore_invoice_bank_transaction(db, transaction_id)
        return {"ok": True, "transaction_id": transaction.id, "status": transaction.status}
    except InvoiceBankTransactionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/bank-transactions/{transaction_id}/matches", response_model=list[InvoicePaymentMatchResponse])
def admin_list_invoice_bank_transaction_matches(
    transaction_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return list_invoice_payment_matches(db, transaction_id)
    except InvoiceBankTransactionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/bank-transactions/{transaction_id}/matches/generate", response_model=list[InvoicePaymentMatchResponse])
def admin_generate_invoice_bank_transaction_matches(
    transaction_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return generate_invoice_payment_matches(db, transaction_id)
    except InvoiceBankTransactionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/bank-transactions/{transaction_id}/matches/{match_id}/apply",
    response_model=InvoicePaymentMatchResponse,
)
def admin_apply_invoice_bank_transaction_match(
    transaction_id: int,
    match_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return apply_invoice_payment_match(db, transaction_id, match_id)
    except (InvoiceBankTransactionNotFoundError, InvoicePaymentMatchNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (InvoiceValidationError, InvoiceNotFoundError, InvoiceExpenseNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/bank-transactions/{transaction_id}/matches/{match_id}/reject",
    response_model=InvoicePaymentMatchResponse,
)
def admin_reject_invoice_bank_transaction_match(
    transaction_id: int,
    match_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return reject_invoice_payment_match(db, transaction_id, match_id)
    except (InvoiceBankTransactionNotFoundError, InvoicePaymentMatchNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/expenses", response_model=list[InvoiceExpenseSummaryResponse])
def admin_list_invoice_expenses(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    return list_invoice_expenses(db)


@router.post("/expenses", response_model=InvoiceExpenseDetailResponse)
def admin_create_invoice_expense(
    body: InvoiceExpenseCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return create_invoice_expense(db, body)
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/expenses/{expense_id}", response_model=InvoiceExpenseDetailResponse)
def admin_get_invoice_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return get_invoice_expense_detail(db, expense_id)
    except InvoiceExpenseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/expenses/{expense_id}", response_model=InvoiceExpenseDetailResponse)
def admin_update_invoice_expense(
    expense_id: int,
    body: InvoiceExpenseUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return update_invoice_expense(db, expense_id, body)
    except InvoiceExpenseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/expenses/{expense_id}", response_model=InvoiceExpenseDeleteResponse)
def admin_delete_invoice_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        deleted_expense_id = delete_invoice_expense(db, expense_id)
        return {"ok": True, "expense_id": deleted_expense_id}
    except InvoiceExpenseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/expenses/{expense_id}/payments", response_model=list[InvoiceExpensePaymentResponse])
def admin_list_invoice_expense_payments(
    expense_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return list_invoice_expense_payments(db, expense_id)
    except InvoiceExpenseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/expenses/{expense_id}/payments", response_model=InvoiceExpenseDetailResponse)
def admin_add_invoice_expense_payment(
    expense_id: int,
    body: InvoiceExpensePaymentCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return add_invoice_expense_payment(db, expense_id, body)
    except InvoiceExpenseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/expenses/{expense_id}/payments/{payment_id}", response_model=InvoiceExpenseDetailResponse)
def admin_delete_invoice_expense_payment(
    expense_id: int,
    payment_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return delete_invoice_expense_payment(db, expense_id, payment_id)
    except InvoiceExpenseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvoiceExpensePaymentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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


@router.post("/{quote_id}/convert", response_model=InvoiceDetailResponse)
def admin_convert_quote(
    quote_id: int,
    body: QuoteConvertRequest,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return convert_quote_to_document(db, quote_id, body)
    except InvoiceNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Faktura nebyla nalezena.") from exc
    except InvoiceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{invoice_id}/correction", response_model=InvoiceDetailResponse)
def admin_create_correction_invoice(
    invoice_id: int,
    body: CorrectionInvoiceCreateRequest | None = Body(default=None),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        payload = body or CorrectionInvoiceCreateRequest()
        return create_correction_from_invoice(db, invoice_id, payload)
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


@router.get("/{invoice_id}/relations", response_model=InvoiceRelationsSummaryResponse)
def admin_get_invoice_relations(
    invoice_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    try:
        return get_invoice_relations_summary(db, invoice_id)
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


def _parse_optional_date(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _build_outgoing_export_filters(
    *,
    document_kind: str | None,
    date_from: str | None,
    date_to: str | None,
    status: str | None,
    customer_query: str | None,
) -> OutgoingExportFilters:
    try:
        parsed_date_from = date.fromisoformat(_parse_optional_date(date_from)) if _parse_optional_date(date_from) else None
        parsed_date_to = date.fromisoformat(_parse_optional_date(date_to)) if _parse_optional_date(date_to) else None
        if parsed_date_from is not None and parsed_date_to is not None and parsed_date_to < parsed_date_from:
            raise HTTPException(status_code=400, detail="date_to nemůže být dříve než date_from.")
        return OutgoingExportFilters(
            document_kind=document_kind.strip() if document_kind and document_kind.strip() else None,
            date_from=parsed_date_from,
            date_to=parsed_date_to,
            status=status.strip() if status and status.strip() else None,
            customer_query=customer_query.strip() if customer_query and customer_query.strip() else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Neplatný formát data. Použijte YYYY-MM-DD.") from exc


def _build_expense_export_filters(
    *,
    date_from: str | None,
    date_to: str | None,
    status: str | None,
    supplier_query: str | None,
) -> ExpenseExportFilters:
    try:
        parsed_date_from = date.fromisoformat(_parse_optional_date(date_from)) if _parse_optional_date(date_from) else None
        parsed_date_to = date.fromisoformat(_parse_optional_date(date_to)) if _parse_optional_date(date_to) else None
        if parsed_date_from is not None and parsed_date_to is not None and parsed_date_to < parsed_date_from:
            raise HTTPException(status_code=400, detail="date_to nemůže být dříve než date_from.")
        return ExpenseExportFilters(
            date_from=parsed_date_from,
            date_to=parsed_date_to,
            status=status.strip() if status and status.strip() else None,
            supplier_query=supplier_query.strip() if supplier_query and supplier_query.strip() else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Neplatný formát data. Použijte YYYY-MM-DD.") from exc
