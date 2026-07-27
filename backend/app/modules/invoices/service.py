"""Aplikační logika pro faktury."""
import hashlib
import json
import logging
from calendar import monthrange
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from fastapi import UploadFile

from backend.app.modules.invoices.attachment_storage import (
    InvoiceAttachmentStorageError,
    attachment_file_exists,
    delete_invoice_attachment_file,
    get_invoice_attachment_path,
    store_invoice_attachment_file,
)
from backend.app.modules.invoices.document_types import (
    DEFAULT_DOCUMENT_KIND,
    get_document_kind_metadata,
    normalize_document_kind,
)
from backend.app.modules.invoices.cache_service import get_invoice_cache_service
from backend.app.modules.invoices.email_service import (
    InvoiceEmailConfigurationError,
    InvoiceEmailDeliveryResult,
    InvoiceEmailSendError,
    deliver_invoice_email,
    deliver_invoice_reminder_email,
)
from backend.app.modules.invoices.exporters import build_invoice_export
from backend.app.modules.invoices.models import (
    RELATION_TYPE_CORRECTION_FOR_INVOICE,
    RELATION_TYPE_FINAL_INVOICE_FOR_PROFORMA,
    RELATION_TYPE_INVOICE_FROM_QUOTE,
    RELATION_TYPE_PROFORMA_FROM_QUOTE,
    RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT,
    Invoice,
    InvoiceBankTransaction,
    InvoiceDocumentRelation,
    InvoiceExpense,
    InvoiceExpenseItem,
    InvoiceExpensePayment,
    InvoiceAttachment,
    InvoiceAccountingEvent,
    InvoiceItem,
    InvoicePayment,
    InvoicePaymentMatch,
    InvoiceReminderEmail,
    InvoiceRecurringGeneration,
    InvoiceRecurringTemplate,
    InvoiceRecurringTemplateItem,
    InvoiceSequenceState,
    InvoiceSupplier,
    InvoiceSubject,
    InvoiceTodo,
)
from backend.app.modules.invoices.numbering_service import (
    DEFAULT_PADDING,
    MAX_SEQUENCE_DIGITS,
    InvoiceNumberingError,
    InvoiceSequencePreview,
    get_document_sequence_preview,
    get_invoice_sequence_preview,
    normalize_invoice_number,
    reserve_invoice_sequence,
    resolve_invoice_sequence_for_update,
)
from backend.app.modules.invoices.payment_service import (
    InvoicePaymentError,
    PaymentProfile,
    InvoicePaymentSettingsProfile,
    IssuerProfile,
    build_czech_iban,
    get_invoice_settings_profile,
    update_invoice_settings_profile,
)
from backend.app.modules.invoices.pdf_service import InvoicePdfDocument, build_invoice_pdf_document
from backend.app.modules.invoices.schemas import (
    CorrectionInvoiceCreateRequest,
    FinalInvoiceCreateRequest,
    InvoiceBankTransactionImportItem,
    InvoiceBankTransactionImportRequest,
    InvoiceBankTransactionRecordInvoicePaymentRequest,
    InvoiceBankTransactionRecordInvoicePaymentResponse,
    InvoiceCreate,
    InvoiceDocumentRelationResponse,
    InvoiceExpenseCreate,
    InvoiceExpensePaymentCreate,
    InvoiceExpenseUpdate,
    InvoicePaymentMatchListItemResponse,
    InvoicePaymentMatchBankTransactionSummary,
    InvoicePaymentMatchCandidateSummary,
    InvoiceRelationDocumentSummaryResponse,
    InvoiceRelationPaymentSummaryResponse,
    InvoiceRelationsSummaryResponse,
    InvoicePaymentCreate,
    InvoiceAttachmentLinkRequest,
    InvoiceAccountingEventResponse,
    InvoiceRecurringTemplateCreate,
    InvoiceRecurringTemplateUpdate,
    InvoiceSupplierCreate,
    InvoiceSupplierUpdate,
    InvoiceSubjectCreate,
    InvoiceSubjectUpdate,
    InvoiceTodoCreate,
    InvoiceTodoUpdate,
    InvoiceSettingsUpdate,
    InvoiceUpdate,
    QuoteConvertRequest,
)

TWOPLACES = Decimal("0.01")
THREEPLACES = Decimal("0.001")
DEFAULT_STATUS = "draft"
STORED_INVOICE_STATUSES = {"draft", "issued", "cancelled"}
DEFAULT_EXPENSE_STATUS = "open"
STORED_EXPENSE_STATUSES = {"open", "cancelled"}
DEFAULT_TODO_STATUS = "open"
STORED_TODO_STATUSES = {"open", "completed", "cancelled"}
DEFAULT_BANK_TRANSACTION_STATUS = "imported"
STORED_BANK_TRANSACTION_STATUSES = {"imported", "matched", "ignored"}
STORED_BANK_TRANSACTION_DIRECTIONS = {"incoming", "outgoing"}
DEFAULT_PAYMENT_MATCH_STATUS = "suggested"
STORED_PAYMENT_MATCH_STATUSES = {"suggested", "applied", "rejected"}
SUPPORTED_PAYMENT_MATCH_TYPES = {"variable_symbol_amount", "variable_symbol_only", "amount_only", "manual"}
DEFAULT_RECURRING_TEMPLATE_STATUS = "active"
STORED_RECURRING_TEMPLATE_STATUSES = {"active", "paused", "cancelled"}
STORED_RECURRING_TEMPLATE_TYPES = {"invoice", "expense"}
STORED_RECURRING_INTERVALS = {"daily", "weekly", "monthly", "quarterly", "yearly"}
DEFAULT_RECURRING_GENERATION_STATUS = "generated"
STORED_RECURRING_GENERATION_STATUSES = {"generated", "failed"}
DEFAULT_RECURRING_EXPENSE_DUE_DAYS = 14
DEFAULT_REMINDER_EMAIL_STATUS = "prepared"
STORED_REMINDER_EMAIL_STATUSES = {"prepared", "sent", "failed"}
STORED_REMINDER_TYPES = {"invoice_overdue", "invoice_payment_reminder", "manual"}
DEFAULT_ATTACHMENT_STATUS = "uploaded"
STORED_ATTACHMENT_STATUSES = {"uploaded", "linked", "archived"}
STORED_ATTACHMENT_TYPES = {
    "invoice_document",
    "expense_document",
    "todo_note",
    "bank_transaction",
    "payment_proof",
    "other",
}
STORED_ACCOUNTING_EVENT_SOURCES = {
    "admin_api",
    "system",
    "import",
    "generation",
    "email",
    "bank_matching",
    "ai_accounting",
}
AUTO_INVOICE_TODO_TYPES = {"invoice_overdue", "invoice_payment_reminder"}
AUTO_EXPENSE_TODO_TYPES = {"expense_due", "expense_overdue"}
SUPPORTED_RELATION_TYPES = {
    RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT,
    RELATION_TYPE_FINAL_INVOICE_FOR_PROFORMA,
    RELATION_TYPE_CORRECTION_FOR_INVOICE,
    RELATION_TYPE_INVOICE_FROM_QUOTE,
    RELATION_TYPE_PROFORMA_FROM_QUOTE,
}
EXPENSE_SEQUENCE_KEY = "expense"
LOGGER = logging.getLogger(__name__)


class InvoiceValidationError(ValueError):
    """Neplatná data faktury."""


class InvoiceNotFoundError(LookupError):
    """Faktura neexistuje."""


class InvoicePaymentNotFoundError(LookupError):
    """Platba faktury neexistuje."""


class InvoiceExpenseNotFoundError(LookupError):
    """Přijatý doklad neexistuje."""


class InvoiceExpensePaymentNotFoundError(LookupError):
    """Platba přijatého dokladu neexistuje."""


class InvoiceSubjectNotFoundError(LookupError):
    """Subjekt faktury neexistuje."""


class InvoiceSupplierNotFoundError(LookupError):
    """Dodavatel neexistuje."""


class InvoiceBankTransactionNotFoundError(LookupError):
    """Bankovní transakce neexistuje."""


class InvoicePaymentMatchNotFoundError(LookupError):
    """Návrh párování neexistuje."""


class InvoiceRecurringTemplateNotFoundError(LookupError):
    """Recurring šablona neexistuje."""


class InvoiceTodoNotFoundError(LookupError):
    """Todo nebylo nalezeno."""


class InvoiceAttachmentNotFoundError(LookupError):
    """Příloha nebyla nalezena."""


@dataclass(frozen=True)
class ReverseChargeTexts:
    reason: str
    text: str


@dataclass(frozen=True)
class InvoiceTodoGenerationResult:
    generated_ids: list[int]
    skipped_existing_count: int


@dataclass(frozen=True)
class ImportBankTransactionsResult:
    imported_count: int
    skipped_duplicate_count: int
    imported_transaction_ids: list[int]
    skipped_duplicate_identifiers: list[str]


@dataclass(frozen=True)
class RecurringGenerationResult:
    template: InvoiceRecurringTemplate
    generation: InvoiceRecurringGeneration


@dataclass(frozen=True)
class InvoiceReminderPreview:
    invoice: Invoice
    todo_id: int | None
    reminder_type: str
    recipient_email: str
    subject: str
    message: str


@dataclass(frozen=True)
class InvoiceReminderSendResult:
    reminder_email: InvoiceReminderEmail
    delivery: InvoiceEmailDeliveryResult


@dataclass(frozen=True)
class InvoiceAttachmentDownload:
    attachment: InvoiceAttachment
    file_path: Path

REVERSE_CHARGE_RULES: dict[str, ReverseChargeTexts] = {
    "reverse_charge": ReverseChargeTexts(
        reason="reverse_charge",
        text="Daň odvede zákazník v režimu přenesené daňové povinnosti.",
    )
}


def list_invoices(db: Session) -> list[Invoice]:
    invoices = (
        db.query(Invoice)
        .options(selectinload(Invoice.payments), selectinload(Invoice.subject))
        .order_by(Invoice.id.desc())
        .all()
    )
    return [_attach_invoice_runtime_state(invoice) for invoice in invoices]


def get_invoice_detail(db: Session, invoice_id: int) -> Invoice:
    invoice = _get_invoice_or_raise(db, invoice_id, include_items=True)
    return _attach_invoice_runtime_state(invoice)


def list_invoice_payments(db: Session, invoice_id: int) -> list[InvoicePayment]:
    invoice = get_invoice_detail(db, invoice_id)
    return list(invoice.payments)


@dataclass(frozen=True)
class OutgoingInvoiceFilters:
    query: str | None = None
    customer_query: str | None = None
    invoice_number: str | None = None
    status: str | None = None
    payment_status: str | None = None
    currency: str | None = None
    issue_date_from: date | None = None
    issue_date_to: date | None = None
    due_date_from: date | None = None
    due_date_to: date | None = None
    paid_date_from: date | None = None
    paid_date_to: date | None = None


@dataclass(frozen=True)
class OutgoingInvoicePage:
    items: list[Invoice]
    total_count: int
    limit: int
    offset: int
    sort: str


@dataclass(frozen=True)
class OutgoingInvoiceCurrencySummary:
    currency: str
    document_count: int
    invoiced_without_vat: Decimal
    vat: Decimal
    invoiced_with_vat: Decimal
    received_payments: Decimal
    outstanding_amount: Decimal


@dataclass(frozen=True)
class OutgoingInvoiceSummary:
    filters: OutgoingInvoiceFilters
    currencies: list[OutgoingInvoiceCurrencySummary]
    document_count: int


@dataclass(frozen=True)
class CustomerAccountingSummary:
    customer_query: str
    ambiguous: bool
    customer_matches: list[str]
    summary: OutgoingInvoiceSummary | None


@dataclass(frozen=True)
class InvoiceValidationPreview:
    subject_id: int | None
    subject_name: str
    currency: str
    subtotal: Decimal
    vat_rate: Decimal | None
    vat_amount: Decimal
    total: Decimal
    item_count: int


def search_outgoing_documents(
    db: Session,
    *,
    filters: OutgoingInvoiceFilters,
    limit: int,
    offset: int,
    sort: str,
) -> OutgoingInvoicePage:
    if not _normalize_optional_search_text(filters.query):
        raise InvoiceValidationError("Vyhledavaci dotaz je povinny.")
    return list_outgoing_documents(
        db,
        filters=filters,
        limit=limit,
        offset=offset,
        sort=sort,
    )


def list_outgoing_documents(
    db: Session,
    *,
    filters: OutgoingInvoiceFilters,
    limit: int,
    offset: int,
    sort: str,
) -> OutgoingInvoicePage:
    _validate_invoice_filters(filters)
    bounded_limit = _bounded_ai_limit(limit)
    bounded_offset = _bounded_ai_offset(offset)
    normalized_sort = _normalize_ai_invoice_sort(sort)
    invoices = _load_filtered_outgoing_invoices(db, filters=filters)
    invoices = _sort_outgoing_invoices(invoices, normalized_sort)
    return OutgoingInvoicePage(
        items=invoices[bounded_offset : bounded_offset + bounded_limit],
        total_count=len(invoices),
        limit=bounded_limit,
        offset=bounded_offset,
        sort=normalized_sort,
    )


def get_outgoing_documents_summary(
    db: Session,
    *,
    filters: OutgoingInvoiceFilters,
) -> OutgoingInvoiceSummary:
    _validate_invoice_filters(filters)
    invoices = _load_filtered_outgoing_invoices(db, filters=filters)
    return _build_outgoing_invoice_summary(filters=filters, invoices=invoices)


def get_customer_accounting_summary(
    db: Session,
    *,
    customer_query: str,
    date_from: date | None = None,
    date_to: date | None = None,
) -> CustomerAccountingSummary:
    normalized_customer_query = _normalize_optional_search_text(customer_query)
    if not normalized_customer_query:
        raise InvoiceValidationError("Dotaz na zakaznika je povinny.")
    filters = OutgoingInvoiceFilters(
        customer_query=normalized_customer_query,
        issue_date_from=date_from,
        issue_date_to=date_to,
    )
    _validate_invoice_filters(filters)
    invoices = _load_filtered_outgoing_invoices(db, filters=filters)
    customer_matches = sorted({invoice.customer_name for invoice in invoices if invoice.customer_name})
    ambiguous = len(customer_matches) > 1
    return CustomerAccountingSummary(
        customer_query=normalized_customer_query,
        ambiguous=ambiguous,
        customer_matches=customer_matches[:10],
        summary=None if ambiguous else _build_outgoing_invoice_summary(filters=filters, invoices=invoices),
    )


def get_monthly_accounting_summary(
    db: Session,
    *,
    year: int,
    month: int,
) -> OutgoingInvoiceSummary:
    if year < 2000 or year > 2100:
        raise InvoiceValidationError("Rok musi byt v rozsahu 2000 az 2100.")
    if month < 1 or month > 12:
        raise InvoiceValidationError("Mesic musi byt v rozsahu 1 az 12.")
    month_start = date(year, month, 1)
    month_end = date(year, month, monthrange(year, month)[1])
    filters = OutgoingInvoiceFilters(issue_date_from=month_start, issue_date_to=month_end)
    invoices = _load_filtered_outgoing_invoices(db, filters=filters)
    return _build_outgoing_invoice_summary(filters=filters, invoices=invoices)


def list_invoice_outgoing_relations(db: Session, invoice_id: int) -> list[InvoiceDocumentRelationResponse]:
    relations = (
        db.query(InvoiceDocumentRelation)
        .filter(InvoiceDocumentRelation.source_invoice_id == invoice_id)
        .order_by(InvoiceDocumentRelation.created_at.asc(), InvoiceDocumentRelation.id.asc())
        .all()
    )
    return _build_relation_views(db, relations)


def list_invoice_incoming_relations(db: Session, invoice_id: int) -> list[InvoiceDocumentRelationResponse]:
    relations = (
        db.query(InvoiceDocumentRelation)
        .filter(InvoiceDocumentRelation.target_invoice_id == invoice_id)
        .order_by(InvoiceDocumentRelation.created_at.asc(), InvoiceDocumentRelation.id.asc())
        .all()
    )
    return _build_relation_views(db, relations)


def get_invoice_relations_summary(db: Session, invoice_id: int) -> InvoiceRelationsSummaryResponse:
    _get_invoice_or_raise(db, invoice_id, include_payments=False, include_subject=False)
    outgoing_relations = list_invoice_outgoing_relations(db, invoice_id)
    incoming_relations = list_invoice_incoming_relations(db, invoice_id)
    relation_map = {relation.id: relation for relation in [*outgoing_relations, *incoming_relations]}
    all_relations = sorted(relation_map.values(), key=lambda relation: (relation.created_at, relation.id))
    return InvoiceRelationsSummaryResponse(
        invoice_id=invoice_id,
        outgoing_relations=outgoing_relations,
        incoming_relations=incoming_relations,
        all_relations=all_relations,
    )


def list_invoice_document_relations(
    db: Session,
    *,
    relation_type: str | None = None,
    source_invoice_id: int | None = None,
    target_invoice_id: int | None = None,
    source_payment_id: int | None = None,
) -> list[InvoiceDocumentRelationResponse]:
    normalized_relation_type = _normalize_relation_type_filter(relation_type, allow_none=True)
    query = db.query(InvoiceDocumentRelation)
    if normalized_relation_type is not None:
        query = query.filter(InvoiceDocumentRelation.relation_type == normalized_relation_type)
    if source_invoice_id is not None:
        query = query.filter(InvoiceDocumentRelation.source_invoice_id == source_invoice_id)
    if target_invoice_id is not None:
        query = query.filter(InvoiceDocumentRelation.target_invoice_id == target_invoice_id)
    if source_payment_id is not None:
        query = query.filter(InvoiceDocumentRelation.source_payment_id == source_payment_id)
    relations = query.order_by(InvoiceDocumentRelation.created_at.asc(), InvoiceDocumentRelation.id.asc()).all()
    return _build_relation_views(db, relations)


def get_invoice_creation_defaults(db: Session) -> InvoiceSequencePreview:
    try:
        return get_invoice_sequence_preview(db)
    except InvoiceNumberingError as exc:
        raise InvoiceValidationError(str(exc)) from exc


def get_document_creation_defaults(db: Session, document_kind: str | None = None) -> InvoiceSequencePreview:
    normalized_document_kind = normalize_document_kind(document_kind)
    try:
        if normalized_document_kind == DEFAULT_DOCUMENT_KIND:
            return get_invoice_sequence_preview(db)
        return get_document_sequence_preview(db, document_kind=normalized_document_kind)
    except (InvoiceNumberingError, ValueError) as exc:
        raise InvoiceValidationError(str(exc)) from exc


def get_invoice_settings(db: Session) -> InvoicePaymentSettingsProfile:
    try:
        return get_invoice_settings_profile(db)
    except InvoicePaymentError as exc:
        raise InvoiceValidationError(str(exc)) from exc


def save_invoice_settings(db: Session, payload: InvoiceSettingsUpdate) -> InvoicePaymentSettingsProfile:
    try:
        return update_invoice_settings_profile(
            db,
            owner_email=payload.owner_email,
            payment_method=payload.payment_method,
            account_number=payload.bank_account_number,
            account_prefix=payload.bank_account_prefix,
            bank_code=payload.bank_code,
            iban=payload.bank_iban,
            issuer_name=payload.issuer_name,
            issuer_address=payload.issuer_address,
            issuer_city=payload.issuer_city,
            issuer_zip=payload.issuer_zip,
            issuer_ico=payload.issuer_ico,
            issuer_dic=payload.issuer_dic,
            issuer_data_box=payload.issuer_data_box,
            issuer_email=payload.issuer_email,
            issuer_phone=payload.issuer_phone,
            default_currency=payload.default_currency,
            default_due_days=payload.default_due_days,
            default_note=payload.default_note,
        )
    except InvoicePaymentError as exc:
        db.rollback()
        raise InvoiceValidationError(str(exc)) from exc


def list_invoice_subjects(db: Session, search: str | None = None) -> list[InvoiceSubject]:
    query = db.query(InvoiceSubject)
    if search:
        cleaned = search.strip()
        if cleaned:
            pattern = f"%{cleaned}%"
            query = query.filter(
                or_(
                    InvoiceSubject.name.ilike(pattern),
                    InvoiceSubject.email.ilike(pattern),
                    InvoiceSubject.ico.ilike(pattern),
                    InvoiceSubject.dic.ilike(pattern),
                )
            )
    return query.order_by(InvoiceSubject.id.desc()).all()


def get_invoice_subject_detail(db: Session, subject_id: int) -> InvoiceSubject:
    subject = db.query(InvoiceSubject).filter(InvoiceSubject.id == subject_id).first()
    if subject is None:
        raise InvoiceSubjectNotFoundError("Subjekt nebyl nalezen.")
    return subject


def create_invoice_subject(db: Session, payload: InvoiceSubjectCreate) -> InvoiceSubject:
    subject = InvoiceSubject(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
        ico=payload.ico,
        dic=payload.dic,
        data_box=payload.data_box,
        country=payload.country,
        note=payload.note,
    )
    db.add(subject)
    db.flush()
    create_accounting_event(
        db,
        event_type="created",
        entity_type="subject",
        entity_id=subject.id,
        subject_id=subject.id,
        source="admin_api",
        new_values=_build_subject_summary(subject),
    )
    db.commit()
    return get_invoice_subject_detail(db, subject.id)


def update_invoice_subject(db: Session, subject_id: int, payload: InvoiceSubjectUpdate) -> InvoiceSubject:
    subject = get_invoice_subject_detail(db, subject_id)
    before = _build_subject_summary(subject)
    subject.name = payload.name
    subject.email = payload.email
    subject.phone = payload.phone
    subject.address = payload.address
    subject.ico = payload.ico
    subject.dic = payload.dic
    subject.data_box = payload.data_box
    subject.country = payload.country
    subject.note = payload.note
    db.add(subject)
    old_values, new_values = _build_diff_payload(before, _build_subject_summary(subject))
    create_accounting_event(
        db,
        event_type="updated",
        entity_type="subject",
        entity_id=subject.id,
        subject_id=subject.id,
        source="admin_api",
        old_values=old_values,
        new_values=new_values,
    )
    db.commit()
    return get_invoice_subject_detail(db, subject.id)


def delete_invoice_subject(db: Session, subject_id: int) -> int:
    subject = get_invoice_subject_detail(db, subject_id)
    is_referenced = db.query(Invoice.id).filter(Invoice.subject_id == subject.id).first() is not None
    if is_referenced:
        raise InvoiceValidationError("Subjekt nelze smazat, protože je navázaný na existující faktury.")
    create_accounting_event(
        db,
        event_type="deleted",
        entity_type="subject",
        entity_id=subject.id,
        subject_id=subject.id,
        source="admin_api",
        old_values=_build_subject_summary(subject),
    )
    db.delete(subject)
    db.commit()
    return subject_id


def list_invoice_suppliers(db: Session, search: str | None = None) -> list[InvoiceSupplier]:
    query = db.query(InvoiceSupplier)
    if search:
        cleaned = search.strip()
        if cleaned:
            pattern = f"%{cleaned}%"
            query = query.filter(
                or_(
                    InvoiceSupplier.name.ilike(pattern),
                    InvoiceSupplier.email.ilike(pattern),
                    InvoiceSupplier.ico.ilike(pattern),
                    InvoiceSupplier.dic.ilike(pattern),
                )
            )
    return query.order_by(InvoiceSupplier.id.desc()).all()


def get_invoice_supplier_detail(db: Session, supplier_id: int) -> InvoiceSupplier:
    supplier = db.query(InvoiceSupplier).filter(InvoiceSupplier.id == supplier_id).first()
    if supplier is None:
        raise InvoiceSupplierNotFoundError("Dodavatel nebyl nalezen.")
    return supplier


def create_invoice_supplier(db: Session, payload: InvoiceSupplierCreate) -> InvoiceSupplier:
    supplier = InvoiceSupplier(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
        ico=payload.ico,
        dic=payload.dic,
        data_box=payload.data_box,
        country=payload.country,
        note=payload.note,
    )
    db.add(supplier)
    db.flush()
    create_accounting_event(
        db,
        event_type="created",
        entity_type="supplier",
        entity_id=supplier.id,
        supplier_id=supplier.id,
        source="admin_api",
        new_values=_build_supplier_summary(supplier),
    )
    db.commit()
    return get_invoice_supplier_detail(db, supplier.id)


def update_invoice_supplier(db: Session, supplier_id: int, payload: InvoiceSupplierUpdate) -> InvoiceSupplier:
    supplier = get_invoice_supplier_detail(db, supplier_id)
    before = _build_supplier_summary(supplier)
    supplier.name = payload.name
    supplier.email = payload.email
    supplier.phone = payload.phone
    supplier.address = payload.address
    supplier.ico = payload.ico
    supplier.dic = payload.dic
    supplier.data_box = payload.data_box
    supplier.country = payload.country
    supplier.note = payload.note
    db.add(supplier)
    old_values, new_values = _build_diff_payload(before, _build_supplier_summary(supplier))
    create_accounting_event(
        db,
        event_type="updated",
        entity_type="supplier",
        entity_id=supplier.id,
        supplier_id=supplier.id,
        source="admin_api",
        old_values=old_values,
        new_values=new_values,
    )
    db.commit()
    return get_invoice_supplier_detail(db, supplier.id)


def delete_invoice_supplier(db: Session, supplier_id: int) -> int:
    supplier = get_invoice_supplier_detail(db, supplier_id)
    is_referenced = db.query(InvoiceExpense.id).filter(InvoiceExpense.supplier_id == supplier.id).first() is not None
    if is_referenced:
        raise InvoiceValidationError("Dodavatele nelze smazat, protože je navázaný na existující výdaje.")
    create_accounting_event(
        db,
        event_type="deleted",
        entity_type="supplier",
        entity_id=supplier.id,
        supplier_id=supplier.id,
        source="admin_api",
        old_values=_build_supplier_summary(supplier),
    )
    db.delete(supplier)
    db.commit()
    return supplier_id


def list_invoice_recurring_templates(
    db: Session,
    *,
    template_type: str | None = None,
    status: str | None = None,
) -> list[InvoiceRecurringTemplate]:
    query = (
        db.query(InvoiceRecurringTemplate)
        .options(selectinload(InvoiceRecurringTemplate.items))
        .order_by(InvoiceRecurringTemplate.id.desc())
    )
    normalized_template_type = _normalize_recurring_template_type(template_type, allow_none=True)
    normalized_status = _normalize_recurring_template_status(status, allow_none=True)
    if normalized_template_type is not None:
        query = query.filter(InvoiceRecurringTemplate.template_type == normalized_template_type)
    if normalized_status is not None:
        query = query.filter(InvoiceRecurringTemplate.status == normalized_status)
    return query.all()


def get_invoice_recurring_template_detail(db: Session, template_id: int) -> InvoiceRecurringTemplate:
    template = (
        db.query(InvoiceRecurringTemplate)
        .options(selectinload(InvoiceRecurringTemplate.items))
        .filter(InvoiceRecurringTemplate.id == template_id)
        .first()
    )
    if template is None:
        raise InvoiceRecurringTemplateNotFoundError("Recurring šablona nebyla nalezena.")
    return template


def create_invoice_recurring_template(
    db: Session,
    payload: InvoiceRecurringTemplateCreate,
) -> InvoiceRecurringTemplate:
    subject = _resolve_invoice_subject(db, payload.subject_id) if payload.subject_id is not None else None
    supplier = _resolve_invoice_supplier(db, payload.supplier_id) if payload.supplier_id is not None else None
    prepared_items = [_prepare_invoice_item(item) for item in payload.items]
    template = InvoiceRecurringTemplate(
        template_type=_normalize_recurring_template_type(payload.template_type),
        document_kind=payload.document_kind,
        subject_id=subject.id if subject is not None else None,
        supplier_id=supplier.id if supplier is not None else None,
        name=payload.name,
        status=_normalize_recurring_template_status(payload.status),
        recurrence_interval=_normalize_recurring_interval(payload.recurrence_interval),
        recurrence_count=payload.recurrence_count,
        next_run_date=payload.next_run_date,
        last_run_date=None,
        business_mode=payload.business_mode,
        tax_mode=payload.tax_mode,
        currency=payload.currency,
        vat_rate=_normalize_vat_rate(payload.vat_rate) if payload.vat_rate is not None else None,
        note=payload.note,
        payment_method=payload.payment_method,
        bank_account_number=payload.bank_account_number,
        bank_account_prefix=payload.bank_account_prefix,
        bank_code=payload.bank_code,
        bank_iban=payload.bank_iban,
    )
    template.items = [
        InvoiceRecurringTemplateItem(
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            line_total=item.line_total,
        )
        for item in prepared_items
    ]
    db.add(template)
    db.flush()
    create_accounting_event(
        db,
        event_type="created",
        entity_type="recurring_template",
        entity_id=template.id,
        recurring_template_id=template.id,
        subject_id=template.subject_id,
        supplier_id=template.supplier_id,
        source="admin_api",
        new_values=_build_recurring_template_summary(template),
    )
    db.commit()
    return get_invoice_recurring_template_detail(db, template.id)


def update_invoice_recurring_template(
    db: Session,
    template_id: int,
    payload: InvoiceRecurringTemplateUpdate,
) -> InvoiceRecurringTemplate:
    template = get_invoice_recurring_template_detail(db, template_id)
    before = _build_recurring_template_summary(template)
    subject = _resolve_invoice_subject(db, payload.subject_id) if payload.subject_id is not None else None
    supplier = _resolve_invoice_supplier(db, payload.supplier_id) if payload.supplier_id is not None else None
    prepared_items = [_prepare_invoice_item(item) for item in payload.items]
    template.template_type = _normalize_recurring_template_type(payload.template_type)
    template.document_kind = payload.document_kind
    template.subject_id = subject.id if subject is not None else None
    template.supplier_id = supplier.id if supplier is not None else None
    template.name = payload.name
    template.status = _normalize_recurring_template_status(payload.status)
    template.recurrence_interval = _normalize_recurring_interval(payload.recurrence_interval)
    template.recurrence_count = payload.recurrence_count
    template.next_run_date = payload.next_run_date
    template.business_mode = payload.business_mode
    template.tax_mode = payload.tax_mode
    template.currency = payload.currency
    template.vat_rate = _normalize_vat_rate(payload.vat_rate) if payload.vat_rate is not None else None
    template.note = payload.note
    template.payment_method = payload.payment_method
    template.bank_account_number = payload.bank_account_number
    template.bank_account_prefix = payload.bank_account_prefix
    template.bank_code = payload.bank_code
    template.bank_iban = payload.bank_iban
    template.items = [
        InvoiceRecurringTemplateItem(
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            line_total=item.line_total,
        )
        for item in prepared_items
    ]
    db.add(template)
    old_values, new_values = _build_diff_payload(before, _build_recurring_template_summary(template))
    create_accounting_event(
        db,
        event_type="updated",
        entity_type="recurring_template",
        entity_id=template.id,
        recurring_template_id=template.id,
        subject_id=template.subject_id,
        supplier_id=template.supplier_id,
        source="admin_api",
        old_values=old_values,
        new_values=new_values,
    )
    db.commit()
    return get_invoice_recurring_template_detail(db, template.id)


def pause_invoice_recurring_template(db: Session, template_id: int) -> InvoiceRecurringTemplate:
    template = get_invoice_recurring_template_detail(db, template_id)
    before = _build_recurring_template_summary(template)
    template.status = "paused"
    db.add(template)
    create_accounting_event(
        db,
        event_type="status_changed",
        entity_type="recurring_template",
        entity_id=template.id,
        recurring_template_id=template.id,
        subject_id=template.subject_id,
        supplier_id=template.supplier_id,
        source="admin_api",
        old_values={"status": before["status"]},
        new_values={"status": template.status},
    )
    db.commit()
    return get_invoice_recurring_template_detail(db, template.id)


def activate_invoice_recurring_template(db: Session, template_id: int) -> InvoiceRecurringTemplate:
    template = get_invoice_recurring_template_detail(db, template_id)
    before = _build_recurring_template_summary(template)
    template.status = "active"
    db.add(template)
    create_accounting_event(
        db,
        event_type="status_changed",
        entity_type="recurring_template",
        entity_id=template.id,
        recurring_template_id=template.id,
        subject_id=template.subject_id,
        supplier_id=template.supplier_id,
        source="admin_api",
        old_values={"status": before["status"]},
        new_values={"status": template.status},
    )
    db.commit()
    return get_invoice_recurring_template_detail(db, template.id)


def cancel_invoice_recurring_template(db: Session, template_id: int) -> InvoiceRecurringTemplate:
    template = get_invoice_recurring_template_detail(db, template_id)
    before = _build_recurring_template_summary(template)
    template.status = "cancelled"
    db.add(template)
    create_accounting_event(
        db,
        event_type="status_changed",
        entity_type="recurring_template",
        entity_id=template.id,
        recurring_template_id=template.id,
        subject_id=template.subject_id,
        supplier_id=template.supplier_id,
        source="admin_api",
        old_values={"status": before["status"]},
        new_values={"status": template.status},
    )
    db.commit()
    return get_invoice_recurring_template_detail(db, template.id)


def delete_invoice_recurring_template(db: Session, template_id: int) -> int:
    template = get_invoice_recurring_template_detail(db, template_id)
    has_generations = (
        db.query(InvoiceRecurringGeneration.id)
        .filter(InvoiceRecurringGeneration.template_id == template.id)
        .first()
        is not None
    )
    if has_generations:
        raise InvoiceValidationError("Recurring šablonu s historií generování nelze smazat.")
    create_accounting_event(
        db,
        event_type="deleted",
        entity_type="recurring_template",
        entity_id=template.id,
        recurring_template_id=template.id,
        subject_id=template.subject_id,
        supplier_id=template.supplier_id,
        source="admin_api",
        old_values=_build_recurring_template_summary(template),
    )
    db.delete(template)
    db.commit()
    return template_id


def list_invoice_recurring_generations(db: Session, template_id: int) -> list[InvoiceRecurringGeneration]:
    _get_invoice_recurring_template_or_raise(db, template_id, include_items=False)
    return (
        db.query(InvoiceRecurringGeneration)
        .filter(InvoiceRecurringGeneration.template_id == template_id)
        .order_by(InvoiceRecurringGeneration.generated_at.desc(), InvoiceRecurringGeneration.id.desc())
        .all()
    )


def generate_invoice_from_recurring_template(db: Session, template_id: int) -> RecurringGenerationResult:
    template = _get_invoice_recurring_template_or_raise(db, template_id, include_items=True)
    if template.status != "active":
        raise InvoiceValidationError("Generovat lze pouze z aktivní recurring šablony.")

    run_date = template.next_run_date
    if template.template_type == "invoice":
        generated_invoice = _generate_invoice_document_from_recurring_template(db, template, run_date=run_date)
        generation = InvoiceRecurringGeneration(
            template_id=template.id,
            generated_invoice_id=generated_invoice.id,
            generated_expense_id=None,
            run_date=run_date,
            status=DEFAULT_RECURRING_GENERATION_STATUS,
            message=f"Vygenerováno z recurring šablony {template.name}.",
        )
    else:
        generated_expense = _generate_expense_document_from_recurring_template(db, template, run_date=run_date)
        generation = InvoiceRecurringGeneration(
            template_id=template.id,
            generated_invoice_id=None,
            generated_expense_id=generated_expense.id,
            run_date=run_date,
            status=DEFAULT_RECURRING_GENERATION_STATUS,
            message=f"Vygenerováno z recurring šablony {template.name}.",
        )

    template.last_run_date = run_date
    template.next_run_date = _advance_recurring_run_date(
        run_date,
        interval=template.recurrence_interval,
        recurrence_count=template.recurrence_count,
    )
    db.add(template)
    db.add(generation)
    db.flush()
    generation_metadata = {
        "template_id": template.id,
        "template_type": template.template_type,
        "document_kind": template.document_kind,
        "generation_id": generation.id,
        "run_date": run_date,
    }
    create_accounting_event(
        db,
        event_type="generated",
        entity_type="recurring_template",
        entity_id=template.id,
        recurring_template_id=template.id,
        subject_id=template.subject_id,
        supplier_id=template.supplier_id,
        invoice_id=generation.generated_invoice_id,
        expense_id=generation.generated_expense_id,
        source="generation",
        new_values=generation_metadata,
    )
    db.commit()
    return RecurringGenerationResult(
        template=get_invoice_recurring_template_detail(db, template.id),
        generation=generation,
    )


def list_invoice_bank_transactions(
    db: Session,
    *,
    status: str | None = None,
    direction: str | None = None,
) -> list[InvoiceBankTransaction]:
    query = db.query(InvoiceBankTransaction).order_by(
        InvoiceBankTransaction.transaction_date.desc(),
        InvoiceBankTransaction.id.desc(),
    )
    normalized_status = _normalize_bank_transaction_status(status, allow_none=True)
    normalized_direction = _normalize_bank_transaction_direction(direction, allow_none=True)
    if normalized_status is not None:
        query = query.filter(InvoiceBankTransaction.status == normalized_status)
    if normalized_direction is not None:
        query = query.filter(InvoiceBankTransaction.direction == normalized_direction)
    return query.all()


def import_invoice_bank_transactions(
    db: Session,
    payload: InvoiceBankTransactionImportRequest,
) -> ImportBankTransactionsResult:
    imported_ids: list[int] = []
    skipped_identifiers: list[str] = []
    seen_external_ids: set[str] = set()
    seen_fingerprints: set[str] = set()

    for item in payload.transactions:
        fingerprint = _compute_bank_transaction_fingerprint(item)
        duplicate_identifier = item.external_id or f"fingerprint:{fingerprint[:12]}"
        if item.external_id is not None and item.external_id in seen_external_ids:
            skipped_identifiers.append(duplicate_identifier)
            continue
        if fingerprint in seen_fingerprints:
            skipped_identifiers.append(duplicate_identifier)
            continue

        existing_by_fingerprint = (
            db.query(InvoiceBankTransaction.id)
            .filter(InvoiceBankTransaction.fingerprint == fingerprint)
            .first()
            is not None
        )
        existing_by_external_id = (
            item.external_id is not None
            and db.query(InvoiceBankTransaction.id)
            .filter(InvoiceBankTransaction.external_id == item.external_id)
            .first()
            is not None
        )
        if existing_by_fingerprint or existing_by_external_id:
            skipped_identifiers.append(duplicate_identifier)
            continue

        transaction = InvoiceBankTransaction(
            external_id=item.external_id,
            fingerprint=fingerprint,
            account_iban=item.account_iban,
            account_number=item.account_number,
            bank_code=item.bank_code,
            transaction_date=item.transaction_date,
            booked_date=item.booked_date,
            amount=_quantize_money(Decimal(item.amount)),
            currency=item.currency,
            variable_symbol=item.variable_symbol,
            constant_symbol=item.constant_symbol,
            specific_symbol=item.specific_symbol,
            counterparty_name=item.counterparty_name,
            counterparty_account=item.counterparty_account,
            counterparty_iban=item.counterparty_iban,
            message=item.message,
            raw_payload=_serialize_bank_transaction_raw_payload(item.raw_payload),
            direction=_normalize_bank_transaction_direction(item.direction),
            status=DEFAULT_BANK_TRANSACTION_STATUS,
        )
        db.add(transaction)
        db.flush()
        create_accounting_event(
            db,
            event_type="created",
            entity_type="bank_transaction",
            entity_id=transaction.id,
            bank_transaction_id=transaction.id,
            source="import",
            new_values=_build_bank_transaction_summary(transaction),
        )
        imported_ids.append(transaction.id)
        if item.external_id is not None:
            seen_external_ids.add(item.external_id)
        seen_fingerprints.add(fingerprint)

    db.commit()
    return ImportBankTransactionsResult(
        imported_count=len(imported_ids),
        skipped_duplicate_count=len(skipped_identifiers),
        imported_transaction_ids=imported_ids,
        skipped_duplicate_identifiers=skipped_identifiers,
    )


def get_invoice_bank_transaction_detail(db: Session, transaction_id: int) -> InvoiceBankTransaction:
    transaction = db.query(InvoiceBankTransaction).filter(InvoiceBankTransaction.id == transaction_id).first()
    if transaction is None:
        raise InvoiceBankTransactionNotFoundError("Bankovní transakce nebyla nalezena.")
    return transaction


def ignore_invoice_bank_transaction(db: Session, transaction_id: int) -> InvoiceBankTransaction:
    transaction = get_invoice_bank_transaction_detail(db, transaction_id)
    if transaction.status == "matched":
        raise InvoiceValidationError("Spárovanou bankovní transakci nelze ignorovat.")
    previous_status = transaction.status
    transaction.status = "ignored"
    db.add(transaction)
    create_accounting_event(
        db,
        event_type="ignored",
        entity_type="bank_transaction",
        entity_id=transaction.id,
        bank_transaction_id=transaction.id,
        source="bank_matching",
        old_values={"status": previous_status},
        new_values={"status": transaction.status},
    )
    db.commit()
    return get_invoice_bank_transaction_detail(db, transaction.id)


def list_invoice_payment_matches(db: Session, transaction_id: int) -> list[InvoicePaymentMatch]:
    _get_invoice_bank_transaction_or_raise(db, transaction_id)
    return (
        db.query(InvoicePaymentMatch)
        .filter(InvoicePaymentMatch.bank_transaction_id == transaction_id)
        .order_by(InvoicePaymentMatch.confidence.desc(), InvoicePaymentMatch.id.asc())
        .all()
    )


def list_invoice_payment_matches_catalog(
    db: Session,
    *,
    status: str | None = "suggested",
    limit: int | None = 100,
    offset: int | None = 0,
) -> list[InvoicePaymentMatchListItemResponse]:
    normalized_status = _normalize_payment_match_status(status, allow_none=False)
    normalized_limit = min(max(limit if limit is not None else 100, 1), 500)
    normalized_offset = max(offset if offset is not None else 0, 0)

    query = (
        db.query(InvoicePaymentMatch, InvoiceBankTransaction)
        .join(
            InvoiceBankTransaction,
            InvoicePaymentMatch.bank_transaction_id == InvoiceBankTransaction.id,
        )
        .filter(InvoicePaymentMatch.status == normalized_status)
    )

    if normalized_status == DEFAULT_PAYMENT_MATCH_STATUS:
        query = query.filter(InvoiceBankTransaction.status == DEFAULT_BANK_TRANSACTION_STATUS)

    query = query.order_by(
        InvoicePaymentMatch.confidence.desc(),
        InvoicePaymentMatch.created_at.desc(),
        InvoicePaymentMatch.id.desc(),
    ).offset(normalized_offset).limit(normalized_limit)

    rows = query.all()
    if not rows:
        return []

    invoice_ids = {match.invoice_id for match, _transaction in rows if match.invoice_id is not None}
    expense_ids = {match.expense_id for match, _transaction in rows if match.expense_id is not None}

    invoices_by_id: dict[int, Invoice] = {}
    if invoice_ids:
        invoices = (
            db.query(Invoice)
            .options(selectinload(Invoice.payments))
            .filter(Invoice.id.in_(invoice_ids))
            .all()
        )
        invoices_by_id = {invoice.id: invoice for invoice in invoices}

    expenses_by_id: dict[int, InvoiceExpense] = {}
    if expense_ids:
        expenses = (
            db.query(InvoiceExpense)
            .options(selectinload(InvoiceExpense.payments))
            .filter(InvoiceExpense.id.in_(expense_ids))
            .all()
        )
        expenses_by_id = {expense.id: expense for expense in expenses}

    return [
        _build_payment_match_list_item_response(
            match,
            transaction,
            invoice=invoices_by_id.get(match.invoice_id) if match.invoice_id is not None else None,
            expense=expenses_by_id.get(match.expense_id) if match.expense_id is not None else None,
        )
        for match, transaction in rows
    ]


def generate_invoice_payment_matches(db: Session, transaction_id: int) -> list[InvoicePaymentMatch]:
    transaction = _get_invoice_bank_transaction_or_raise(db, transaction_id)
    if transaction.status == "ignored":
        raise InvoiceValidationError("Ignorované bankovní transakci nelze generovat návrhy párování.")
    if transaction.status == "matched":
        return list_invoice_payment_matches(db, transaction_id)

    existing_ids = {match.id for match in list_invoice_payment_matches(db, transaction_id)}
    if transaction.direction == "incoming":
        _generate_invoice_match_suggestions(db, transaction)
    else:
        _generate_expense_match_suggestions(db, transaction)

    db.flush()
    matches = list_invoice_payment_matches(db, transaction_id)
    for match in matches:
        if match.id in existing_ids:
            continue
        create_accounting_event(
            db,
            event_type="matched",
            entity_type="payment_match",
            entity_id=match.id,
            invoice_id=match.invoice_id,
            expense_id=match.expense_id,
            bank_transaction_id=match.bank_transaction_id,
            payment_match_id=match.id,
            source="bank_matching",
            new_values=_build_payment_match_summary(match),
            metadata={"transaction_status": transaction.status},
        )
    db.commit()
    return matches


def apply_invoice_payment_match(db: Session, transaction_id: int, match_id: int) -> InvoicePaymentMatch:
    transaction = _get_invoice_bank_transaction_or_raise(db, transaction_id)
    match = _get_invoice_payment_match_or_raise(db, transaction_id, match_id)
    if transaction.status == "ignored":
        raise InvoiceValidationError("Ignorovanou bankovní transakci nelze aplikovat.")
    if transaction.status == "matched":
        raise InvoiceValidationError("Tato bankovní transakce už byla spárována.")
    if match.status == "applied":
        raise InvoiceValidationError("Tento návrh párování už byl aplikován.")
    if match.status == "rejected":
        raise InvoiceValidationError("Zamítnutý návrh párování nelze aplikovat.")
    if _transaction_has_any_applied_match(db, transaction.id):
        raise InvoiceValidationError("Tato bankovní transakce už má aplikované párování.")

    payment_note = _compose_bank_transaction_payment_note(transaction)
    payment_method = "Bankovní převod"
    amount = _quantize_money(Decimal(transaction.amount))

    if match.invoice_id is not None:
        if transaction.direction != "incoming":
            raise InvoiceValidationError("Příchozí bankovní transakce je povinná pro párování s fakturou.")
        invoice = get_invoice_detail(db, match.invoice_id)
        payment = _create_invoice_payment_record(
            db,
            invoice=invoice,
            amount=amount,
            paid_at=transaction.transaction_date,
            payment_method=payment_method,
            note=payment_note,
        )
        match.invoice_payment_id = payment.id
        create_accounting_event(
            db,
            event_type="payment_added",
            entity_type="invoice_payment",
            entity_id=payment.id,
            invoice_id=invoice.id,
            bank_transaction_id=transaction.id,
            payment_match_id=match.id,
            source="bank_matching",
            new_values=_build_invoice_payment_summary_payload(payment),
            metadata={"match_type": match.match_type},
        )
        _auto_complete_open_todos_for_settled_invoice(db, invoice.id)
    elif match.expense_id is not None:
        if transaction.direction != "outgoing":
            raise InvoiceValidationError("Odchozí bankovní transakce je povinná pro párování s výdajem.")
        expense = get_invoice_expense_detail(db, match.expense_id)
        payment = _create_invoice_expense_payment_record(
            db,
            expense=expense,
            amount=amount,
            paid_at=transaction.transaction_date,
            payment_method=payment_method,
            note=payment_note,
        )
        match.expense_payment_id = payment.id
        create_accounting_event(
            db,
            event_type="payment_added",
            entity_type="expense_payment",
            entity_id=payment.id,
            expense_id=expense.id,
            bank_transaction_id=transaction.id,
            payment_match_id=match.id,
            source="bank_matching",
            new_values=_build_expense_payment_summary_payload(payment),
            metadata={"match_type": match.match_type},
        )
        _auto_complete_open_todos_for_settled_expense(db, expense.id)
    else:
        raise InvoiceValidationError("Návrh párování neobsahuje cílový doklad.")

    match.status = "applied"
    match.applied_at = datetime.now(timezone.utc)
    transaction.status = "matched"
    db.add(match)
    db.add(transaction)
    create_accounting_event(
        db,
        event_type="match_applied",
        entity_type="payment_match",
        entity_id=match.id,
        invoice_id=match.invoice_id,
        expense_id=match.expense_id,
        bank_transaction_id=match.bank_transaction_id,
        payment_match_id=match.id,
        source="bank_matching",
        old_values={"status": "suggested"},
        new_values=_build_payment_match_summary(match),
    )
    db.commit()
    return _get_invoice_payment_match_or_raise(db, transaction_id, match_id)


def reject_invoice_payment_match(db: Session, transaction_id: int, match_id: int) -> InvoicePaymentMatch:
    _get_invoice_bank_transaction_or_raise(db, transaction_id)
    match = _get_invoice_payment_match_or_raise(db, transaction_id, match_id)
    if match.status == "applied":
        raise InvoiceValidationError("Aplikovaný návrh párování nelze zamítnout.")
    if match.status == "rejected":
        return match
    match.status = "rejected"
    db.add(match)
    create_accounting_event(
        db,
        event_type="match_rejected",
        entity_type="payment_match",
        entity_id=match.id,
        invoice_id=match.invoice_id,
        expense_id=match.expense_id,
        bank_transaction_id=match.bank_transaction_id,
        payment_match_id=match.id,
        source="bank_matching",
        old_values={"status": DEFAULT_PAYMENT_MATCH_STATUS},
        new_values=_build_payment_match_summary(match),
    )
    db.commit()
    return _get_invoice_payment_match_or_raise(db, transaction_id, match_id)


def _is_invoice_payable_for_bank_matching(invoice: Invoice) -> bool:
    if _normalize_invoice_status(invoice.status) != "issued":
        return False
    if not get_document_kind_metadata(invoice.document_kind).allows_payment_tracking:
        return False
    if getattr(invoice, "effective_status", None) == "cancelled":
        return False
    remaining_amount = _quantize_money(Decimal(getattr(invoice, "remaining_amount", Decimal("0.00"))))
    return remaining_amount > Decimal("0.00")


def _assert_invoice_payable_for_bank_matching(invoice: Invoice) -> None:
    if _normalize_invoice_status(invoice.status) != "issued":
        raise InvoiceValidationError("Lze párovat pouze vystavené doklady.")
    if not get_document_kind_metadata(invoice.document_kind).allows_payment_tracking:
        raise InvoiceValidationError("Tento typ dokladu nelze párovat s bankovní platbou.")
    if getattr(invoice, "effective_status", None) == "cancelled":
        raise InvoiceValidationError("Zrušenou fakturu nelze párovat s bankovní platbou.")
    remaining_amount = _quantize_money(Decimal(getattr(invoice, "remaining_amount", Decimal("0.00"))))
    if remaining_amount <= Decimal("0.00"):
        raise InvoiceValidationError("Faktura je již uhrazena.")


def _resolve_payable_invoice_by_id(db: Session, invoice_id: int) -> Invoice:
    try:
        invoice = get_invoice_detail(db, invoice_id)
    except InvoiceNotFoundError as exc:
        raise InvoiceNotFoundError("Faktura nebyla nalezena.") from exc
    _assert_invoice_payable_for_bank_matching(invoice)
    return invoice


def list_payable_invoices_for_bank_matching(
    db: Session,
    *,
    currency: str | None = None,
) -> list[Invoice]:
    normalized_currency = currency.strip().upper() if currency is not None and currency.strip() else None
    invoices = (
        db.query(Invoice)
        .options(selectinload(Invoice.payments))
        .order_by(Invoice.issue_date.desc(), Invoice.id.desc())
        .all()
    )
    payable_invoices: list[Invoice] = []
    for invoice in invoices:
        runtime_invoice = _attach_invoice_runtime_state(invoice)
        if not _is_invoice_payable_for_bank_matching(runtime_invoice):
            continue
        if normalized_currency is not None and runtime_invoice.currency.strip().upper() != normalized_currency:
            continue
        payable_invoices.append(runtime_invoice)
    return payable_invoices


def _bank_transaction_import_item_is_duplicate(db: Session, item: InvoiceBankTransactionImportItem) -> bool:
    fingerprint = _compute_bank_transaction_fingerprint(item)
    if (
        db.query(InvoiceBankTransaction.id)
        .filter(InvoiceBankTransaction.fingerprint == fingerprint)
        .first()
        is not None
    ):
        return True
    if item.external_id is None:
        return False
    return (
        db.query(InvoiceBankTransaction.id)
        .filter(InvoiceBankTransaction.external_id == item.external_id)
        .first()
        is not None
    )


def _create_bank_transaction_from_import_item(
    db: Session,
    item: InvoiceBankTransactionImportItem,
) -> InvoiceBankTransaction:
    if _bank_transaction_import_item_is_duplicate(db, item):
        raise InvoiceValidationError(
            "Stejná bankovní platba už byla dříve zapsána. Otevřete existující transakci a přiřaďte ji k faktuře."
        )

    fingerprint = _compute_bank_transaction_fingerprint(item)
    transaction = InvoiceBankTransaction(
        external_id=item.external_id,
        fingerprint=fingerprint,
        account_iban=item.account_iban,
        account_number=item.account_number,
        bank_code=item.bank_code,
        transaction_date=item.transaction_date,
        booked_date=item.booked_date,
        amount=_quantize_money(Decimal(item.amount)),
        currency=item.currency,
        variable_symbol=item.variable_symbol,
        constant_symbol=item.constant_symbol,
        specific_symbol=item.specific_symbol,
        counterparty_name=item.counterparty_name,
        counterparty_account=item.counterparty_account,
        counterparty_iban=item.counterparty_iban,
        message=item.message,
        raw_payload=_serialize_bank_transaction_raw_payload(item.raw_payload),
        direction=_normalize_bank_transaction_direction(item.direction),
        status=DEFAULT_BANK_TRANSACTION_STATUS,
    )
    db.add(transaction)
    db.flush()
    create_accounting_event(
        db,
        event_type="created",
        entity_type="bank_transaction",
        entity_id=transaction.id,
        bank_transaction_id=transaction.id,
        source="import",
        new_values=_build_bank_transaction_summary(transaction),
    )
    return transaction


def assign_bank_transaction_to_invoice(
    db: Session,
    transaction_id: int,
    invoice_id: int,
) -> InvoicePaymentMatch:
    transaction = _get_invoice_bank_transaction_or_raise(db, transaction_id)
    if transaction.status == "ignored":
        raise InvoiceValidationError("Ignorovanou bankovní transakci nelze párovat.")
    if transaction.status == "matched":
        raise InvoiceValidationError("Tato bankovní transakce už byla spárována.")
    if transaction.direction != "incoming":
        raise InvoiceValidationError("K faktuře lze párovat pouze příchozí bankovní transakci.")
    if _transaction_has_any_applied_match(db, transaction.id):
        raise InvoiceValidationError("Tato bankovní transakce už má aplikované párování.")

    invoice = _resolve_payable_invoice_by_id(db, invoice_id)
    if invoice.currency != transaction.currency:
        raise InvoiceValidationError(
            f"Měna transakce ({transaction.currency}) neodpovídá faktuře ({invoice.currency})."
        )

    remaining_amount = _quantize_money(Decimal(getattr(invoice, "remaining_amount", Decimal("0.00"))))
    transaction_amount = _quantize_money(Decimal(transaction.amount))
    if transaction_amount > remaining_amount:
        raise InvoiceValidationError(
            f"Částka transakce {float(transaction_amount):.2f} {transaction.currency} "
            f"překračuje zbývající částku faktury {float(remaining_amount):.2f}."
        )

    _create_match_suggestion(
        db,
        transaction_id=transaction.id,
        invoice_id=invoice.id,
        expense_id=None,
        match_type="manual",
        confidence=100,
        reason=f"Ruční přiřazení k faktuře č. {invoice.invoice_number}.",
    )
    db.flush()

    match = (
        db.query(InvoicePaymentMatch)
        .filter(
            InvoicePaymentMatch.bank_transaction_id == transaction.id,
            InvoicePaymentMatch.invoice_id == invoice.id,
            InvoicePaymentMatch.match_type == "manual",
            InvoicePaymentMatch.status == DEFAULT_PAYMENT_MATCH_STATUS,
        )
        .order_by(InvoicePaymentMatch.id.desc())
        .first()
    )
    if match is None:
        raise InvoiceValidationError("Nepodařilo se vytvořit ruční návrh párování.")

    return apply_invoice_payment_match(db, transaction.id, match.id)


def record_invoice_bank_payment(
    db: Session,
    payload: InvoiceBankTransactionRecordInvoicePaymentRequest,
) -> InvoiceBankTransactionRecordInvoicePaymentResponse:
    invoice = _resolve_payable_invoice_by_id(db, payload.invoice_id)
    remaining_amount = _quantize_money(Decimal(getattr(invoice, "remaining_amount", Decimal("0.00"))))
    payment_amount = (
        _quantize_money(Decimal(payload.amount))
        if payload.amount is not None
        else remaining_amount
    )
    if payment_amount <= Decimal("0.00"):
        raise InvoiceValidationError("Částka platby musí být větší než nula.")
    if payment_amount > remaining_amount:
        raise InvoiceValidationError(
            f"Částka platby {float(payment_amount):.2f} překračuje zbývající částku faktury "
            f"{float(remaining_amount):.2f}."
        )

    import_item = InvoiceBankTransactionImportItem(
        transaction_date=payload.transaction_date,
        amount=payment_amount,
        currency=invoice.currency,
        variable_symbol=invoice.variable_symbol,
        direction="incoming",
        message=payload.message,
        counterparty_name=payload.counterparty_name or invoice.customer_name,
    )
    transaction = _create_bank_transaction_from_import_item(db, import_item)
    applied_match = assign_bank_transaction_to_invoice(
        db,
        transaction.id,
        invoice.id,
    )
    updated_invoice = get_invoice_detail(db, invoice.id)
    payment_summary = _build_payment_summary(updated_invoice)
    updated_transaction = get_invoice_bank_transaction_detail(db, transaction.id)

    return InvoiceBankTransactionRecordInvoicePaymentResponse(
        transaction_id=updated_transaction.id,
        match_id=applied_match.id,
        invoice_id=updated_invoice.id,
        invoice_number=updated_invoice.invoice_number,
        payment_status=payment_summary.payment_status,
        total_paid=payment_summary.total_paid,
        remaining_amount=payment_summary.remaining_amount,
        transaction_status=updated_transaction.status,
    )


def list_invoice_todos(
    db: Session,
    *,
    status: str | None = None,
    todo_type: str | None = None,
    invoice_id: int | None = None,
    expense_id: int | None = None,
) -> list[InvoiceTodo]:
    query = db.query(InvoiceTodo)
    normalized_status = _normalize_todo_status(status, allow_none=True)
    if normalized_status is not None:
        query = query.filter(InvoiceTodo.status == normalized_status)
    normalized_todo_type = _normalize_todo_type(todo_type, allow_none=True)
    if normalized_todo_type is not None:
        query = query.filter(InvoiceTodo.todo_type == normalized_todo_type)
    if invoice_id is not None:
        query = query.filter(InvoiceTodo.invoice_id == invoice_id)
    if expense_id is not None:
        query = query.filter(InvoiceTodo.expense_id == expense_id)
    return query.order_by(InvoiceTodo.due_date.asc(), InvoiceTodo.id.desc()).all()


def get_invoice_todo_detail(db: Session, todo_id: int) -> InvoiceTodo:
    todo = db.query(InvoiceTodo).filter(InvoiceTodo.id == todo_id).first()
    if todo is None:
        raise InvoiceTodoNotFoundError("Todo nebylo nalezeno.")
    return todo


def create_invoice_todo(db: Session, payload: InvoiceTodoCreate) -> InvoiceTodo:
    invoice_id, expense_id = _validate_todo_links(
        db,
        invoice_id=payload.invoice_id,
        expense_id=payload.expense_id,
        todo_type=payload.todo_type,
    )
    normalized_status = _normalize_todo_status(payload.status)
    if _should_prevent_open_todo_duplicate(
        todo_type=payload.todo_type,
        status=normalized_status,
        invoice_id=invoice_id,
        expense_id=expense_id,
    ) and _has_open_todo_duplicate(
        db,
        todo_type=payload.todo_type,
        invoice_id=invoice_id,
        expense_id=expense_id,
    ):
        raise InvoiceValidationError("Otevřené todo tohoto typu už pro daný doklad existuje.")

    todo = InvoiceTodo(
        invoice_id=invoice_id,
        expense_id=expense_id,
        todo_type=payload.todo_type,
        status=normalized_status,
        title=payload.title,
        message=payload.message,
        due_date=payload.due_date,
        completed_at=_resolve_completed_at_for_status(normalized_status),
    )
    db.add(todo)
    db.flush()
    create_accounting_event(
        db,
        event_type="created",
        entity_type="todo",
        entity_id=todo.id,
        invoice_id=todo.invoice_id,
        expense_id=todo.expense_id,
        todo_id=todo.id,
        source="admin_api",
        new_values=_build_todo_summary(todo),
    )
    db.commit()
    return get_invoice_todo_detail(db, todo.id)


def update_invoice_todo(db: Session, todo_id: int, payload: InvoiceTodoUpdate) -> InvoiceTodo:
    todo = get_invoice_todo_detail(db, todo_id)
    before = _build_todo_summary(todo)
    normalized_status = _normalize_todo_status(payload.status)
    if _should_prevent_open_todo_duplicate(
        todo_type=todo.todo_type,
        status=normalized_status,
        invoice_id=todo.invoice_id,
        expense_id=todo.expense_id,
    ) and _has_open_todo_duplicate(
        db,
        todo_type=todo.todo_type,
        invoice_id=todo.invoice_id,
        expense_id=todo.expense_id,
        exclude_todo_id=todo.id,
    ):
        raise InvoiceValidationError("Otevřené todo tohoto typu už pro daný doklad existuje.")

    todo.title = payload.title
    todo.message = payload.message
    todo.due_date = payload.due_date
    todo.status = normalized_status
    todo.completed_at = _resolve_completed_at_for_status(normalized_status, current_value=todo.completed_at)
    db.add(todo)
    old_values, new_values = _build_diff_payload(before, _build_todo_summary(todo))
    create_accounting_event(
        db,
        event_type="updated",
        entity_type="todo",
        entity_id=todo.id,
        invoice_id=todo.invoice_id,
        expense_id=todo.expense_id,
        todo_id=todo.id,
        source="admin_api",
        old_values=old_values,
        new_values=new_values,
    )
    db.commit()
    return get_invoice_todo_detail(db, todo.id)


def complete_invoice_todo(db: Session, todo_id: int) -> InvoiceTodo:
    todo = get_invoice_todo_detail(db, todo_id)
    previous_status = todo.status
    todo.status = "completed"
    todo.completed_at = _resolve_completed_at_for_status("completed", current_value=todo.completed_at)
    db.add(todo)
    create_accounting_event(
        db,
        event_type="status_changed",
        entity_type="todo",
        entity_id=todo.id,
        invoice_id=todo.invoice_id,
        expense_id=todo.expense_id,
        todo_id=todo.id,
        source="admin_api",
        old_values={"status": previous_status},
        new_values={"status": todo.status, "completed_at": todo.completed_at},
    )
    db.commit()
    return get_invoice_todo_detail(db, todo.id)


def cancel_invoice_todo(db: Session, todo_id: int) -> InvoiceTodo:
    todo = get_invoice_todo_detail(db, todo_id)
    previous_status = todo.status
    todo.status = "cancelled"
    todo.completed_at = None
    db.add(todo)
    create_accounting_event(
        db,
        event_type="status_changed",
        entity_type="todo",
        entity_id=todo.id,
        invoice_id=todo.invoice_id,
        expense_id=todo.expense_id,
        todo_id=todo.id,
        source="admin_api",
        old_values={"status": previous_status},
        new_values={"status": todo.status},
    )
    db.commit()
    return get_invoice_todo_detail(db, todo.id)


def delete_invoice_todo(db: Session, todo_id: int) -> int:
    todo = get_invoice_todo_detail(db, todo_id)
    if todo.status != "open":
        raise InvoiceValidationError("Dokončené nebo zrušené todo nelze smazat.")
    create_accounting_event(
        db,
        event_type="deleted",
        entity_type="todo",
        entity_id=todo.id,
        invoice_id=todo.invoice_id,
        expense_id=todo.expense_id,
        todo_id=todo.id,
        source="admin_api",
        old_values=_build_todo_summary(todo),
    )
    db.delete(todo)
    db.commit()
    return todo_id


def generate_invoice_todos(db: Session) -> InvoiceTodoGenerationResult:
    generated_ids: list[int] = []
    skipped_existing_count = 0
    today = date.today()

    overdue_invoices = (
        db.query(Invoice)
        .options(selectinload(Invoice.payments))
        .order_by(Invoice.id.asc())
        .all()
    )
    for invoice in overdue_invoices:
        invoice = _attach_invoice_runtime_state(invoice)
        document_metadata = get_document_kind_metadata(invoice.document_kind)
        if not document_metadata.allows_payment_tracking:
            continue
        if getattr(invoice, "effective_status", None) != "overdue":
            continue
        if _quantize_money(Decimal(getattr(invoice, "remaining_amount", Decimal("0.00")))) <= Decimal("0.00"):
            continue
        if _has_open_todo_duplicate(db, todo_type="invoice_overdue", invoice_id=invoice.id):
            skipped_existing_count += 1
            continue
        todo = _create_generated_todo(
            db,
            invoice_id=invoice.id,
            expense_id=None,
            todo_type="invoice_overdue",
            title=f"Po splatnosti: {document_metadata.internal_label} {invoice.invoice_number}",
            message=(
                f"Doklad {invoice.invoice_number} je po splatnosti od {invoice.due_date.isoformat()} "
                f"a zbývá uhradit {float(invoice.remaining_amount):.2f} {invoice.currency}."
            ),
            due_date=invoice.due_date,
        )
        generated_ids.append(todo.id)

    overdue_expenses = (
        db.query(InvoiceExpense)
        .options(selectinload(InvoiceExpense.payments))
        .order_by(InvoiceExpense.id.asc())
        .all()
    )
    for expense in overdue_expenses:
        expense = _attach_expense_runtime_state(expense)
        if getattr(expense, "effective_status", None) != "overdue":
            continue
        if _quantize_money(Decimal(getattr(expense, "remaining_amount", Decimal("0.00")))) <= Decimal("0.00"):
            continue
        if expense.due_date >= today:
            continue
        if _has_open_todo_duplicate(db, todo_type="expense_overdue", expense_id=expense.id):
            skipped_existing_count += 1
            continue
        todo = _create_generated_todo(
            db,
            invoice_id=None,
            expense_id=expense.id,
            todo_type="expense_overdue",
            title=f"Po splatnosti: výdaj {expense.expense_number}",
            message=(
                f"Výdaj {expense.expense_number} je po splatnosti od {expense.due_date.isoformat()} "
                f"a zbývá uhradit {float(expense.remaining_amount):.2f} {expense.currency}."
            ),
            due_date=expense.due_date,
        )
        generated_ids.append(todo.id)

    db.commit()
    return InvoiceTodoGenerationResult(
        generated_ids=generated_ids,
        skipped_existing_count=skipped_existing_count,
    )


def list_invoice_expenses(db: Session) -> list[InvoiceExpense]:
    expenses = (
        db.query(InvoiceExpense)
        .options(selectinload(InvoiceExpense.payments))
        .order_by(InvoiceExpense.id.desc())
        .all()
    )
    return [_attach_expense_runtime_state(expense) for expense in expenses]


def get_invoice_expense_detail(db: Session, expense_id: int) -> InvoiceExpense:
    expense = _get_invoice_expense_or_raise(db, expense_id, include_items=True)
    return _attach_expense_runtime_state(expense)


def list_invoice_expense_payments(db: Session, expense_id: int) -> list[InvoiceExpensePayment]:
    expense = get_invoice_expense_detail(db, expense_id)
    return list(expense.payments)


def create_invoice_expense(
    db: Session,
    payload: InvoiceExpenseCreate,
    *,
    audit_source: str = "admin_api",
    audit_metadata=None,
) -> InvoiceExpense:
    supplier = _resolve_invoice_supplier(db, payload.supplier_id)
    supplier_snapshot = _resolve_supplier_snapshot_for_create(payload, supplier)
    prepared_items = [_prepare_invoice_item(item) for item in payload.items]
    totals = _calculate_expense_totals(
        vat_rate=payload.vat_rate,
        line_totals=[item.line_total for item in prepared_items],
    )
    try:
        sequence = _reserve_expense_sequence(db, requested_expense_number=payload.expense_number)
        expense = InvoiceExpense(
            supplier_id=supplier_snapshot.supplier_id,
            supplier_name=supplier_snapshot.name,
            supplier_email=supplier_snapshot.email,
            supplier_phone=supplier_snapshot.phone,
            supplier_address=supplier_snapshot.address,
            supplier_ico=supplier_snapshot.ico,
            supplier_dic=supplier_snapshot.dic,
            supplier_data_box=supplier_snapshot.data_box,
            supplier_country=supplier_snapshot.country,
            expense_number=sequence.expense_number,
            variable_symbol=sequence.variable_symbol,
            issue_date=payload.issue_date,
            received_date=payload.received_date,
            due_date=payload.due_date,
            taxable_supply_date=payload.taxable_supply_date,
            currency=payload.currency,
            subtotal=totals.subtotal,
            vat_rate=totals.vat_rate,
            vat_amount=totals.vat_amount,
            total=totals.total,
            status=_normalize_expense_status(payload.status),
            note=payload.note,
            payment_method=payload.payment_method,
            bank_account_number=payload.bank_account_number,
            bank_account_prefix=payload.bank_account_prefix,
            bank_code=payload.bank_code,
            bank_iban=payload.bank_iban,
        )
        expense.items = [
            InvoiceExpenseItem(
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
            )
            for item in prepared_items
        ]
        db.add(expense)
        db.flush()
        create_accounting_event(
            db,
            event_type="created",
            entity_type="expense",
            entity_id=expense.id,
            expense_id=expense.id,
            supplier_id=expense.supplier_id,
            source=audit_source,
            new_values=_build_expense_summary(expense),
            metadata=audit_metadata,
        )
        db.commit()
        return get_invoice_expense_detail(db, expense.id)
    except (IntegrityError, InvoiceNumberingError) as exc:
        db.rollback()
        raise InvoiceValidationError("Číslo přijatého dokladu nebo variabilní symbol už existuje.") from exc


def update_invoice_expense(db: Session, expense_id: int, payload: InvoiceExpenseUpdate) -> InvoiceExpense:
    expense = _get_invoice_expense_or_raise(db, expense_id, include_items=True)
    before = _build_expense_summary(expense)
    supplier = _resolve_invoice_supplier(db, payload.supplier_id)
    supplier_snapshot = _resolve_supplier_snapshot_for_update(expense=expense, payload=payload, supplier=supplier)
    prepared_items = [_prepare_invoice_item(item) for item in payload.items]
    totals = _calculate_expense_totals(
        vat_rate=payload.vat_rate,
        line_totals=[item.line_total for item in prepared_items],
    )
    summary = _build_expense_payment_summary(expense)
    if summary.total_paid > totals.total:
        raise InvoiceValidationError("Součet plateb nesmí překročit novou celkovou částku přijatého dokladu.")

    try:
        sequence = _resolve_expense_sequence_for_update(
            db,
            expense_id=expense.id,
            current_expense_number=expense.expense_number,
            requested_expense_number=payload.expense_number,
        )
        _apply_supplier_snapshot_to_expense(expense, supplier_snapshot)
        expense.expense_number = sequence.expense_number
        expense.variable_symbol = sequence.variable_symbol
        expense.issue_date = payload.issue_date
        expense.received_date = payload.received_date
        expense.due_date = payload.due_date
        expense.taxable_supply_date = payload.taxable_supply_date
        expense.currency = payload.currency
        expense.subtotal = totals.subtotal
        expense.vat_rate = totals.vat_rate
        expense.vat_amount = totals.vat_amount
        expense.total = totals.total
        expense.status = _normalize_expense_status(payload.status)
        expense.note = payload.note
        expense.payment_method = payload.payment_method
        expense.bank_account_number = payload.bank_account_number
        expense.bank_account_prefix = payload.bank_account_prefix
        expense.bank_code = payload.bank_code
        expense.bank_iban = payload.bank_iban
        expense.items = [
            InvoiceExpenseItem(
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
            )
            for item in prepared_items
        ]
        db.add(expense)
        old_values, new_values = _build_diff_payload(before, _build_expense_summary(expense))
        create_accounting_event(
            db,
            event_type="updated",
            entity_type="expense",
            entity_id=expense.id,
            expense_id=expense.id,
            supplier_id=expense.supplier_id,
            source="admin_api",
            old_values=old_values,
            new_values=new_values,
        )
        db.commit()
        return get_invoice_expense_detail(db, expense.id)
    except (IntegrityError, InvoiceNumberingError) as exc:
        db.rollback()
        raise InvoiceValidationError("Číslo přijatého dokladu nebo variabilní symbol už existuje.") from exc


def delete_invoice_expense(db: Session, expense_id: int) -> int:
    expense = _get_invoice_expense_or_raise(db, expense_id, include_payments=True)
    if expense.payments:
        raise InvoiceValidationError("Přijatý doklad s evidovanými platbami nelze smazat.")
    create_accounting_event(
        db,
        event_type="deleted",
        entity_type="expense",
        entity_id=expense.id,
        expense_id=expense.id,
        supplier_id=expense.supplier_id,
        source="admin_api",
        old_values=_build_expense_summary(expense),
    )
    db.delete(expense)
    db.commit()
    return expense_id


def _create_invoice_expense_payment_record(
    db: Session,
    *,
    expense: InvoiceExpense,
    amount: Decimal,
    paid_at: date,
    payment_method: str,
    note: str | None,
) -> InvoiceExpensePayment:
    if amount <= 0:
        raise InvoiceValidationError("Částka platby musí být větší než nula.")
    if _normalize_expense_status(expense.status) == "cancelled":
        raise InvoiceValidationError("Ke stornovanému přijatému dokladu nelze přidat platbu.")

    summary = _build_expense_payment_summary(expense)
    next_total_paid = _quantize_money(summary.total_paid + amount)
    expense_total = _quantize_money(Decimal(expense.total))
    if next_total_paid > expense_total:
        raise InvoiceValidationError("Součet plateb nesmí překročit celkovou částku přijatého dokladu.")

    payment = InvoiceExpensePayment(
        expense_id=expense.id,
        amount=amount,
        paid_at=paid_at,
        payment_method=payment_method,
        note=note,
    )
    db.add(payment)
    db.flush()
    if "payments" in expense.__dict__:
        expense.payments.append(payment)
    return payment


def add_invoice_expense_payment(db: Session, expense_id: int, payload: InvoiceExpensePaymentCreate) -> InvoiceExpense:
    expense = _get_invoice_expense_or_raise(db, expense_id, include_items=True, include_payments=True)
    payment = _create_invoice_expense_payment_record(
        db,
        expense=expense,
        amount=_quantize_money(Decimal(payload.amount)),
        paid_at=payload.paid_at,
        payment_method=payload.payment_method,
        note=payload.note,
    )
    create_accounting_event(
        db,
        event_type="payment_added",
        entity_type="expense_payment",
        entity_id=payment.id,
        expense_id=expense.id,
        supplier_id=expense.supplier_id,
        source="admin_api",
        new_values=_build_expense_payment_summary_payload(payment),
    )
    _auto_complete_open_todos_for_settled_expense(db, expense.id)
    db.commit()
    return get_invoice_expense_detail(db, expense.id)


def delete_invoice_expense_payment(db: Session, expense_id: int, payment_id: int) -> InvoiceExpense:
    expense = _get_invoice_expense_or_raise(db, expense_id, include_items=True, include_payments=True)
    payment = next((item for item in expense.payments if item.id == payment_id), None)
    if payment is None:
        raise InvoiceExpensePaymentNotFoundError("Platba přijatého dokladu nebyla nalezena.")
    create_accounting_event(
        db,
        event_type="payment_deleted",
        entity_type="expense_payment",
        entity_id=payment.id,
        expense_id=expense.id,
        supplier_id=expense.supplier_id,
        source="admin_api",
        old_values=_build_expense_payment_summary_payload(payment),
    )
    db.delete(payment)
    db.commit()
    return get_invoice_expense_detail(db, expense.id)


def validate_invoice_create_payload(db: Session, payload: InvoiceCreate) -> InvoiceValidationPreview:
    settings = get_invoice_settings(db)
    subject = _resolve_invoice_subject(db, payload.subject_id)
    customer_snapshot = _resolve_customer_snapshot_for_create(payload, subject)
    prepared_items = [_prepare_invoice_item(item) for item in payload.items]
    totals = _calculate_totals(
        tax_mode=payload.tax_mode,
        vat_rate=payload.vat_rate,
        line_totals=[item.line_total for item in prepared_items],
    )
    return InvoiceValidationPreview(
        subject_id=subject.id if subject is not None else None,
        subject_name=customer_snapshot.name,
        currency=(payload.currency or settings.invoice_defaults.default_currency).strip().upper(),
        subtotal=totals.subtotal,
        vat_rate=totals.vat_rate,
        vat_amount=totals.vat_amount,
        total=totals.total,
        item_count=len(prepared_items),
    )


def create_invoice(
    db: Session,
    payload: InvoiceCreate,
    *,
    audit_source: str = "admin_api",
    audit_metadata=None,
) -> Invoice:
    settings = get_invoice_settings(db)
    subject = _resolve_invoice_subject(db, payload.subject_id)
    customer_snapshot = _resolve_customer_snapshot_for_create(payload, subject)
    prepared_items = [_prepare_invoice_item(item) for item in payload.items]
    totals = _calculate_totals(
        tax_mode=payload.tax_mode,
        vat_rate=payload.vat_rate,
        line_totals=[item.line_total for item in prepared_items],
    )
    try:
        return _create_invoice_with_reserved_sequence(
            db=db,
            payload=payload,
            subject=subject,
            customer_snapshot=customer_snapshot,
            issuer=settings.issuer_profile,
            payment_settings=settings,
            prepared_items=prepared_items,
            totals=totals,
            audit_source=audit_source,
            audit_metadata=audit_metadata,
        )
    except (InvoiceNumberingError, InvoicePaymentError) as exc:
        db.rollback()
        raise InvoiceValidationError(str(exc)) from exc


def update_invoice(db: Session, invoice_id: int, payload: InvoiceUpdate) -> Invoice:
    invoice = get_invoice_detail(db, invoice_id)
    subject = _resolve_invoice_subject(db, payload.subject_id) if "subject_id" in payload.model_fields_set else None
    customer_snapshot = _resolve_customer_snapshot_for_update(invoice=invoice, payload=payload, subject=subject)
    prepared_items = [_prepare_invoice_item(item) for item in payload.items]
    totals = _calculate_totals(
        tax_mode=payload.tax_mode,
        vat_rate=payload.vat_rate,
        line_totals=[item.line_total for item in prepared_items],
    )
    try:
        return _update_existing_invoice(
            db=db,
            invoice=invoice,
            payload=payload,
            subject=subject,
            customer_snapshot=customer_snapshot,
            prepared_items=prepared_items,
            totals=totals,
        )
    except InvoiceNumberingError as exc:
        db.rollback()
        raise InvoiceValidationError(str(exc)) from exc


def convert_quote_to_document(db: Session, quote_id: int, payload: QuoteConvertRequest) -> Invoice:
    source_quote = get_invoice_detail(db, quote_id)
    if normalize_document_kind(source_quote.document_kind) != "quote":
        raise InvoiceValidationError("Převádět lze pouze cenovou nabídku.")

    relation_type = _quote_relation_type_for_target(payload.target_document_kind)
    if _quote_conversion_relation_exists(db, source_invoice_id=source_quote.id, relation_type=relation_type):
        if payload.target_document_kind == "invoice":
            raise InvoiceValidationError("Z této cenové nabídky už byla vytvořena faktura.")
        raise InvoiceValidationError("Z této cenové nabídky už byla vytvořena proforma.")

    issue_date = payload.issue_date or date.today()
    due_date = payload.due_date or max(source_quote.due_date, issue_date)
    if due_date < issue_date:
        raise InvoiceValidationError("Datum splatnosti nemůže být dříve než datum vystavení.")
    resolved_note = payload.note if payload.note is not None else source_quote.note
    prepared_items = [_build_prepared_item_from_snapshot(item) for item in source_quote.items]
    totals = _calculate_totals(
        tax_mode=source_quote.tax_mode,
        vat_rate=Decimal(source_quote.vat_rate) if source_quote.vat_rate is not None else None,
        line_totals=[item.line_total for item in prepared_items],
    )

    for attempt in range(2):
        try:
            reserved_sequence = reserve_invoice_sequence(
                db,
                document_kind=payload.target_document_kind,
                reference_date=issue_date,
            )
            generated_invoice = Invoice(
                invoice_number=reserved_sequence.invoice_number,
                variable_symbol=reserved_sequence.variable_symbol,
                issue_date=issue_date,
                due_date=due_date,
                issuer_name=source_quote.issuer_name,
                issuer_address=source_quote.issuer_address,
                issuer_city=source_quote.issuer_city,
                issuer_zip=source_quote.issuer_zip,
                issuer_ico=source_quote.issuer_ico,
                issuer_dic=source_quote.issuer_dic,
                issuer_data_box=source_quote.issuer_data_box,
                customer_name=source_quote.customer_name,
                customer_email=source_quote.customer_email,
                customer_phone=source_quote.customer_phone,
                customer_address=source_quote.customer_address,
                customer_ico=source_quote.customer_ico,
                customer_dic=source_quote.customer_dic,
                subject_id=source_quote.subject_id,
                note=resolved_note,
                document_kind=payload.target_document_kind,
                business_mode=source_quote.business_mode,
                tax_mode=source_quote.tax_mode,
                currency=source_quote.currency,
                subtotal=totals.subtotal,
                vat_rate=totals.vat_rate,
                vat_amount=totals.vat_amount,
                total=totals.total,
                status="issued",
                reverse_charge_reason=totals.reverse_charge_reason,
                reverse_charge_text=totals.reverse_charge_text,
                payment_method=source_quote.payment_method,
                bank_account_number=source_quote.bank_account_number,
                bank_account_prefix=source_quote.bank_account_prefix,
                bank_code=source_quote.bank_code,
                bank_iban=source_quote.bank_iban,
            )
            generated_invoice.items = [
                InvoiceItem(
                    description=item.description,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    line_total=item.line_total,
                )
                for item in prepared_items
            ]
            db.add(generated_invoice)
            db.flush()
            db.add(
                InvoiceDocumentRelation(
                    source_invoice_id=source_quote.id,
                    target_invoice_id=generated_invoice.id,
                    source_payment_id=None,
                    relation_type=relation_type,
                )
            )
            create_accounting_event(
                db,
                event_type="generated",
                entity_type="invoice",
                entity_id=generated_invoice.id,
                invoice_id=generated_invoice.id,
                subject_id=generated_invoice.subject_id,
                source="generation",
                new_values=_build_invoice_summary(generated_invoice),
                metadata={"source_invoice_id": source_quote.id, "relation_type": relation_type},
            )
            create_accounting_event(
                db,
                event_type="linked",
                entity_type="document_relation",
                entity_id=generated_invoice.id,
                invoice_id=source_quote.id,
                subject_id=source_quote.subject_id,
                source="generation",
                new_values={
                    "source_invoice_id": source_quote.id,
                    "target_invoice_id": generated_invoice.id,
                    "relation_type": relation_type,
                },
            )
            db.commit()
            created_invoice = get_invoice_detail(db, generated_invoice.id)
            _cache_invoice_nonfatal(created_invoice)
            return created_invoice
        except IntegrityError as exc:
            db.rollback()
            if _quote_conversion_relation_exists(db, source_invoice_id=source_quote.id, relation_type=relation_type):
                if payload.target_document_kind == "invoice":
                    raise InvoiceValidationError("Z této cenové nabídky už byla vytvořena faktura.") from exc
                raise InvoiceValidationError("Z této cenové nabídky už byla vytvořena proforma.") from exc
            if attempt > 0:
                raise InvoiceValidationError("Číslo faktury nebo variabilní symbol už existuje.") from exc

    raise InvoiceValidationError("Cenovou nabídku se nepodařilo bezpečně převést.")


def create_tax_document_from_proforma_payment(db: Session, proforma_invoice_id: int, payment_id: int) -> Invoice:
    source_invoice = get_invoice_detail(db, proforma_invoice_id)
    source_document_meta = get_document_kind_metadata(source_invoice.document_kind)
    if not source_document_meta.supports_tax_document_generation:
        raise InvoiceValidationError("Daňový doklad lze vytvořit pouze z platby proformy.")

    payment = db.query(InvoicePayment).filter(InvoicePayment.id == payment_id).first()
    if payment is None:
        raise InvoicePaymentNotFoundError("Platba faktury nebyla nalezena.")
    if payment.invoice_id != source_invoice.id:
        raise InvoiceValidationError("Platba nepatří k zadané proformě.")

    payment_amount = _quantize_money(Decimal(payment.amount))
    if payment_amount <= Decimal("0.00"):
        raise InvoiceValidationError("Daňový doklad lze vytvořit pouze z kladné přijaté platby.")
    if _tax_document_relation_exists(db, source_payment_id=payment.id):
        raise InvoiceValidationError("Daňový doklad pro tuto platbu už existuje.")

    generated_item = _build_tax_document_item(source_invoice, payment_amount)
    generated_totals = _build_tax_document_totals_from_payment(
        tax_mode=source_invoice.tax_mode,
        vat_rate=Decimal(source_invoice.vat_rate) if source_invoice.vat_rate is not None else None,
        payment_amount=payment_amount,
        reverse_charge_reason=source_invoice.reverse_charge_reason,
        reverse_charge_text=source_invoice.reverse_charge_text,
    )
    issue_date = payment.paid_at or date.today()
    due_date = issue_date

    for attempt in range(2):
        try:
            reserved_sequence = reserve_invoice_sequence(
                db,
                document_kind="tax_document",
                reference_date=issue_date,
            )
            generated_invoice = Invoice(
                invoice_number=reserved_sequence.invoice_number,
                variable_symbol=reserved_sequence.variable_symbol,
                issue_date=issue_date,
                due_date=due_date,
                issuer_name=source_invoice.issuer_name,
                issuer_address=source_invoice.issuer_address,
                issuer_city=source_invoice.issuer_city,
                issuer_zip=source_invoice.issuer_zip,
                issuer_ico=source_invoice.issuer_ico,
                issuer_dic=source_invoice.issuer_dic,
                issuer_data_box=source_invoice.issuer_data_box,
                customer_name=source_invoice.customer_name,
                customer_email=source_invoice.customer_email,
                customer_phone=source_invoice.customer_phone,
                customer_address=source_invoice.customer_address,
                customer_ico=source_invoice.customer_ico,
                customer_dic=source_invoice.customer_dic,
                note=source_invoice.note,
                document_kind="tax_document",
                business_mode=source_invoice.business_mode,
                tax_mode=source_invoice.tax_mode,
                currency=source_invoice.currency,
                subtotal=generated_totals.subtotal,
                vat_rate=generated_totals.vat_rate,
                vat_amount=generated_totals.vat_amount,
                total=generated_totals.total,
                status="issued",
                reverse_charge_reason=generated_totals.reverse_charge_reason,
                reverse_charge_text=generated_totals.reverse_charge_text,
                payment_method=source_invoice.payment_method,
                bank_account_number=source_invoice.bank_account_number,
                bank_account_prefix=source_invoice.bank_account_prefix,
                bank_code=source_invoice.bank_code,
                bank_iban=source_invoice.bank_iban,
            )
            generated_invoice.items = [
                InvoiceItem(
                    description=generated_item.description,
                    quantity=generated_item.quantity,
                    unit_price=generated_item.unit_price,
                    line_total=generated_item.line_total,
                )
            ]
            db.add(generated_invoice)
            db.flush()
            db.add(
                InvoiceDocumentRelation(
                    source_invoice_id=source_invoice.id,
                    target_invoice_id=generated_invoice.id,
                    source_payment_id=payment.id,
                    relation_type=RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT,
                )
            )
            create_accounting_event(
                db,
                event_type="generated",
                entity_type="invoice",
                entity_id=generated_invoice.id,
                invoice_id=generated_invoice.id,
                subject_id=source_invoice.subject_id,
                source="generation",
                new_values=_build_invoice_summary(generated_invoice),
                metadata={
                    "source_invoice_id": source_invoice.id,
                    "source_payment_id": payment.id,
                    "relation_type": RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT,
                },
            )
            create_accounting_event(
                db,
                event_type="linked",
                entity_type="document_relation",
                entity_id=generated_invoice.id,
                invoice_id=source_invoice.id,
                subject_id=source_invoice.subject_id,
                source="generation",
                new_values={
                    "source_invoice_id": source_invoice.id,
                    "target_invoice_id": generated_invoice.id,
                    "source_payment_id": payment.id,
                    "relation_type": RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT,
                },
            )
            db.commit()
            created_invoice = get_invoice_detail(db, generated_invoice.id)
            _cache_invoice_nonfatal(created_invoice)
            return created_invoice
        except IntegrityError as exc:
            db.rollback()
            if _tax_document_relation_exists(db, source_payment_id=payment.id):
                raise InvoiceValidationError("Daňový doklad pro tuto platbu už existuje.") from exc
            if attempt > 0:
                raise InvoiceValidationError("Číslo faktury nebo variabilní symbol už existuje.") from exc

    raise InvoiceValidationError("Daňový doklad se nepodařilo bezpečně vytvořit.")


def create_final_invoice_from_proformas(db: Session, payload: FinalInvoiceCreateRequest) -> Invoice:
    settings = get_invoice_settings(db)
    source_invoices = [get_invoice_detail(db, invoice_id) for invoice_id in payload.source_proforma_ids]
    _validate_final_invoice_source_invoices(source_invoices)
    _ensure_final_invoice_sources_are_available(db, [invoice.id for invoice in source_invoices])

    primary_source = source_invoices[0]
    issue_date = payload.issue_date or date.today()
    due_date = payload.due_date or issue_date + timedelta(days=settings.invoice_defaults.default_due_days)
    if due_date < issue_date:
        raise InvoiceValidationError("Datum splatnosti nemůže být dříve než datum vystavení.")

    prepared_items = _build_final_invoice_items(source_invoices)
    totals = _calculate_totals(
        tax_mode=primary_source.tax_mode,
        vat_rate=Decimal(primary_source.vat_rate) if primary_source.vat_rate is not None else None,
        line_totals=[item.line_total for item in prepared_items],
    )
    resolved_note = payload.note if payload.note is not None else primary_source.note

    for attempt in range(2):
        try:
            reserved_sequence = reserve_invoice_sequence(
                db,
                document_kind="final_invoice",
                reference_date=issue_date,
            )
            generated_invoice = Invoice(
                invoice_number=reserved_sequence.invoice_number,
                variable_symbol=reserved_sequence.variable_symbol,
                issue_date=issue_date,
                due_date=due_date,
                issuer_name=primary_source.issuer_name,
                issuer_address=primary_source.issuer_address,
                issuer_city=primary_source.issuer_city,
                issuer_zip=primary_source.issuer_zip,
                issuer_ico=primary_source.issuer_ico,
                issuer_dic=primary_source.issuer_dic,
                issuer_data_box=primary_source.issuer_data_box,
                customer_name=primary_source.customer_name,
                customer_email=primary_source.customer_email,
                customer_phone=primary_source.customer_phone,
                customer_address=primary_source.customer_address,
                customer_ico=primary_source.customer_ico,
                customer_dic=primary_source.customer_dic,
                note=resolved_note,
                document_kind="final_invoice",
                business_mode=primary_source.business_mode,
                tax_mode=primary_source.tax_mode,
                currency=primary_source.currency,
                subtotal=totals.subtotal,
                vat_rate=totals.vat_rate,
                vat_amount=totals.vat_amount,
                total=totals.total,
                status="issued",
                reverse_charge_reason=totals.reverse_charge_reason,
                reverse_charge_text=totals.reverse_charge_text,
                payment_method=primary_source.payment_method,
                bank_account_number=primary_source.bank_account_number,
                bank_account_prefix=primary_source.bank_account_prefix,
                bank_code=primary_source.bank_code,
                bank_iban=primary_source.bank_iban,
            )
            generated_invoice.items = [
                InvoiceItem(
                    description=item.description,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    line_total=item.line_total,
                )
                for item in prepared_items
            ]
            db.add(generated_invoice)
            db.flush()
            db.add_all(
                [
                    InvoiceDocumentRelation(
                        source_invoice_id=source_invoice.id,
                        target_invoice_id=generated_invoice.id,
                        source_payment_id=None,
                        relation_type=RELATION_TYPE_FINAL_INVOICE_FOR_PROFORMA,
                    )
                    for source_invoice in source_invoices
                ]
            )
            create_accounting_event(
                db,
                event_type="generated",
                entity_type="invoice",
                entity_id=generated_invoice.id,
                invoice_id=generated_invoice.id,
                subject_id=primary_source.subject_id,
                source="generation",
                new_values=_build_invoice_summary(generated_invoice),
                metadata={
                    "source_invoice_ids": [source_invoice.id for source_invoice in source_invoices],
                    "relation_type": RELATION_TYPE_FINAL_INVOICE_FOR_PROFORMA,
                },
            )
            for source_invoice in source_invoices:
                create_accounting_event(
                    db,
                    event_type="linked",
                    entity_type="document_relation",
                    entity_id=generated_invoice.id,
                    invoice_id=source_invoice.id,
                    subject_id=source_invoice.subject_id,
                    source="generation",
                    new_values={
                        "source_invoice_id": source_invoice.id,
                        "target_invoice_id": generated_invoice.id,
                        "relation_type": RELATION_TYPE_FINAL_INVOICE_FOR_PROFORMA,
                    },
                )
            db.commit()
            created_invoice = get_invoice_detail(db, generated_invoice.id)
            _cache_invoice_nonfatal(created_invoice)
            return created_invoice
        except IntegrityError as exc:
            db.rollback()
            if any(_final_invoice_relation_exists(db, source_invoice_id=invoice.id) for invoice in source_invoices):
                raise InvoiceValidationError("K některé z vybraných proforem už byla vytvořena konečná faktura.") from exc
            if attempt > 0:
                raise InvoiceValidationError("Číslo faktury nebo variabilní symbol už existuje.") from exc

    raise InvoiceValidationError("Konečnou fakturu se nepodařilo bezpečně vytvořit.")


def create_correction_from_invoice(
    db: Session,
    source_invoice_id: int,
    payload: CorrectionInvoiceCreateRequest,
) -> Invoice:
    source_invoice = get_invoice_detail(db, source_invoice_id)
    _validate_correction_source_invoice(source_invoice)
    if _correction_relation_exists(db, source_invoice_id=source_invoice.id):
        raise InvoiceValidationError("Pro tento doklad už byl vytvořen opravný doklad.")

    prepared_items = [_build_negative_item_from_snapshot(item) for item in source_invoice.items]
    totals = _calculate_totals(
        tax_mode=source_invoice.tax_mode,
        vat_rate=Decimal(source_invoice.vat_rate) if source_invoice.vat_rate is not None else None,
        line_totals=[item.line_total for item in prepared_items],
    )
    if totals.total >= Decimal("0.00"):
        raise InvoiceValidationError("Opravný doklad lze vytvořit jen z dokladu s kladnou částkou.")

    issue_date = payload.issue_date or date.today()
    due_date = issue_date
    resolved_note = _compose_correction_note(source_invoice, reason=payload.reason, note=payload.note)

    for attempt in range(2):
        try:
            reserved_sequence = reserve_invoice_sequence(
                db,
                document_kind="correction",
                reference_date=issue_date,
            )
            generated_invoice = Invoice(
                invoice_number=reserved_sequence.invoice_number,
                variable_symbol=reserved_sequence.variable_symbol,
                issue_date=issue_date,
                due_date=due_date,
                issuer_name=source_invoice.issuer_name,
                issuer_address=source_invoice.issuer_address,
                issuer_city=source_invoice.issuer_city,
                issuer_zip=source_invoice.issuer_zip,
                issuer_ico=source_invoice.issuer_ico,
                issuer_dic=source_invoice.issuer_dic,
                issuer_data_box=source_invoice.issuer_data_box,
                customer_name=source_invoice.customer_name,
                customer_email=source_invoice.customer_email,
                customer_phone=source_invoice.customer_phone,
                customer_address=source_invoice.customer_address,
                customer_ico=source_invoice.customer_ico,
                customer_dic=source_invoice.customer_dic,
                note=resolved_note,
                document_kind="correction",
                business_mode=source_invoice.business_mode,
                tax_mode=source_invoice.tax_mode,
                currency=source_invoice.currency,
                subtotal=totals.subtotal,
                vat_rate=totals.vat_rate,
                vat_amount=totals.vat_amount,
                total=totals.total,
                status="issued",
                reverse_charge_reason=totals.reverse_charge_reason,
                reverse_charge_text=totals.reverse_charge_text,
                payment_method=source_invoice.payment_method,
                bank_account_number=source_invoice.bank_account_number,
                bank_account_prefix=source_invoice.bank_account_prefix,
                bank_code=source_invoice.bank_code,
                bank_iban=source_invoice.bank_iban,
            )
            generated_invoice.items = [
                InvoiceItem(
                    description=item.description,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    line_total=item.line_total,
                )
                for item in prepared_items
            ]
            db.add(generated_invoice)
            db.flush()
            db.add(
                InvoiceDocumentRelation(
                    source_invoice_id=source_invoice.id,
                    target_invoice_id=generated_invoice.id,
                    source_payment_id=None,
                    relation_type=RELATION_TYPE_CORRECTION_FOR_INVOICE,
                )
            )
            create_accounting_event(
                db,
                event_type="generated",
                entity_type="invoice",
                entity_id=generated_invoice.id,
                invoice_id=generated_invoice.id,
                subject_id=source_invoice.subject_id,
                source="generation",
                new_values=_build_invoice_summary(generated_invoice),
                metadata={
                    "source_invoice_id": source_invoice.id,
                    "relation_type": RELATION_TYPE_CORRECTION_FOR_INVOICE,
                },
            )
            create_accounting_event(
                db,
                event_type="linked",
                entity_type="document_relation",
                entity_id=generated_invoice.id,
                invoice_id=source_invoice.id,
                subject_id=source_invoice.subject_id,
                source="generation",
                new_values={
                    "source_invoice_id": source_invoice.id,
                    "target_invoice_id": generated_invoice.id,
                    "relation_type": RELATION_TYPE_CORRECTION_FOR_INVOICE,
                },
            )
            db.commit()
            created_invoice = get_invoice_detail(db, generated_invoice.id)
            _cache_invoice_nonfatal(created_invoice)
            return created_invoice
        except IntegrityError as exc:
            db.rollback()
            if _correction_relation_exists(db, source_invoice_id=source_invoice.id):
                raise InvoiceValidationError("Pro tento doklad už byl vytvořen opravný doklad.") from exc
            if attempt > 0:
                raise InvoiceValidationError("Číslo faktury nebo variabilní symbol už existuje.") from exc

    raise InvoiceValidationError("Opravný doklad se nepodařilo bezpečně vytvořit.")


def _create_invoice_payment_record(
    db: Session,
    *,
    invoice: Invoice,
    amount: Decimal,
    paid_at: date,
    payment_method: str,
    note: str | None,
) -> InvoicePayment:
    if amount <= 0:
        raise InvoiceValidationError("Částka platby musí být větší než nula.")
    if not get_document_kind_metadata(invoice.document_kind).allows_payment_tracking:
        raise InvoiceValidationError("Pro tento typ dokladu zatím nelze evidovat platby.")
    if _normalize_invoice_status(invoice.status) == "cancelled":
        raise InvoiceValidationError("Ke stornované faktuře nelze přidat platbu.")

    summary = _build_payment_summary(invoice)
    next_total_paid = _quantize_money(summary.total_paid + amount)
    invoice_total = _quantize_money(Decimal(invoice.total))
    if next_total_paid > invoice_total:
        raise InvoiceValidationError("Součet plateb nesmí překročit celkovou částku faktury.")

    payment = InvoicePayment(
        invoice_id=invoice.id,
        amount=amount,
        paid_at=paid_at,
        payment_method=payment_method,
        note=note,
    )
    db.add(payment)
    db.flush()
    if "payments" in invoice.__dict__:
        invoice.payments.append(payment)
    return payment


def add_invoice_payment(db: Session, invoice_id: int, payload: InvoicePaymentCreate) -> Invoice:
    invoice = get_invoice_detail(db, invoice_id)
    payment = _create_invoice_payment_record(
        db,
        invoice=invoice,
        amount=_quantize_money(Decimal(payload.amount)),
        paid_at=payload.paid_at,
        payment_method=payload.payment_method,
        note=payload.note,
    )
    create_accounting_event(
        db,
        event_type="payment_added",
        entity_type="invoice_payment",
        entity_id=payment.id,
        invoice_id=invoice.id,
        subject_id=invoice.subject_id,
        source="admin_api",
        new_values=_build_invoice_payment_summary_payload(payment),
    )
    _auto_complete_open_todos_for_settled_invoice(db, invoice.id)
    db.commit()
    return get_invoice_detail(db, invoice.id)


def delete_invoice_payment(db: Session, invoice_id: int, payment_id: int) -> Invoice:
    invoice = get_invoice_detail(db, invoice_id)
    payment = next((item for item in invoice.payments if item.id == payment_id), None)
    if payment is None:
        raise InvoicePaymentNotFoundError("Platba faktury nebyla nalezena.")
    create_accounting_event(
        db,
        event_type="payment_deleted",
        entity_type="invoice_payment",
        entity_id=payment.id,
        invoice_id=invoice.id,
        subject_id=invoice.subject_id,
        source="admin_api",
        old_values=_build_invoice_payment_summary_payload(payment),
    )
    db.delete(payment)
    db.commit()
    return get_invoice_detail(db, invoice.id)


def generate_invoice_pdf(db: Session, invoice_id: int) -> InvoicePdfDocument:
    invoice = get_invoice_detail(db, invoice_id)
    return build_invoice_pdf_document(invoice)


def send_invoice_email(db: Session, invoice_id: int, to_email: str | None = None) -> InvoiceEmailDeliveryResult:
    invoice = get_invoice_detail(db, invoice_id)
    settings = get_invoice_settings(db)
    return deliver_invoice_email(invoice, to_email=to_email, owner_email=settings.owner_email)


def preview_invoice_reminder_email(
    db: Session,
    invoice_id: int,
    *,
    to_email: str | None = None,
    todo_id: int | None = None,
    subject: str | None = None,
    message: str | None = None,
) -> InvoiceReminderPreview:
    invoice = get_invoice_detail(db, invoice_id)
    todo = _resolve_invoice_reminder_todo(db, invoice=invoice, todo_id=todo_id)
    _validate_invoice_for_reminder(invoice)

    recipient_email = (to_email or invoice.customer_email or "").strip()
    if not recipient_email:
        raise InvoiceValidationError("Chybí e-mailová adresa příjemce upomínky.")

    reminder_type = _resolve_reminder_type(invoice, todo)
    generated_subject = subject or _build_default_reminder_subject(invoice, reminder_type=reminder_type)
    generated_message = message or _build_default_reminder_message(invoice, reminder_type=reminder_type)

    return InvoiceReminderPreview(
        invoice=invoice,
        todo_id=todo.id if todo is not None else None,
        reminder_type=reminder_type,
        recipient_email=recipient_email,
        subject=generated_subject,
        message=generated_message,
    )


def send_invoice_reminder_email(
    db: Session,
    invoice_id: int,
    *,
    to_email: str | None = None,
    todo_id: int | None = None,
    subject: str | None = None,
    message: str | None = None,
) -> InvoiceReminderSendResult:
    preview = preview_invoice_reminder_email(
        db,
        invoice_id,
        to_email=to_email,
        todo_id=todo_id,
        subject=subject,
        message=message,
    )
    settings = get_invoice_settings(db)
    reminder_email = InvoiceReminderEmail(
        invoice_id=preview.invoice.id,
        todo_id=preview.todo_id,
        reminder_type=_normalize_reminder_type(preview.reminder_type),
        status=_normalize_reminder_email_status(DEFAULT_REMINDER_EMAIL_STATUS),
        recipient_email=preview.recipient_email,
        subject=preview.subject,
        message=preview.message,
        sent_at=None,
        error_message=None,
    )
    db.add(reminder_email)
    db.flush()
    create_accounting_event(
        db,
        event_type="generated",
        entity_type="reminder_email",
        entity_id=reminder_email.id,
        invoice_id=preview.invoice.id,
        todo_id=preview.todo_id,
        reminder_email_id=reminder_email.id,
        source="email",
        new_values=_build_reminder_email_summary(reminder_email),
    )
    db.commit()

    try:
        delivery = deliver_invoice_reminder_email(
            preview.invoice,
            subject=preview.subject,
            message=preview.message,
            to_email=preview.recipient_email,
            owner_email=settings.owner_email,
        )
    except (InvoiceEmailConfigurationError, InvoiceEmailSendError) as exc:
        reminder_email.status = _normalize_reminder_email_status("failed")
        reminder_email.error_message = str(exc)
        reminder_email.sent_at = None
        db.add(reminder_email)
        create_accounting_event(
            db,
            event_type="email_failed",
            entity_type="reminder_email",
            entity_id=reminder_email.id,
            invoice_id=reminder_email.invoice_id,
            todo_id=reminder_email.todo_id,
            reminder_email_id=reminder_email.id,
            source="email",
            old_values={"status": DEFAULT_REMINDER_EMAIL_STATUS},
            new_values=_build_reminder_email_summary(reminder_email),
            metadata={"error_message": reminder_email.error_message},
        )
        db.commit()
        raise
    except Exception as exc:
        reminder_email.status = _normalize_reminder_email_status("failed")
        reminder_email.error_message = str(exc)
        reminder_email.sent_at = None
        db.add(reminder_email)
        create_accounting_event(
            db,
            event_type="email_failed",
            entity_type="reminder_email",
            entity_id=reminder_email.id,
            invoice_id=reminder_email.invoice_id,
            todo_id=reminder_email.todo_id,
            reminder_email_id=reminder_email.id,
            source="email",
            old_values={"status": DEFAULT_REMINDER_EMAIL_STATUS},
            new_values=_build_reminder_email_summary(reminder_email),
            metadata={"error_message": reminder_email.error_message},
        )
        db.commit()
        raise

    reminder_email.status = _normalize_reminder_email_status("sent")
    reminder_email.sent_at = _utc_now()
    reminder_email.error_message = None
    db.add(reminder_email)
    create_accounting_event(
        db,
        event_type="email_sent",
        entity_type="reminder_email",
        entity_id=reminder_email.id,
        invoice_id=reminder_email.invoice_id,
        todo_id=reminder_email.todo_id,
        reminder_email_id=reminder_email.id,
        source="email",
        old_values={"status": DEFAULT_REMINDER_EMAIL_STATUS},
        new_values=_build_reminder_email_summary(reminder_email),
    )
    db.commit()
    return InvoiceReminderSendResult(reminder_email=reminder_email, delivery=delivery)


def list_invoice_reminder_emails(db: Session, invoice_id: int) -> list[InvoiceReminderEmail]:
    _get_invoice_or_raise(db, invoice_id, include_items=False, include_payments=False, include_subject=False)
    return (
        db.query(InvoiceReminderEmail)
        .filter(InvoiceReminderEmail.invoice_id == invoice_id)
        .order_by(InvoiceReminderEmail.created_at.desc(), InvoiceReminderEmail.id.desc())
        .all()
    )


def list_invoice_attachments(
    db: Session,
    *,
    invoice_id: int | None = None,
    expense_id: int | None = None,
    todo_id: int | None = None,
    bank_transaction_id: int | None = None,
    attachment_type: str | None = None,
    status: str | None = None,
    unlinked_only: bool = False,
) -> list[InvoiceAttachment]:
    query = db.query(InvoiceAttachment)
    normalized_attachment_type = _normalize_attachment_type(attachment_type, allow_none=True)
    normalized_status = _normalize_attachment_status(status, allow_none=True)
    if invoice_id is not None:
        query = query.filter(InvoiceAttachment.invoice_id == invoice_id)
    if expense_id is not None:
        query = query.filter(InvoiceAttachment.expense_id == expense_id)
    if todo_id is not None:
        query = query.filter(InvoiceAttachment.todo_id == todo_id)
    if bank_transaction_id is not None:
        query = query.filter(InvoiceAttachment.bank_transaction_id == bank_transaction_id)
    if normalized_attachment_type is not None:
        query = query.filter(InvoiceAttachment.attachment_type == normalized_attachment_type)
    if normalized_status is not None:
        query = query.filter(InvoiceAttachment.status == normalized_status)
    if unlinked_only:
        query = query.filter(
            InvoiceAttachment.invoice_id.is_(None),
            InvoiceAttachment.expense_id.is_(None),
            InvoiceAttachment.todo_id.is_(None),
            InvoiceAttachment.bank_transaction_id.is_(None),
        )
    return query.order_by(InvoiceAttachment.created_at.desc(), InvoiceAttachment.id.desc()).all()


def get_invoice_attachment_detail(db: Session, attachment_id: int) -> InvoiceAttachment:
    return _get_invoice_attachment_or_raise(db, attachment_id)


def upload_invoice_attachment(
    db: Session,
    *,
    upload: UploadFile,
    attachment_type: str | None = None,
    note: str | None = None,
    invoice_id: int | None = None,
    expense_id: int | None = None,
    todo_id: int | None = None,
    bank_transaction_id: int | None = None,
) -> InvoiceAttachment:
    normalized_attachment_type = _normalize_attachment_type(attachment_type, allow_none=False)
    normalized_note = _normalize_optional_text(note)
    validated_links = _validate_attachment_links(
        db,
        invoice_id=invoice_id,
        expense_id=expense_id,
        todo_id=todo_id,
        bank_transaction_id=bank_transaction_id,
    )
    try:
        stored = store_invoice_attachment_file(upload)
    except InvoiceAttachmentStorageError as exc:
        raise InvoiceValidationError(str(exc)) from exc
    finally:
        upload.file.close()

    attachment = InvoiceAttachment(
        invoice_id=validated_links.invoice_id,
        expense_id=validated_links.expense_id,
        todo_id=validated_links.todo_id,
        bank_transaction_id=validated_links.bank_transaction_id,
        attachment_type=normalized_attachment_type,
        status=_resolve_attachment_status_from_links(validated_links),
        original_filename=stored.original_filename,
        stored_filename=stored.stored_filename,
        content_type=stored.content_type,
        size_bytes=stored.size_bytes,
        checksum_sha256=stored.checksum_sha256,
        note=normalized_note,
    )
    db.add(attachment)
    db.flush()
    create_accounting_event(
        db,
        event_type="uploaded",
        entity_type="attachment",
        entity_id=attachment.id,
        invoice_id=attachment.invoice_id,
        expense_id=attachment.expense_id,
        bank_transaction_id=attachment.bank_transaction_id,
        todo_id=attachment.todo_id,
        attachment_id=attachment.id,
        source="admin_api",
        new_values=_build_attachment_summary(attachment),
    )
    db.commit()
    return get_invoice_attachment_detail(db, attachment.id)


def link_invoice_attachment(db: Session, attachment_id: int, payload: InvoiceAttachmentLinkRequest) -> InvoiceAttachment:
    attachment = get_invoice_attachment_detail(db, attachment_id)
    before = _build_attachment_summary(attachment)
    validated_links = _validate_attachment_links(
        db,
        invoice_id=payload.invoice_id if "invoice_id" in payload.model_fields_set else attachment.invoice_id,
        expense_id=payload.expense_id if "expense_id" in payload.model_fields_set else attachment.expense_id,
        todo_id=payload.todo_id if "todo_id" in payload.model_fields_set else attachment.todo_id,
        bank_transaction_id=payload.bank_transaction_id
        if "bank_transaction_id" in payload.model_fields_set
        else attachment.bank_transaction_id,
    )
    attachment.invoice_id = validated_links.invoice_id
    attachment.expense_id = validated_links.expense_id
    attachment.todo_id = validated_links.todo_id
    attachment.bank_transaction_id = validated_links.bank_transaction_id
    attachment.status = _resolve_attachment_status_from_links(validated_links)
    db.add(attachment)
    create_accounting_event(
        db,
        event_type="linked",
        entity_type="attachment",
        entity_id=attachment.id,
        invoice_id=attachment.invoice_id,
        expense_id=attachment.expense_id,
        bank_transaction_id=attachment.bank_transaction_id,
        todo_id=attachment.todo_id,
        attachment_id=attachment.id,
        source="admin_api",
        old_values=before,
        new_values=_build_attachment_summary(attachment),
    )
    db.commit()
    return get_invoice_attachment_detail(db, attachment.id)


def archive_invoice_attachment(db: Session, attachment_id: int) -> InvoiceAttachment:
    attachment = get_invoice_attachment_detail(db, attachment_id)
    previous_status = attachment.status
    attachment.status = _normalize_attachment_status("archived")
    db.add(attachment)
    create_accounting_event(
        db,
        event_type="archived",
        entity_type="attachment",
        entity_id=attachment.id,
        invoice_id=attachment.invoice_id,
        expense_id=attachment.expense_id,
        bank_transaction_id=attachment.bank_transaction_id,
        todo_id=attachment.todo_id,
        attachment_id=attachment.id,
        source="admin_api",
        old_values={"status": previous_status},
        new_values={"status": attachment.status},
    )
    db.commit()
    return get_invoice_attachment_detail(db, attachment.id)


def delete_invoice_attachment(db: Session, attachment_id: int) -> int:
    attachment = get_invoice_attachment_detail(db, attachment_id)
    summary = _build_attachment_summary(attachment)
    create_accounting_event(
        db,
        event_type="deleted",
        entity_type="attachment",
        entity_id=attachment.id,
        invoice_id=attachment.invoice_id,
        expense_id=attachment.expense_id,
        bank_transaction_id=attachment.bank_transaction_id,
        todo_id=attachment.todo_id,
        attachment_id=attachment.id,
        source="admin_api",
        old_values=summary,
    )
    delete_invoice_attachment_file(attachment.stored_filename)
    db.delete(attachment)
    db.commit()
    return attachment_id


def get_invoice_attachment_download(db: Session, attachment_id: int) -> InvoiceAttachmentDownload:
    attachment = get_invoice_attachment_detail(db, attachment_id)
    if not attachment_file_exists(attachment.stored_filename):
        raise InvoiceValidationError("Soubor přílohy nebyl na disku nalezen.")
    return InvoiceAttachmentDownload(
        attachment=attachment,
        file_path=get_invoice_attachment_path(attachment.stored_filename),
    )


def list_accounting_events(
    db: Session,
    *,
    event_type: str | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    invoice_id: int | None = None,
    expense_id: int | None = None,
    subject_id: int | None = None,
    supplier_id: int | None = None,
    bank_transaction_id: int | None = None,
    payment_match_id: int | None = None,
    todo_id: int | None = None,
    attachment_id: int | None = None,
    recurring_template_id: int | None = None,
    reminder_email_id: int | None = None,
    source: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> list[InvoiceAccountingEvent]:
    query = db.query(InvoiceAccountingEvent)
    normalized_source = _normalize_accounting_event_source(source, allow_none=True)
    if event_type is not None and event_type.strip():
        query = query.filter(InvoiceAccountingEvent.event_type == event_type.strip())
    if entity_type is not None and entity_type.strip():
        query = query.filter(InvoiceAccountingEvent.entity_type == entity_type.strip())
    if entity_id is not None:
        query = query.filter(InvoiceAccountingEvent.entity_id == entity_id)
    if invoice_id is not None:
        query = query.filter(InvoiceAccountingEvent.invoice_id == invoice_id)
    if expense_id is not None:
        query = query.filter(InvoiceAccountingEvent.expense_id == expense_id)
    if subject_id is not None:
        query = query.filter(InvoiceAccountingEvent.subject_id == subject_id)
    if supplier_id is not None:
        query = query.filter(InvoiceAccountingEvent.supplier_id == supplier_id)
    if bank_transaction_id is not None:
        query = query.filter(InvoiceAccountingEvent.bank_transaction_id == bank_transaction_id)
    if payment_match_id is not None:
        query = query.filter(InvoiceAccountingEvent.payment_match_id == payment_match_id)
    if todo_id is not None:
        query = query.filter(InvoiceAccountingEvent.todo_id == todo_id)
    if attachment_id is not None:
        query = query.filter(InvoiceAccountingEvent.attachment_id == attachment_id)
    if recurring_template_id is not None:
        query = query.filter(InvoiceAccountingEvent.recurring_template_id == recurring_template_id)
    if reminder_email_id is not None:
        query = query.filter(InvoiceAccountingEvent.reminder_email_id == reminder_email_id)
    if normalized_source is not None:
        query = query.filter(InvoiceAccountingEvent.source == normalized_source)
    if date_from is not None:
        query = query.filter(InvoiceAccountingEvent.created_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc))
    if date_to is not None:
        query = query.filter(InvoiceAccountingEvent.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc))

    query = query.order_by(InvoiceAccountingEvent.created_at.desc(), InvoiceAccountingEvent.id.desc())
    if offset is not None and offset > 0:
        query = query.offset(offset)
    if limit is not None and limit > 0:
        query = query.limit(limit)
    return query.all()


def get_invoice_audit_events(db: Session, invoice_id: int) -> list[InvoiceAccountingEvent]:
    _get_invoice_or_raise(db, invoice_id, include_items=False, include_payments=False, include_subject=False)
    return list_accounting_events(db, invoice_id=invoice_id)


def get_expense_audit_events(db: Session, expense_id: int) -> list[InvoiceAccountingEvent]:
    _get_invoice_expense_or_raise(db, expense_id, include_items=False, include_payments=False)
    return list_accounting_events(db, expense_id=expense_id)


@dataclass(frozen=True)
class PreparedInvoiceItem:
    description: str
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal


@dataclass(frozen=True)
class InvoiceTotals:
    subtotal: Decimal
    vat_rate: Decimal | None
    vat_amount: Decimal
    total: Decimal
    reverse_charge_reason: str | None
    reverse_charge_text: str | None


@dataclass(frozen=True)
class InvoicePaymentSummary:
    total_paid: Decimal
    remaining_amount: Decimal
    payment_status: str
    effective_status: str


@dataclass(frozen=True)
class ExpenseSequencePreview:
    expense_number: str
    variable_symbol: str
    next_numeric_value: int
    padding: int
    sequence_key: str


@dataclass(frozen=True)
class InvoiceExpensePaymentSummary:
    total_paid: Decimal
    remaining_amount: Decimal
    payment_status: str
    effective_status: str


@dataclass(frozen=True)
class CustomerSnapshot:
    subject_id: int | None
    name: str
    email: str
    phone: str | None
    address: str
    ico: str | None
    dic: str | None


@dataclass(frozen=True)
class SupplierSnapshot:
    supplier_id: int | None
    name: str
    email: str
    phone: str | None
    address: str
    ico: str | None
    dic: str | None
    data_box: str | None
    country: str | None


@dataclass(frozen=True)
class AttachmentLinks:
    invoice_id: int | None
    expense_id: int | None
    todo_id: int | None
    bank_transaction_id: int | None


def _normalize_bank_transaction_status(value: str | None, *, allow_none: bool = False) -> str | None:
    if value is None:
        return None if allow_none else DEFAULT_BANK_TRANSACTION_STATUS
    cleaned = value.strip().lower()
    if not cleaned:
        return None if allow_none else DEFAULT_BANK_TRANSACTION_STATUS
    if cleaned not in STORED_BANK_TRANSACTION_STATUSES:
        supported = ", ".join(sorted(STORED_BANK_TRANSACTION_STATUSES))
        raise InvoiceValidationError(f"Neplatný stav bankovní transakce. Povolené hodnoty: {supported}.")
    return cleaned


def _normalize_bank_transaction_direction(value: str | None, *, allow_none: bool = False) -> str | None:
    if value is None:
        return None if allow_none else "incoming"
    cleaned = value.strip().lower()
    if not cleaned:
        return None if allow_none else "incoming"
    if cleaned not in STORED_BANK_TRANSACTION_DIRECTIONS:
        supported = ", ".join(sorted(STORED_BANK_TRANSACTION_DIRECTIONS))
        raise InvoiceValidationError(f"Neplatný směr bankovní transakce. Povolené hodnoty: {supported}.")
    return cleaned


def _normalize_payment_match_status(value: str | None, *, allow_none: bool = False) -> str | None:
    if value is None:
        return None if allow_none else DEFAULT_PAYMENT_MATCH_STATUS
    cleaned = value.strip().lower()
    if not cleaned:
        return None if allow_none else DEFAULT_PAYMENT_MATCH_STATUS
    if cleaned not in STORED_PAYMENT_MATCH_STATUSES:
        supported = ", ".join(sorted(STORED_PAYMENT_MATCH_STATUSES))
        raise InvoiceValidationError(f"Neplatný stav párování. Povolené hodnoty: {supported}.")
    return cleaned


def _normalize_payment_match_type(value: str) -> str:
    cleaned = value.strip().lower()
    if cleaned not in SUPPORTED_PAYMENT_MATCH_TYPES:
        supported = ", ".join(sorted(SUPPORTED_PAYMENT_MATCH_TYPES))
        raise InvoiceValidationError(f"Neplatný typ párování. Povolené hodnoty: {supported}.")
    return cleaned


def _normalize_recurring_template_type(value: str | None, *, allow_none: bool = False) -> str | None:
    if value is None:
        return None if allow_none else "invoice"
    cleaned = value.strip().lower()
    if not cleaned:
        return None if allow_none else "invoice"
    if cleaned not in STORED_RECURRING_TEMPLATE_TYPES:
        supported = ", ".join(sorted(STORED_RECURRING_TEMPLATE_TYPES))
        raise InvoiceValidationError(f"Neplatný typ recurring šablony. Povolené hodnoty: {supported}.")
    return cleaned


def _normalize_recurring_template_status(value: str | None, *, allow_none: bool = False) -> str | None:
    if value is None:
        return None if allow_none else DEFAULT_RECURRING_TEMPLATE_STATUS
    cleaned = value.strip().lower()
    if not cleaned:
        return None if allow_none else DEFAULT_RECURRING_TEMPLATE_STATUS
    if cleaned not in STORED_RECURRING_TEMPLATE_STATUSES:
        supported = ", ".join(sorted(STORED_RECURRING_TEMPLATE_STATUSES))
        raise InvoiceValidationError(f"Neplatný stav recurring šablony. Povolené hodnoty: {supported}.")
    return cleaned


def _normalize_recurring_interval(value: str) -> str:
    cleaned = value.strip().lower()
    if cleaned not in STORED_RECURRING_INTERVALS:
        supported = ", ".join(sorted(STORED_RECURRING_INTERVALS))
        raise InvoiceValidationError(f"Neplatný interval recurring šablony. Povolené hodnoty: {supported}.")
    return cleaned


def _normalize_invoice_status(value: str | None) -> str:
    if value in STORED_INVOICE_STATUSES:
        return value
    return DEFAULT_STATUS


def _normalize_expense_status(value: str | None) -> str:
    if value in STORED_EXPENSE_STATUSES:
        return value
    return DEFAULT_EXPENSE_STATUS


def _normalize_todo_status(value: str | None, *, allow_none: bool = False) -> str | None:
    if value is None:
        return None if allow_none else DEFAULT_TODO_STATUS
    if value in STORED_TODO_STATUSES:
        return value
    if allow_none:
        raise InvoiceValidationError("Neplatný stav todo.")
    raise InvoiceValidationError("Neplatný stav todo.")


def _normalize_relation_type_filter(value: str | None, *, allow_none: bool = False) -> str | None:
    if value is None:
        return None if allow_none else RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT
    cleaned = value.strip()
    if not cleaned:
        return None if allow_none else RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT
    if cleaned not in SUPPORTED_RELATION_TYPES:
        raise InvoiceValidationError("Neplatný typ relace.")
    return cleaned


def _normalize_todo_type(value: str | None, *, allow_none: bool = False) -> str | None:
    if value is None:
        return None if allow_none else "manual"
    cleaned = value.strip()
    if not cleaned:
        if allow_none:
            return None
        return "manual"
    supported = AUTO_INVOICE_TODO_TYPES | AUTO_EXPENSE_TODO_TYPES | {"manual"}
    if cleaned not in supported:
        raise InvoiceValidationError("Neplatný typ todo.")
    return cleaned


def _normalize_reminder_type(value: str | None, *, allow_none: bool = False) -> str | None:
    if value is None:
        return None if allow_none else "manual"
    cleaned = value.strip()
    if not cleaned:
        return None if allow_none else "manual"
    if cleaned not in STORED_REMINDER_TYPES:
        raise InvoiceValidationError("Neplatný typ upomínky.")
    return cleaned


def _normalize_reminder_email_status(value: str | None, *, allow_none: bool = False) -> str | None:
    if value is None:
        return None if allow_none else DEFAULT_REMINDER_EMAIL_STATUS
    cleaned = value.strip()
    if not cleaned:
        return None if allow_none else DEFAULT_REMINDER_EMAIL_STATUS
    if cleaned not in STORED_REMINDER_EMAIL_STATUSES:
        raise InvoiceValidationError("Neplatný stav reminder e-mailu.")
    return cleaned


def _normalize_attachment_type(value: str | None, *, allow_none: bool = False) -> str | None:
    if value is None:
        return None if allow_none else "other"
    cleaned = value.strip().lower()
    if not cleaned:
        return None if allow_none else "other"
    if cleaned not in STORED_ATTACHMENT_TYPES:
        raise InvoiceValidationError("Neplatný typ přílohy.")
    return cleaned


def _normalize_attachment_status(value: str | None, *, allow_none: bool = False) -> str | None:
    if value is None:
        return None if allow_none else DEFAULT_ATTACHMENT_STATUS
    cleaned = value.strip().lower()
    if not cleaned:
        return None if allow_none else DEFAULT_ATTACHMENT_STATUS
    if cleaned not in STORED_ATTACHMENT_STATUSES:
        raise InvoiceValidationError("Neplatný stav přílohy.")
    return cleaned


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _normalize_accounting_event_source(value: str | None, *, allow_none: bool = False) -> str | None:
    if value is None:
        return None if allow_none else "system"
    cleaned = value.strip().lower()
    if not cleaned:
        return None if allow_none else "system"
    if cleaned not in STORED_ACCOUNTING_EVENT_SOURCES:
        raise InvoiceValidationError("Neplatný zdroj auditní události.")
    return cleaned


def _serialize_accounting_event_payload(value):
    if value is None:
        return None
    return json.dumps(_sanitize_event_payload(value), ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _sanitize_event_payload(value):
    if isinstance(value, dict):
        sanitized: dict[str, object] = {}
        for key, item in value.items():
            if item is None:
                continue
            sanitized[str(key)] = _sanitize_event_payload(item)
        return sanitized
    if isinstance(value, (list, tuple, set)):
        return [_sanitize_event_payload(item) for item in value]
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return f"{value:.2f}"
    if isinstance(value, Path):
        return value.name
    return value


def _deserialize_accounting_event_payload(value: str | None):
    if value is None:
        return None
    return json.loads(value)


def _build_diff_payload(before: dict, after: dict) -> tuple[dict | None, dict | None]:
    old_values: dict[str, object] = {}
    new_values: dict[str, object] = {}
    for key in sorted(set(before) | set(after)):
        if before.get(key) != after.get(key):
            old_values[key] = before.get(key)
            new_values[key] = after.get(key)
    return (old_values or None, new_values or None)


def _build_invoice_summary(invoice: Invoice) -> dict:
    return {
        "id": invoice.id,
        "document_kind": normalize_document_kind(invoice.document_kind),
        "invoice_number": invoice.invoice_number,
        "variable_symbol": invoice.variable_symbol,
        "status": _normalize_invoice_status(invoice.status),
        "currency": invoice.currency,
        "total": f"{Decimal(invoice.total):.2f}",
        "due_date": invoice.due_date.isoformat(),
        "subject_id": invoice.subject_id,
    }


def _build_invoice_payment_summary_payload(payment: InvoicePayment) -> dict:
    return {
        "id": payment.id,
        "invoice_id": payment.invoice_id,
        "amount": f"{Decimal(payment.amount):.2f}",
        "paid_at": payment.paid_at.isoformat(),
        "payment_method": payment.payment_method,
        "note": payment.note,
    }


def _build_expense_summary(expense: InvoiceExpense) -> dict:
    return {
        "id": expense.id,
        "expense_number": expense.expense_number,
        "variable_symbol": expense.variable_symbol,
        "status": _normalize_expense_status(expense.status),
        "currency": expense.currency,
        "total": f"{Decimal(expense.total):.2f}",
        "supplier_id": expense.supplier_id,
        "due_date": expense.due_date.isoformat(),
    }


def _build_expense_payment_summary_payload(payment: InvoiceExpensePayment) -> dict:
    return {
        "id": payment.id,
        "expense_id": payment.expense_id,
        "amount": f"{Decimal(payment.amount):.2f}",
        "paid_at": payment.paid_at.isoformat(),
        "payment_method": payment.payment_method,
        "note": payment.note,
    }


def _build_subject_summary(subject: InvoiceSubject) -> dict:
    return {
        "id": subject.id,
        "name": subject.name,
        "email": subject.email,
        "ico": subject.ico,
        "dic": subject.dic,
        "country": subject.country,
    }


def _build_supplier_summary(supplier: InvoiceSupplier) -> dict:
    return {
        "id": supplier.id,
        "name": supplier.name,
        "email": supplier.email,
        "ico": supplier.ico,
        "dic": supplier.dic,
        "country": supplier.country,
    }


def _build_todo_summary(todo: InvoiceTodo) -> dict:
    return {
        "id": todo.id,
        "invoice_id": todo.invoice_id,
        "expense_id": todo.expense_id,
        "todo_type": todo.todo_type,
        "status": todo.status,
        "title": todo.title,
        "due_date": todo.due_date.isoformat(),
    }


def _build_bank_transaction_summary(transaction: InvoiceBankTransaction) -> dict:
    return {
        "id": transaction.id,
        "external_id": transaction.external_id,
        "transaction_date": transaction.transaction_date.isoformat(),
        "amount": f"{Decimal(transaction.amount):.2f}",
        "currency": transaction.currency,
        "direction": transaction.direction,
        "status": transaction.status,
        "variable_symbol": transaction.variable_symbol,
    }


def _build_payment_match_summary(match: InvoicePaymentMatch) -> dict:
    return {
        "id": match.id,
        "bank_transaction_id": match.bank_transaction_id,
        "invoice_id": match.invoice_id,
        "expense_id": match.expense_id,
        "match_type": match.match_type,
        "confidence": match.confidence,
        "status": match.status,
    }


def _build_payment_match_bank_transaction_summary(
    transaction: InvoiceBankTransaction,
) -> InvoicePaymentMatchBankTransactionSummary:
    return InvoicePaymentMatchBankTransactionSummary(
        id=transaction.id,
        transaction_date=transaction.transaction_date,
        booked_date=transaction.booked_date,
        amount=_quantize_money(Decimal(transaction.amount)),
        currency=transaction.currency,
        direction=_normalize_bank_transaction_direction(transaction.direction),
        variable_symbol=transaction.variable_symbol,
        message=transaction.message,
        status=_normalize_bank_transaction_status(transaction.status),
        counterparty_name=transaction.counterparty_name,
    )


def _build_payment_match_candidate_summary(
    *,
    invoice: Invoice | None,
    expense: InvoiceExpense | None,
) -> InvoicePaymentMatchCandidateSummary:
    if invoice is not None:
        payment_summary = _build_payment_summary(invoice)
        return InvoicePaymentMatchCandidateSummary(
            invoice_id=invoice.id,
            expense_id=None,
            document_number=invoice.invoice_number,
            variable_symbol=invoice.variable_symbol,
            counterparty_name=invoice.customer_name,
            total=_quantize_money(Decimal(invoice.total)),
            remaining_amount=payment_summary.remaining_amount,
            currency=invoice.currency,
        )

    if expense is not None:
        payment_summary = _build_expense_payment_summary(expense)
        return InvoicePaymentMatchCandidateSummary(
            invoice_id=None,
            expense_id=expense.id,
            document_number=expense.expense_number,
            variable_symbol=expense.variable_symbol,
            counterparty_name=expense.supplier_name,
            total=_quantize_money(Decimal(expense.total)),
            remaining_amount=payment_summary.remaining_amount,
            currency=expense.currency,
        )

    return InvoicePaymentMatchCandidateSummary(
        invoice_id=None,
        expense_id=None,
        document_number=None,
        variable_symbol=None,
        counterparty_name=None,
        total=None,
        remaining_amount=None,
        currency=None,
    )


def _build_payment_match_list_item_response(
    match: InvoicePaymentMatch,
    transaction: InvoiceBankTransaction,
    *,
    invoice: Invoice | None,
    expense: InvoiceExpense | None,
) -> InvoicePaymentMatchListItemResponse:
    return InvoicePaymentMatchListItemResponse(
        id=match.id,
        bank_transaction_id=match.bank_transaction_id,
        invoice_id=match.invoice_id,
        expense_id=match.expense_id,
        invoice_payment_id=match.invoice_payment_id,
        expense_payment_id=match.expense_payment_id,
        match_type=_normalize_payment_match_type(match.match_type),
        confidence=match.confidence,
        status=_normalize_payment_match_status(match.status),
        reason=match.reason,
        created_at=match.created_at,
        applied_at=match.applied_at,
        bank_transaction=_build_payment_match_bank_transaction_summary(transaction),
        candidate=_build_payment_match_candidate_summary(invoice=invoice, expense=expense),
    )


def _build_recurring_template_summary(template: InvoiceRecurringTemplate) -> dict:
    return {
        "id": template.id,
        "template_type": template.template_type,
        "document_kind": template.document_kind,
        "status": template.status,
        "name": template.name,
        "next_run_date": template.next_run_date.isoformat(),
        "subject_id": template.subject_id,
        "supplier_id": template.supplier_id,
    }


def _build_reminder_email_summary(reminder_email: InvoiceReminderEmail) -> dict:
    return {
        "id": reminder_email.id,
        "invoice_id": reminder_email.invoice_id,
        "todo_id": reminder_email.todo_id,
        "reminder_type": reminder_email.reminder_type,
        "status": reminder_email.status,
        "recipient_email": reminder_email.recipient_email,
    }


def _build_attachment_summary(attachment: InvoiceAttachment) -> dict:
    return {
        "id": attachment.id,
        "invoice_id": attachment.invoice_id,
        "expense_id": attachment.expense_id,
        "todo_id": attachment.todo_id,
        "bank_transaction_id": attachment.bank_transaction_id,
        "attachment_type": attachment.attachment_type,
        "status": attachment.status,
        "original_filename": attachment.original_filename,
        "content_type": attachment.content_type,
        "size_bytes": attachment.size_bytes,
        "checksum_sha256": attachment.checksum_sha256,
    }


def build_accounting_event_response(event: InvoiceAccountingEvent) -> InvoiceAccountingEventResponse:
    return InvoiceAccountingEventResponse(
        id=event.id,
        event_type=event.event_type,
        entity_type=event.entity_type,
        entity_id=event.entity_id,
        invoice_id=event.invoice_id,
        expense_id=event.expense_id,
        subject_id=event.subject_id,
        supplier_id=event.supplier_id,
        bank_transaction_id=event.bank_transaction_id,
        payment_match_id=event.payment_match_id,
        todo_id=event.todo_id,
        attachment_id=event.attachment_id,
        recurring_template_id=event.recurring_template_id,
        reminder_email_id=event.reminder_email_id,
        actor_type=event.actor_type,
        actor_id=event.actor_id,
        actor_email=event.actor_email,
        source=event.source,
        message=event.message,
        old_values=_deserialize_accounting_event_payload(event.old_values),
        new_values=_deserialize_accounting_event_payload(event.new_values),
        metadata=_deserialize_accounting_event_payload(event.event_metadata),
        created_at=event.created_at,
    )


def create_accounting_event(
    db: Session,
    *,
    event_type: str,
    entity_type: str,
    entity_id: int,
    source: str,
    invoice_id: int | None = None,
    expense_id: int | None = None,
    subject_id: int | None = None,
    supplier_id: int | None = None,
    bank_transaction_id: int | None = None,
    payment_match_id: int | None = None,
    todo_id: int | None = None,
    attachment_id: int | None = None,
    recurring_template_id: int | None = None,
    reminder_email_id: int | None = None,
    actor_type: str | None = None,
    actor_id: int | None = None,
    actor_email: str | None = None,
    message: str | None = None,
    old_values=None,
    new_values=None,
    metadata=None,
) -> InvoiceAccountingEvent:
    event = InvoiceAccountingEvent(
        event_type=event_type.strip(),
        entity_type=entity_type.strip(),
        entity_id=entity_id,
        invoice_id=invoice_id,
        expense_id=expense_id,
        subject_id=subject_id,
        supplier_id=supplier_id,
        bank_transaction_id=bank_transaction_id,
        payment_match_id=payment_match_id,
        todo_id=todo_id,
        attachment_id=attachment_id,
        recurring_template_id=recurring_template_id,
        reminder_email_id=reminder_email_id,
        actor_type=actor_type,
        actor_id=actor_id,
        actor_email=actor_email,
        source=_normalize_accounting_event_source(source),
        message=message,
        old_values=_serialize_accounting_event_payload(old_values),
        new_values=_serialize_accounting_event_payload(new_values),
        event_metadata=_serialize_accounting_event_payload(metadata),
    )
    db.add(event)
    db.flush()
    return event


def _resolve_invoice_reminder_todo(
    db: Session,
    *,
    invoice: Invoice,
    todo_id: int | None,
) -> InvoiceTodo | None:
    if todo_id is None:
        return None
    try:
        todo = get_invoice_todo_detail(db, todo_id)
    except InvoiceTodoNotFoundError as exc:
        raise InvoiceValidationError("Todo nebylo nalezeno.") from exc
    if todo.invoice_id != invoice.id:
        raise InvoiceValidationError("Todo nepatří k této faktuře.")
    if todo.expense_id is not None:
        raise InvoiceValidationError("Výdajové todo nelze použít pro fakturační upomínku.")
    if _normalize_todo_status(todo.status) != "open":
        raise InvoiceValidationError("Dokončené nebo zrušené todo nelze použít pro odeslání upomínky.")
    return todo


def _validate_invoice_for_reminder(invoice: Invoice) -> None:
    document_kind = normalize_document_kind(getattr(invoice, "document_kind", None))
    document_metadata = get_document_kind_metadata(document_kind)
    if document_kind == "quote":
        raise InvoiceValidationError("Cenové nabídce nelze odeslat platební upomínku.")
    if not document_metadata.allows_payment_tracking:
        raise InvoiceValidationError("Upomínku lze odeslat jen pro platební doklad.")
    if _normalize_invoice_status(invoice.status) == "cancelled" or getattr(invoice, "effective_status", None) == "cancelled":
        raise InvoiceValidationError("Zrušenému dokladu nelze odeslat upomínku.")
    remaining_amount = _quantize_money(Decimal(getattr(invoice, "remaining_amount", Decimal("0.00"))))
    if remaining_amount <= Decimal("0.00"):
        raise InvoiceValidationError("Doklad nemá žádný zbývající nedoplatek.")


def _resolve_reminder_type(invoice: Invoice, todo: InvoiceTodo | None) -> str:
    if todo is not None and todo.todo_type in STORED_REMINDER_TYPES:
        return todo.todo_type
    if getattr(invoice, "effective_status", None) == "overdue":
        return "invoice_overdue"
    if getattr(invoice, "payment_status", None) in {"unpaid", "partially_paid"}:
        return "invoice_payment_reminder"
    return "manual"


def _build_default_reminder_subject(invoice: Invoice, *, reminder_type: str) -> str:
    document_metadata = get_document_kind_metadata(invoice.document_kind)
    if reminder_type == "invoice_overdue":
        return f"Upomínka po splatnosti: {document_metadata.internal_label} {invoice.invoice_number}"
    if reminder_type == "invoice_payment_reminder":
        return f"Připomínka úhrady: {document_metadata.internal_label} {invoice.invoice_number}"
    return f"Upomínka k dokladu {invoice.invoice_number}"


def _build_default_reminder_message(invoice: Invoice, *, reminder_type: str) -> str:
    remaining_amount = _quantize_money(Decimal(getattr(invoice, "remaining_amount", Decimal("0.00"))))
    total_paid = _quantize_money(Decimal(getattr(invoice, "total_paid", Decimal("0.00"))))
    opening = (
        f"evidujeme, že doklad {invoice.invoice_number} je po splatnosti."
        if reminder_type == "invoice_overdue"
        else f"zasíláme připomínku k úhradě dokladu {invoice.invoice_number}."
    )
    lines = [
        "Dobrý den,",
        "",
        opening,
        f"Odběratel: {invoice.customer_name}",
        f"Datum splatnosti: {invoice.due_date.isoformat()}",
        f"Celkem: {_format_email_money(invoice.total)} {invoice.currency}",
        f"Uhrazeno: {_format_email_money(total_paid)} {invoice.currency}",
        f"Zbývá uhradit: {_format_email_money(remaining_amount)} {invoice.currency}",
    ]
    account_label = _build_invoice_account_label(invoice)
    if invoice.payment_method:
        lines.append(f"Způsob platby: {invoice.payment_method}")
    if account_label:
        lines.append(f"Bankovní účet: {account_label}")
    if invoice.bank_iban:
        lines.append(f"IBAN: {invoice.bank_iban}")
    if invoice.variable_symbol:
        lines.append(f"Variabilní symbol: {invoice.variable_symbol}")
    lines.extend(["", "Děkujeme."])
    return "\n".join(lines)


def _build_invoice_account_label(invoice: Invoice) -> str | None:
    if not invoice.bank_account_number or not invoice.bank_code:
        return None
    if invoice.bank_account_prefix:
        return f"{invoice.bank_account_prefix}-{invoice.bank_account_number}/{invoice.bank_code}"
    return f"{invoice.bank_account_number}/{invoice.bank_code}"


def _format_email_money(value: Decimal | str | int | float) -> str:
    return f"{Decimal(value):.2f}"


def _resolve_completed_at_for_status(status: str, *, current_value: datetime | None = None) -> datetime | None:
    if status == "completed":
        return current_value or _utc_now()
    return None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _should_prevent_open_todo_duplicate(
    *,
    todo_type: str,
    status: str,
    invoice_id: int | None,
    expense_id: int | None,
) -> bool:
    if status != "open":
        return False
    if todo_type in AUTO_INVOICE_TODO_TYPES and invoice_id is not None:
        return True
    if todo_type in AUTO_EXPENSE_TODO_TYPES and expense_id is not None:
        return True
    return False


def _auto_complete_open_todos_for_settled_invoice(db: Session, invoice_id: int) -> list[int]:
    invoice = get_invoice_detail(db, invoice_id)
    remaining_amount = _quantize_money(Decimal(getattr(invoice, "remaining_amount", Decimal("0.00"))))
    if remaining_amount > Decimal("0.00"):
        return []

    open_todos = (
        db.query(InvoiceTodo)
        .filter(
            InvoiceTodo.invoice_id == invoice_id,
            InvoiceTodo.status == "open",
        )
        .order_by(InvoiceTodo.id.asc())
        .all()
    )
    completed_ids: list[int] = []
    for todo in open_todos:
        previous_status = todo.status
        todo.status = "completed"
        todo.completed_at = _resolve_completed_at_for_status("completed", current_value=todo.completed_at)
        db.add(todo)
        create_accounting_event(
            db,
            event_type="status_changed",
            entity_type="todo",
            entity_id=todo.id,
            invoice_id=todo.invoice_id,
            expense_id=todo.expense_id,
            todo_id=todo.id,
            source="system",
            old_values={"status": previous_status},
            new_values={"status": todo.status, "completed_at": todo.completed_at},
            metadata={"reason": "invoice_fully_paid"},
        )
        completed_ids.append(todo.id)
    return completed_ids


def _auto_complete_open_todos_for_settled_expense(db: Session, expense_id: int) -> list[int]:
    expense = get_invoice_expense_detail(db, expense_id)
    remaining_amount = _quantize_money(Decimal(getattr(expense, "remaining_amount", Decimal("0.00"))))
    if remaining_amount > Decimal("0.00"):
        return []

    open_todos = (
        db.query(InvoiceTodo)
        .filter(
            InvoiceTodo.expense_id == expense_id,
            InvoiceTodo.status == "open",
        )
        .order_by(InvoiceTodo.id.asc())
        .all()
    )
    completed_ids: list[int] = []
    for todo in open_todos:
        previous_status = todo.status
        todo.status = "completed"
        todo.completed_at = _resolve_completed_at_for_status("completed", current_value=todo.completed_at)
        db.add(todo)
        create_accounting_event(
            db,
            event_type="status_changed",
            entity_type="todo",
            entity_id=todo.id,
            invoice_id=todo.invoice_id,
            expense_id=todo.expense_id,
            todo_id=todo.id,
            source="system",
            old_values={"status": previous_status},
            new_values={"status": todo.status, "completed_at": todo.completed_at},
            metadata={"reason": "expense_fully_paid"},
        )
        completed_ids.append(todo.id)
    return completed_ids


def _has_open_todo_duplicate(
    db: Session,
    *,
    todo_type: str,
    invoice_id: int | None = None,
    expense_id: int | None = None,
    exclude_todo_id: int | None = None,
) -> bool:
    query = db.query(InvoiceTodo.id).filter(
        InvoiceTodo.todo_type == todo_type,
        InvoiceTodo.status == "open",
    )
    if invoice_id is not None:
        query = query.filter(InvoiceTodo.invoice_id == invoice_id)
    else:
        query = query.filter(InvoiceTodo.invoice_id.is_(None))
    if expense_id is not None:
        query = query.filter(InvoiceTodo.expense_id == expense_id)
    else:
        query = query.filter(InvoiceTodo.expense_id.is_(None))
    if exclude_todo_id is not None:
        query = query.filter(InvoiceTodo.id != exclude_todo_id)
    return query.first() is not None


def _create_generated_todo(
    db: Session,
    *,
    invoice_id: int | None,
    expense_id: int | None,
    todo_type: str,
    title: str,
    message: str | None,
    due_date: date,
) -> InvoiceTodo:
    todo = InvoiceTodo(
        invoice_id=invoice_id,
        expense_id=expense_id,
        todo_type=todo_type,
        status="open",
        title=title,
        message=message,
        due_date=due_date,
        completed_at=None,
    )
    db.add(todo)
    db.flush()
    create_accounting_event(
        db,
        event_type="generated",
        entity_type="todo",
        entity_id=todo.id,
        invoice_id=todo.invoice_id,
        expense_id=todo.expense_id,
        todo_id=todo.id,
        source="system",
        new_values=_build_todo_summary(todo),
    )
    return todo


def _build_relation_views(
    db: Session,
    relations: list[InvoiceDocumentRelation],
) -> list[InvoiceDocumentRelationResponse]:
    if not relations:
        return []

    invoice_ids = {
        relation_invoice_id
        for relation in relations
        for relation_invoice_id in (relation.source_invoice_id, relation.target_invoice_id)
        if relation_invoice_id is not None
    }
    payment_ids = {relation.source_payment_id for relation in relations if relation.source_payment_id is not None}

    invoice_map = _load_relation_document_summaries(db, invoice_ids)
    payment_map = _load_relation_payment_summaries(db, payment_ids)

    return [
        InvoiceDocumentRelationResponse(
            id=relation.id,
            relation_type=relation.relation_type,
            source_invoice_id=relation.source_invoice_id,
            target_invoice_id=relation.target_invoice_id,
            source_payment_id=relation.source_payment_id,
            created_at=relation.created_at,
            source_document=invoice_map.get(relation.source_invoice_id),
            target_document=invoice_map.get(relation.target_invoice_id),
            source_payment=payment_map.get(relation.source_payment_id),
        )
        for relation in relations
    ]


def _load_relation_document_summaries(
    db: Session,
    invoice_ids: set[int],
) -> dict[int, InvoiceRelationDocumentSummaryResponse]:
    if not invoice_ids:
        return {}
    invoices = (
        db.query(Invoice)
        .options(selectinload(Invoice.payments))
        .filter(Invoice.id.in_(sorted(invoice_ids)))
        .all()
    )
    summary_map: dict[int, InvoiceRelationDocumentSummaryResponse] = {}
    for invoice in invoices:
        runtime_invoice = _attach_invoice_runtime_state(invoice)
        summary_map[invoice.id] = InvoiceRelationDocumentSummaryResponse(
            id=runtime_invoice.id,
            document_kind=runtime_invoice.document_kind,
            invoice_number=runtime_invoice.invoice_number,
            variable_symbol=runtime_invoice.variable_symbol,
            issue_date=runtime_invoice.issue_date,
            due_date=runtime_invoice.due_date,
            customer_name=runtime_invoice.customer_name,
            currency=runtime_invoice.currency,
            total=_quantize_money(Decimal(runtime_invoice.total)),
            effective_status=runtime_invoice.effective_status,
            payment_status=runtime_invoice.payment_status,
        )
    return summary_map


def _load_relation_payment_summaries(
    db: Session,
    payment_ids: set[int | None],
) -> dict[int, InvoiceRelationPaymentSummaryResponse]:
    normalized_payment_ids = sorted(payment_id for payment_id in payment_ids if payment_id is not None)
    if not normalized_payment_ids:
        return {}
    payments = db.query(InvoicePayment).filter(InvoicePayment.id.in_(normalized_payment_ids)).all()
    return {
        payment.id: InvoiceRelationPaymentSummaryResponse(
            id=payment.id,
            amount=_quantize_money(Decimal(payment.amount)),
            paid_at=payment.paid_at,
            payment_method=payment.payment_method,
            note=payment.note,
        )
        for payment in payments
    }


def _load_filtered_outgoing_invoices(
    db: Session,
    *,
    filters: OutgoingInvoiceFilters,
) -> list[Invoice]:
    query = db.query(Invoice).options(selectinload(Invoice.payments), selectinload(Invoice.subject))
    query_text = _normalize_optional_search_text(filters.query)
    customer_text = _normalize_optional_search_text(filters.customer_query)
    invoice_number = _normalize_optional_search_text(filters.invoice_number)
    status_filter = _normalize_optional_search_text(filters.status)
    currency_filter = _normalize_optional_search_text(filters.currency)

    if query_text:
        pattern = f"%{query_text}%"
        query = query.filter(
            or_(
                Invoice.invoice_number.ilike(pattern),
                Invoice.variable_symbol.ilike(pattern),
                Invoice.customer_name.ilike(pattern),
                Invoice.customer_ico.ilike(pattern),
                Invoice.customer_dic.ilike(pattern),
            )
        )
    if customer_text:
        pattern = f"%{customer_text}%"
        query = query.filter(
            or_(
                Invoice.customer_name.ilike(pattern),
                Invoice.customer_ico.ilike(pattern),
                Invoice.customer_dic.ilike(pattern),
            )
        )
    if invoice_number:
        pattern = f"%{invoice_number}%"
        query = query.filter(Invoice.invoice_number.ilike(pattern))
    if status_filter:
        query = query.filter(Invoice.status == status_filter)
    if currency_filter:
        query = query.filter(Invoice.currency == currency_filter.upper())
    if filters.issue_date_from is not None:
        query = query.filter(Invoice.issue_date >= filters.issue_date_from)
    if filters.issue_date_to is not None:
        query = query.filter(Invoice.issue_date <= filters.issue_date_to)
    if filters.due_date_from is not None:
        query = query.filter(Invoice.due_date >= filters.due_date_from)
    if filters.due_date_to is not None:
        query = query.filter(Invoice.due_date <= filters.due_date_to)

    invoices = [_attach_invoice_runtime_state(invoice) for invoice in query.all()]
    payment_status_filter = _normalize_optional_search_text(filters.payment_status)
    if payment_status_filter:
        invoices = [
            invoice
            for invoice in invoices
            if getattr(invoice, "payment_status", None) == payment_status_filter
        ]
    if filters.paid_date_from is not None or filters.paid_date_to is not None:
        invoices = [
            invoice
            for invoice in invoices
            if _invoice_has_payment_in_interval(
                invoice,
                date_from=filters.paid_date_from,
                date_to=filters.paid_date_to,
            )
        ]
    return invoices


def _invoice_has_payment_in_interval(
    invoice: Invoice,
    *,
    date_from: date | None,
    date_to: date | None,
) -> bool:
    for payment in invoice.payments:
        if date_from is not None and payment.paid_at < date_from:
            continue
        if date_to is not None and payment.paid_at > date_to:
            continue
        return True
    return False


def _build_outgoing_invoice_summary(
    *,
    filters: OutgoingInvoiceFilters,
    invoices: list[Invoice],
) -> OutgoingInvoiceSummary:
    grouped: dict[str, list[Invoice]] = {}
    for invoice in invoices:
        currency = (invoice.currency or "UNKNOWN").strip().upper()
        grouped.setdefault(currency, []).append(invoice)

    currency_summaries: list[OutgoingInvoiceCurrencySummary] = []
    for currency, currency_invoices in sorted(grouped.items()):
        currency_summaries.append(
            OutgoingInvoiceCurrencySummary(
                currency=currency,
                document_count=len(currency_invoices),
                invoiced_without_vat=_sum_decimal_field(currency_invoices, "subtotal"),
                vat=_sum_decimal_field(currency_invoices, "vat_amount"),
                invoiced_with_vat=_sum_decimal_field(currency_invoices, "total"),
                received_payments=_sum_runtime_decimal_field(currency_invoices, "total_paid"),
                outstanding_amount=_sum_runtime_decimal_field(currency_invoices, "remaining_amount"),
            )
        )
    return OutgoingInvoiceSummary(
        filters=filters,
        currencies=currency_summaries,
        document_count=len(invoices),
    )


def _sum_decimal_field(invoices: list[Invoice], field_name: str) -> Decimal:
    return _quantize_money(
        sum((Decimal(getattr(invoice, field_name)) for invoice in invoices), Decimal("0.00"))
    )


def _sum_runtime_decimal_field(invoices: list[Invoice], field_name: str) -> Decimal:
    return _quantize_money(
        sum((Decimal(getattr(invoice, field_name, Decimal("0.00"))) for invoice in invoices), Decimal("0.00"))
    )


def _sort_outgoing_invoices(invoices: list[Invoice], sort: str) -> list[Invoice]:
    if sort == "issue_date_asc":
        return sorted(invoices, key=lambda invoice: (invoice.issue_date, invoice.id))
    if sort == "due_date_asc":
        return sorted(invoices, key=lambda invoice: (invoice.due_date, invoice.id))
    if sort == "due_date_desc":
        return sorted(invoices, key=lambda invoice: (invoice.due_date, invoice.id), reverse=True)
    if sort == "total_asc":
        return sorted(invoices, key=lambda invoice: (Decimal(invoice.total), invoice.id))
    if sort == "total_desc":
        return sorted(invoices, key=lambda invoice: (Decimal(invoice.total), invoice.id), reverse=True)
    if sort == "invoice_number_asc":
        return sorted(invoices, key=lambda invoice: (invoice.invoice_number, invoice.id))
    if sort == "id_desc":
        return sorted(invoices, key=lambda invoice: invoice.id, reverse=True)
    return sorted(invoices, key=lambda invoice: (invoice.issue_date, invoice.id), reverse=True)


def _validate_invoice_filters(filters: OutgoingInvoiceFilters) -> None:
    _validate_optional_interval(filters.issue_date_from, filters.issue_date_to, "Datum vystaveni")
    _validate_optional_interval(filters.due_date_from, filters.due_date_to, "Datum splatnosti")
    _validate_optional_interval(filters.paid_date_from, filters.paid_date_to, "Datum uhrady")
    if filters.status is not None and filters.status not in STORED_INVOICE_STATUSES:
        supported = ", ".join(sorted(STORED_INVOICE_STATUSES))
        raise InvoiceValidationError(f"Neplatny stav faktury. Povolene hodnoty: {supported}.")
    if filters.payment_status is not None and filters.payment_status not in {
        "unpaid",
        "partially_paid",
        "paid",
        "not_payable",
    }:
        raise InvoiceValidationError("Neplatny stav uhrady faktury.")


def _validate_optional_interval(
    start: date | None,
    end: date | None,
    label: str,
) -> None:
    if start is not None and end is not None and end < start:
        raise InvoiceValidationError(f"{label}: konec intervalu nesmi byt pred zacatkem.")


def _normalize_ai_invoice_sort(value: str | None) -> str:
    normalized = (value or "issue_date_desc").strip()
    allowed = {
        "issue_date_desc",
        "issue_date_asc",
        "due_date_desc",
        "due_date_asc",
        "total_desc",
        "total_asc",
        "invoice_number_asc",
        "id_desc",
    }
    if normalized not in allowed:
        raise InvoiceValidationError("Neplatne razeni vydanych faktur.")
    return normalized


def _bounded_ai_limit(value: int) -> int:
    if value < 1 or value > 100:
        raise InvoiceValidationError("Limit musi byt v rozsahu 1 az 100.")
    return value


def _bounded_ai_offset(value: int) -> int:
    if value < 0 or value > 10000:
        raise InvoiceValidationError("Offset musi byt v rozsahu 0 az 10000.")
    return value


def _normalize_optional_search_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned[:256] if cleaned else None


def _build_payment_summary(invoice: Invoice, reference_date: date | None = None) -> InvoicePaymentSummary:
    invoice_total = _quantize_money(Decimal(invoice.total))
    document_metadata = get_document_kind_metadata(invoice.document_kind)
    normalized_document_kind = normalize_document_kind(invoice.document_kind)
    if normalized_document_kind == "quote":
        total_paid = Decimal("0.00")
        payment_status = "not_payable"
        remaining_amount = invoice_total
        effective_status = _compute_non_payment_effective_status(_normalize_invoice_status(invoice.status))
        return InvoicePaymentSummary(
            total_paid=total_paid,
            remaining_amount=remaining_amount,
            payment_status=payment_status,
            effective_status=effective_status,
        )

    total_paid = _quantize_money(
        sum((Decimal(payment.amount) for payment in invoice.payments), Decimal("0.00"))
    )
    if total_paid >= invoice_total and invoice_total > Decimal("0.00"):
        payment_status = "paid"
    elif total_paid > Decimal("0.00"):
        payment_status = "partially_paid"
    else:
        payment_status = "unpaid"

    remaining_amount = max(_quantize_money(invoice_total - total_paid), Decimal("0.00"))
    if document_metadata.allows_payment_tracking:
        effective_status = _compute_effective_status(
            stored_status=_normalize_invoice_status(invoice.status),
            due_date=invoice.due_date,
            payment_status=payment_status,
            total_paid=total_paid,
            invoice_total=invoice_total,
            reference_date=reference_date,
        )
    else:
        effective_status = _compute_non_payment_effective_status(_normalize_invoice_status(invoice.status))
    return InvoicePaymentSummary(
        total_paid=total_paid,
        remaining_amount=remaining_amount,
        payment_status=payment_status,
        effective_status=effective_status,
    )


def _build_expense_payment_summary(
    expense: InvoiceExpense,
    reference_date: date | None = None,
) -> InvoiceExpensePaymentSummary:
    expense_total = _quantize_money(Decimal(expense.total))
    total_paid = _quantize_money(
        sum((Decimal(payment.amount) for payment in expense.payments), Decimal("0.00"))
    )
    if total_paid >= expense_total and expense_total > Decimal("0.00"):
        payment_status = "paid"
    elif total_paid > Decimal("0.00"):
        payment_status = "partially_paid"
    else:
        payment_status = "unpaid"

    remaining_amount = max(_quantize_money(expense_total - total_paid), Decimal("0.00"))
    effective_status = _compute_expense_effective_status(
        stored_status=_normalize_expense_status(expense.status),
        due_date=expense.due_date,
        payment_status=payment_status,
        total_paid=total_paid,
        expense_total=expense_total,
        reference_date=reference_date,
    )
    return InvoiceExpensePaymentSummary(
        total_paid=total_paid,
        remaining_amount=remaining_amount,
        payment_status=payment_status,
        effective_status=effective_status,
    )


def _compute_effective_status(
    *,
    stored_status: str,
    due_date: date,
    payment_status: str,
    total_paid: Decimal,
    invoice_total: Decimal,
    reference_date: date | None = None,
) -> str:
    if stored_status == "cancelled":
        return "cancelled"
    if stored_status == "draft" and total_paid <= Decimal("0.00"):
        return "draft"
    if payment_status == "paid" and invoice_total > Decimal("0.00"):
        return "paid"
    if payment_status == "partially_paid" and total_paid > Decimal("0.00"):
        return "partially_paid"
    today = reference_date or date.today()
    if due_date < today:
        return "overdue"
    return "issued"


def _compute_expense_effective_status(
    *,
    stored_status: str,
    due_date: date,
    payment_status: str,
    total_paid: Decimal,
    expense_total: Decimal,
    reference_date: date | None = None,
) -> str:
    if stored_status == "cancelled":
        return "cancelled"
    if payment_status == "paid" and expense_total > Decimal("0.00"):
        return "paid"
    if payment_status == "partially_paid" and total_paid > Decimal("0.00"):
        return "partially_paid"
    today = reference_date or date.today()
    if due_date < today:
        return "overdue"
    return "open"


def _compute_non_payment_effective_status(stored_status: str) -> str:
    if stored_status == "cancelled":
        return "cancelled"
    if stored_status == "draft":
        return "draft"
    return "issued"


def _attach_invoice_runtime_state(invoice: Invoice) -> Invoice:
    normalized_document_kind = normalize_document_kind(getattr(invoice, "document_kind", None))
    setattr(invoice, "document_kind", normalized_document_kind)
    summary = _build_payment_summary(invoice)
    setattr(invoice, "total_paid", summary.total_paid)
    setattr(invoice, "remaining_amount", summary.remaining_amount)
    setattr(invoice, "payment_status", summary.payment_status)
    setattr(invoice, "effective_status", summary.effective_status)
    setattr(invoice, "subject_id", getattr(invoice, "subject_id", None))
    return invoice


def _attach_expense_runtime_state(expense: InvoiceExpense) -> InvoiceExpense:
    summary = _build_expense_payment_summary(expense)
    setattr(expense, "total_paid", summary.total_paid)
    setattr(expense, "remaining_amount", summary.remaining_amount)
    setattr(expense, "payment_status", summary.payment_status)
    setattr(expense, "effective_status", summary.effective_status)
    return expense


def _get_invoice_or_raise(
    db: Session,
    invoice_id: int,
    *,
    include_items: bool = False,
    include_payments: bool = True,
    include_subject: bool = True,
) -> Invoice:
    query = db.query(Invoice)
    if include_items:
        query = query.options(selectinload(Invoice.items))
    if include_payments:
        query = query.options(selectinload(Invoice.payments))
    if include_subject:
        query = query.options(selectinload(Invoice.subject))
    invoice = query.filter(Invoice.id == invoice_id).first()
    if invoice is None:
        raise InvoiceNotFoundError("Faktura nebyla nalezena.")
    return invoice


def _get_invoice_expense_or_raise(
    db: Session,
    expense_id: int,
    *,
    include_items: bool = False,
    include_payments: bool = True,
) -> InvoiceExpense:
    query = db.query(InvoiceExpense)
    if include_items:
        query = query.options(selectinload(InvoiceExpense.items))
    if include_payments:
        query = query.options(selectinload(InvoiceExpense.payments))
    expense = query.filter(InvoiceExpense.id == expense_id).first()
    if expense is None:
        raise InvoiceExpenseNotFoundError("Přijatý doklad nebyl nalezen.")
    return expense


def _get_invoice_bank_transaction_or_raise(db: Session, transaction_id: int) -> InvoiceBankTransaction:
    transaction = db.query(InvoiceBankTransaction).filter(InvoiceBankTransaction.id == transaction_id).first()
    if transaction is None:
        raise InvoiceBankTransactionNotFoundError("Bankovní transakce nebyla nalezena.")
    return transaction


def _get_invoice_attachment_or_raise(db: Session, attachment_id: int) -> InvoiceAttachment:
    attachment = db.query(InvoiceAttachment).filter(InvoiceAttachment.id == attachment_id).first()
    if attachment is None:
        raise InvoiceAttachmentNotFoundError("Příloha nebyla nalezena.")
    return attachment


def _get_invoice_payment_match_or_raise(
    db: Session,
    transaction_id: int,
    match_id: int,
) -> InvoicePaymentMatch:
    match = (
        db.query(InvoicePaymentMatch)
        .filter(
            InvoicePaymentMatch.id == match_id,
            InvoicePaymentMatch.bank_transaction_id == transaction_id,
        )
        .first()
    )
    if match is None:
        raise InvoicePaymentMatchNotFoundError("Návrh párování nebyl nalezen.")
    return match


def _get_invoice_recurring_template_or_raise(
    db: Session,
    template_id: int,
    *,
    include_items: bool = True,
) -> InvoiceRecurringTemplate:
    query = db.query(InvoiceRecurringTemplate)
    if include_items:
        query = query.options(selectinload(InvoiceRecurringTemplate.items))
    template = query.filter(InvoiceRecurringTemplate.id == template_id).first()
    if template is None:
        raise InvoiceRecurringTemplateNotFoundError("Recurring šablona nebyla nalezena.")
    return template


def _validate_todo_links(
    db: Session,
    *,
    invoice_id: int | None,
    expense_id: int | None,
    todo_type: str,
) -> tuple[int | None, int | None]:
    normalized_todo_type = _normalize_todo_type(todo_type)
    if invoice_id is not None and expense_id is not None:
        raise InvoiceValidationError("Todo může být navázáno buď na fakturu, nebo na výdaj, ne na obojí.")
    if normalized_todo_type in AUTO_INVOICE_TODO_TYPES:
        if invoice_id is None:
            raise InvoiceValidationError("Pro tento typ todo musíte vyplnit invoice_id.")
        try:
            _get_invoice_or_raise(db, invoice_id, include_payments=False, include_subject=False)
        except InvoiceNotFoundError as exc:
            raise InvoiceValidationError("Navázaná faktura nebyla nalezena.") from exc
        return invoice_id, None
    if normalized_todo_type in AUTO_EXPENSE_TODO_TYPES:
        if expense_id is None:
            raise InvoiceValidationError("Pro tento typ todo musíte vyplnit expense_id.")
        try:
            _get_invoice_expense_or_raise(db, expense_id, include_items=False, include_payments=False)
        except InvoiceExpenseNotFoundError as exc:
            raise InvoiceValidationError("Navázaný výdaj nebyl nalezen.") from exc
        return None, expense_id

    if invoice_id is not None:
        try:
            _get_invoice_or_raise(db, invoice_id, include_payments=False, include_subject=False)
        except InvoiceNotFoundError as exc:
            raise InvoiceValidationError("Navázaná faktura nebyla nalezena.") from exc
    if expense_id is not None:
        try:
            _get_invoice_expense_or_raise(db, expense_id, include_items=False, include_payments=False)
        except InvoiceExpenseNotFoundError as exc:
            raise InvoiceValidationError("Navázaný výdaj nebyl nalezen.") from exc
    return invoice_id, expense_id


def _validate_attachment_links(
    db: Session,
    *,
    invoice_id: int | None,
    expense_id: int | None,
    todo_id: int | None,
    bank_transaction_id: int | None,
) -> AttachmentLinks:
    if invoice_id is not None:
        try:
            _get_invoice_or_raise(db, invoice_id, include_items=False, include_payments=False, include_subject=False)
        except InvoiceNotFoundError as exc:
            raise InvoiceValidationError("Navázaná faktura nebyla nalezena.") from exc
    if expense_id is not None:
        try:
            _get_invoice_expense_or_raise(db, expense_id, include_items=False, include_payments=False)
        except InvoiceExpenseNotFoundError as exc:
            raise InvoiceValidationError("Navázaný výdaj nebyl nalezen.") from exc
    if todo_id is not None:
        try:
            get_invoice_todo_detail(db, todo_id)
        except InvoiceTodoNotFoundError as exc:
            raise InvoiceValidationError("Navázané todo nebylo nalezeno.") from exc
    if bank_transaction_id is not None:
        try:
            _get_invoice_bank_transaction_or_raise(db, bank_transaction_id)
        except InvoiceBankTransactionNotFoundError as exc:
            raise InvoiceValidationError("Navázaná bankovní transakce nebyla nalezena.") from exc
    return AttachmentLinks(
        invoice_id=invoice_id,
        expense_id=expense_id,
        todo_id=todo_id,
        bank_transaction_id=bank_transaction_id,
    )


def _resolve_attachment_status_from_links(links: AttachmentLinks) -> str:
    has_any_link = any(
        value is not None
        for value in (
            links.invoice_id,
            links.expense_id,
            links.todo_id,
            links.bank_transaction_id,
        )
    )
    return _normalize_attachment_status("linked" if has_any_link else "uploaded")


def _resolve_invoice_subject(db: Session, subject_id: int | None) -> InvoiceSubject | None:
    if subject_id is None:
        return None
    subject = db.query(InvoiceSubject).filter(InvoiceSubject.id == subject_id).first()
    if subject is None:
        raise InvoiceValidationError("Zvolený subjekt nebyl nalezen.")
    return subject


def _resolve_invoice_supplier(db: Session, supplier_id: int | None) -> InvoiceSupplier | None:
    if supplier_id is None:
        return None
    supplier = db.query(InvoiceSupplier).filter(InvoiceSupplier.id == supplier_id).first()
    if supplier is None:
        raise InvoiceValidationError("Zvolený dodavatel nebyl nalezen.")
    return supplier


def _resolve_customer_snapshot_for_create(payload: InvoiceCreate, subject: InvoiceSubject | None) -> CustomerSnapshot:
    if subject is not None:
        return _build_customer_snapshot_from_subject(subject)
    return CustomerSnapshot(
        subject_id=None,
        name=payload.customer_name or "",
        email=payload.customer_email or "",
        phone=payload.customer_phone,
        address=payload.customer_address or "",
        ico=payload.customer_ico,
        dic=payload.customer_dic,
    )


def _resolve_customer_snapshot_for_update(
    *,
    invoice: Invoice,
    payload: InvoiceUpdate,
    subject: InvoiceSubject | None,
) -> CustomerSnapshot:
    if "subject_id" in payload.model_fields_set and payload.subject_id is not None:
        assert subject is not None
        return _build_customer_snapshot_from_subject(subject)
    if "subject_id" in payload.model_fields_set and payload.subject_id is None:
        return CustomerSnapshot(
            subject_id=None,
            name=payload.customer_name or "",
            email=payload.customer_email or "",
            phone=payload.customer_phone,
            address=payload.customer_address or "",
            ico=payload.customer_ico,
            dic=payload.customer_dic,
        )
    return CustomerSnapshot(
        subject_id=invoice.subject_id,
        name=payload.customer_name or "",
        email=payload.customer_email or "",
        phone=payload.customer_phone,
        address=payload.customer_address or "",
        ico=payload.customer_ico,
        dic=payload.customer_dic,
    )


def _build_customer_snapshot_from_subject(subject: InvoiceSubject) -> CustomerSnapshot:
    return CustomerSnapshot(
        subject_id=subject.id,
        name=subject.name,
        email=subject.email,
        phone=subject.phone,
        address=subject.address,
        ico=subject.ico,
        dic=subject.dic,
    )


def _resolve_supplier_snapshot_for_create(
    payload: InvoiceExpenseCreate,
    supplier: InvoiceSupplier | None,
) -> SupplierSnapshot:
    if supplier is not None:
        return _build_supplier_snapshot_from_supplier(supplier)
    return SupplierSnapshot(
        supplier_id=None,
        name=payload.supplier_name or "",
        email=payload.supplier_email or "",
        phone=payload.supplier_phone,
        address=payload.supplier_address or "",
        ico=payload.supplier_ico,
        dic=payload.supplier_dic,
        data_box=payload.supplier_data_box,
        country=payload.supplier_country,
    )


def _resolve_supplier_snapshot_for_update(
    *,
    expense: InvoiceExpense,
    payload: InvoiceExpenseUpdate,
    supplier: InvoiceSupplier | None,
) -> SupplierSnapshot:
    if "supplier_id" in payload.model_fields_set:
        if payload.supplier_id is not None:
            assert supplier is not None
            return _build_supplier_snapshot_from_supplier(supplier)
        linked_supplier_id = None
    else:
        linked_supplier_id = expense.supplier_id

    return SupplierSnapshot(
        supplier_id=linked_supplier_id,
        name=payload.supplier_name or "",
        email=payload.supplier_email or "",
        phone=payload.supplier_phone,
        address=payload.supplier_address or "",
        ico=payload.supplier_ico,
        dic=payload.supplier_dic,
        data_box=payload.supplier_data_box,
        country=payload.supplier_country,
    )


def _build_supplier_snapshot_from_supplier(supplier: InvoiceSupplier) -> SupplierSnapshot:
    return SupplierSnapshot(
        supplier_id=supplier.id,
        name=supplier.name,
        email=supplier.email,
        phone=supplier.phone,
        address=supplier.address,
        ico=supplier.ico,
        dic=supplier.dic,
        data_box=supplier.data_box,
        country=supplier.country,
    )


def _apply_supplier_snapshot_to_expense(expense: InvoiceExpense, snapshot: SupplierSnapshot) -> None:
    expense.supplier_id = snapshot.supplier_id
    expense.supplier_name = snapshot.name
    expense.supplier_email = snapshot.email
    expense.supplier_phone = snapshot.phone
    expense.supplier_address = snapshot.address
    expense.supplier_ico = snapshot.ico
    expense.supplier_dic = snapshot.dic
    expense.supplier_data_box = snapshot.data_box
    expense.supplier_country = snapshot.country


def _advance_recurring_run_date(base_date: date, *, interval: str, recurrence_count: int) -> date:
    normalized_interval = _normalize_recurring_interval(interval)
    if recurrence_count <= 0:
        raise InvoiceValidationError("recurrence_count musí být větší než nula.")
    if normalized_interval == "daily":
        return base_date + timedelta(days=recurrence_count)
    if normalized_interval == "weekly":
        return base_date + timedelta(weeks=recurrence_count)
    if normalized_interval == "monthly":
        return _add_months(base_date, recurrence_count)
    if normalized_interval == "quarterly":
        return _add_months(base_date, recurrence_count * 3)
    if normalized_interval == "yearly":
        return _add_months(base_date, recurrence_count * 12)
    raise InvoiceValidationError("Neplatný interval recurring šablony.")


def _add_months(base_date: date, months: int) -> date:
    total_month = (base_date.month - 1) + months
    year = base_date.year + total_month // 12
    month = (total_month % 12) + 1
    day = min(base_date.day, monthrange(year, month)[1])
    return date(year, month, day)


def _build_prepared_item_from_recurring_template_item(
    item: InvoiceRecurringTemplateItem,
) -> PreparedInvoiceItem:
    return PreparedInvoiceItem(
        description=item.description.strip(),
        quantity=_quantize_quantity(Decimal(item.quantity)),
        unit_price=_quantize_money(Decimal(item.unit_price)),
        line_total=_quantize_money(Decimal(item.line_total)),
    )


def _resolve_recurring_invoice_payment_settings(
    settings: InvoicePaymentSettingsProfile,
    template: InvoiceRecurringTemplate,
) -> InvoicePaymentSettingsProfile:
    has_override = any(
        value is not None
        for value in (
            template.payment_method,
            template.bank_account_number,
            template.bank_account_prefix,
            template.bank_code,
            template.bank_iban,
        )
    )
    if not has_override:
        return settings

    account_number = template.bank_account_number or settings.payment_profile.account_number
    bank_code = template.bank_code or settings.payment_profile.bank_code
    account_prefix = (
        template.bank_account_prefix
        if template.bank_account_prefix is not None
        else settings.payment_profile.account_prefix
    )
    iban = template.bank_iban or build_czech_iban(
        account_number=account_number,
        bank_code=bank_code,
        account_prefix=account_prefix,
    )
    payment_profile = PaymentProfile(
        payment_method=template.payment_method or settings.payment_profile.payment_method,
        account_number=account_number,
        account_prefix=account_prefix,
        bank_code=bank_code,
        iban=iban,
    )
    return replace(settings, payment_profile=payment_profile)


def _generate_invoice_document_from_recurring_template(
    db: Session,
    template: InvoiceRecurringTemplate,
    *,
    run_date: date,
) -> Invoice:
    settings = get_invoice_settings(db)
    subject = _resolve_invoice_subject(db, template.subject_id)
    if subject is None:
        raise InvoiceValidationError("Recurring invoice/proforma template vyžaduje platný subject_id.")
    customer_snapshot = _build_customer_snapshot_from_subject(subject)
    prepared_items = [_build_prepared_item_from_recurring_template_item(item) for item in template.items]
    totals = _calculate_totals(
        tax_mode=template.tax_mode or "standard",
        vat_rate=Decimal(template.vat_rate) if template.vat_rate is not None else None,
        line_totals=[item.line_total for item in prepared_items],
    )
    payment_settings = _resolve_recurring_invoice_payment_settings(settings, template)
    due_date = run_date + timedelta(days=settings.invoice_defaults.default_due_days)
    payload = InvoiceCreate(
        invoice_number=None,
        document_kind=template.document_kind or DEFAULT_DOCUMENT_KIND,
        status="issued",
        issue_date=run_date,
        due_date=due_date,
        subject_id=subject.id,
        customer_name=None,
        customer_email=None,
        customer_phone=None,
        customer_address=None,
        customer_ico=None,
        customer_dic=None,
        note=template.note,
        business_mode=template.business_mode or "autoservice",
        tax_mode=template.tax_mode or "standard",
        currency=template.currency,
        vat_rate=Decimal(template.vat_rate) if template.vat_rate is not None else None,
        items=[
            {
                "description": item.description,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
            }
            for item in template.items
        ],
    )
    return _create_invoice_with_reserved_sequence(
        db=db,
        payload=payload,
        subject=subject,
        customer_snapshot=customer_snapshot,
        issuer=settings.issuer_profile,
        payment_settings=payment_settings,
        prepared_items=prepared_items,
        totals=totals,
        audit_source="generation",
        audit_metadata={"template_id": template.id, "run_date": run_date.isoformat()},
    )


def _generate_expense_document_from_recurring_template(
    db: Session,
    template: InvoiceRecurringTemplate,
    *,
    run_date: date,
) -> InvoiceExpense:
    supplier = _resolve_invoice_supplier(db, template.supplier_id)
    if supplier is None:
        raise InvoiceValidationError("Recurring expense template vyžaduje platný supplier_id.")
    payload = InvoiceExpenseCreate(
        expense_number=None,
        supplier_id=supplier.id,
        supplier_name=None,
        supplier_email=None,
        supplier_phone=None,
        supplier_address=None,
        supplier_ico=None,
        supplier_dic=None,
        supplier_data_box=None,
        supplier_country=None,
        issue_date=run_date,
        received_date=run_date,
        due_date=run_date + timedelta(days=DEFAULT_RECURRING_EXPENSE_DUE_DAYS),
        taxable_supply_date=run_date,
        currency=template.currency,
        vat_rate=Decimal(template.vat_rate) if template.vat_rate is not None else None,
        note=template.note,
        payment_method=template.payment_method or "Bankovní převod",
        bank_account_number=template.bank_account_number or "123456789",
        bank_account_prefix=template.bank_account_prefix,
        bank_code=template.bank_code or "0800",
        bank_iban=template.bank_iban,
        items=[
            {
                "description": item.description,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
            }
            for item in template.items
        ],
        status="open",
    )
    return create_invoice_expense(
        db,
        payload,
        audit_source="generation",
        audit_metadata={"template_id": template.id, "run_date": run_date.isoformat()},
    )


def _serialize_bank_transaction_raw_payload(value: object | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _compute_bank_transaction_fingerprint(item: InvoiceBankTransactionImportItem) -> str:
    fingerprint_payload = {
        "external_id": item.external_id,
        "account_iban": item.account_iban,
        "account_number": item.account_number,
        "bank_code": item.bank_code,
        "transaction_date": item.transaction_date.isoformat(),
        "booked_date": item.booked_date.isoformat() if item.booked_date is not None else None,
        "amount": f"{_quantize_money(Decimal(item.amount)):.2f}",
        "currency": item.currency,
        "variable_symbol": item.variable_symbol,
        "constant_symbol": item.constant_symbol,
        "specific_symbol": item.specific_symbol,
        "counterparty_name": item.counterparty_name,
        "counterparty_account": item.counterparty_account,
        "counterparty_iban": item.counterparty_iban,
        "message": item.message,
        "direction": _normalize_bank_transaction_direction(item.direction),
    }
    normalized = json.dumps(fingerprint_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _compose_bank_transaction_payment_note(transaction: InvoiceBankTransaction) -> str:
    parts = [f"Bankovní transakce #{transaction.id}"]
    if transaction.external_id:
        parts.append(f"external_id={transaction.external_id}")
    if transaction.variable_symbol:
        parts.append(f"VS={transaction.variable_symbol}")
    return " | ".join(parts)


def _transaction_has_any_applied_match(db: Session, transaction_id: int) -> bool:
    return (
        db.query(InvoicePaymentMatch.id)
        .filter(
            InvoicePaymentMatch.bank_transaction_id == transaction_id,
            InvoicePaymentMatch.status == "applied",
        )
        .first()
        is not None
    )


def _bank_transaction_duplicate_match_exists(
    db: Session,
    *,
    transaction_id: int,
    invoice_id: int | None = None,
    expense_id: int | None = None,
    match_type: str,
) -> bool:
    query = db.query(InvoicePaymentMatch.id).filter(
        InvoicePaymentMatch.bank_transaction_id == transaction_id,
        InvoicePaymentMatch.match_type == _normalize_payment_match_type(match_type),
    )
    if invoice_id is not None:
        query = query.filter(InvoicePaymentMatch.invoice_id == invoice_id)
    if expense_id is not None:
        query = query.filter(InvoicePaymentMatch.expense_id == expense_id)
    return query.first() is not None


def _create_match_suggestion(
    db: Session,
    *,
    transaction_id: int,
    invoice_id: int | None,
    expense_id: int | None,
    match_type: str,
    confidence: int,
    reason: str,
) -> None:
    normalized_match_type = _normalize_payment_match_type(match_type)
    if _bank_transaction_duplicate_match_exists(
        db,
        transaction_id=transaction_id,
        invoice_id=invoice_id,
        expense_id=expense_id,
        match_type=normalized_match_type,
    ):
        return
    db.add(
        InvoicePaymentMatch(
            bank_transaction_id=transaction_id,
            invoice_id=invoice_id,
            expense_id=expense_id,
            match_type=normalized_match_type,
            confidence=confidence,
            status=DEFAULT_PAYMENT_MATCH_STATUS,
            reason=reason,
        )
    )


def _load_invoice_bank_match_candidates(db: Session) -> list[Invoice]:
    invoices = (
        db.query(Invoice)
        .options(selectinload(Invoice.payments))
        .order_by(Invoice.id.asc())
        .all()
    )
    candidates: list[Invoice] = []
    for invoice in invoices:
        invoice = _attach_invoice_runtime_state(invoice)
        if not get_document_kind_metadata(invoice.document_kind).allows_payment_tracking:
            continue
        if getattr(invoice, "effective_status", None) == "cancelled":
            continue
        if _quantize_money(Decimal(getattr(invoice, "remaining_amount", Decimal("0.00")))) <= Decimal("0.00"):
            continue
        candidates.append(invoice)
    return candidates


def _load_expense_bank_match_candidates(db: Session) -> list[InvoiceExpense]:
    expenses = (
        db.query(InvoiceExpense)
        .options(selectinload(InvoiceExpense.payments))
        .order_by(InvoiceExpense.id.asc())
        .all()
    )
    candidates: list[InvoiceExpense] = []
    for expense in expenses:
        expense = _attach_expense_runtime_state(expense)
        if getattr(expense, "effective_status", None) == "cancelled":
            continue
        if _quantize_money(Decimal(getattr(expense, "remaining_amount", Decimal("0.00")))) <= Decimal("0.00"):
            continue
        candidates.append(expense)
    return candidates


def _generate_invoice_match_suggestions(db: Session, transaction: InvoiceBankTransaction) -> None:
    amount = _quantize_money(Decimal(transaction.amount))
    candidates = _load_invoice_bank_match_candidates(db)
    variable_symbol = (transaction.variable_symbol or "").strip()
    matched_by_vs: list[Invoice] = []
    if variable_symbol:
        for invoice in candidates:
            if invoice.variable_symbol != variable_symbol:
                continue
            matched_by_vs.append(invoice)
            remaining_amount = _quantize_money(Decimal(getattr(invoice, "remaining_amount", Decimal("0.00"))))
            if remaining_amount == amount:
                _create_match_suggestion(
                    db,
                    transaction_id=transaction.id,
                    invoice_id=invoice.id,
                    expense_id=None,
                    match_type="variable_symbol_amount",
                    confidence=100,
                    reason="Shoda variabilního symbolu a přesná shoda zbývající částky.",
                )
            else:
                _create_match_suggestion(
                    db,
                    transaction_id=transaction.id,
                    invoice_id=invoice.id,
                    expense_id=None,
                    match_type="variable_symbol_only",
                    confidence=80,
                    reason="Shoda variabilního symbolu, částka vyžaduje kontrolu nebo odpovídá částečné úhradě.",
                )

    amount_candidates = [
        invoice
        for invoice in candidates
        if _quantize_money(Decimal(getattr(invoice, "remaining_amount", Decimal("0.00")))) == amount
    ]
    if len(amount_candidates) == 1 and amount_candidates[0] not in matched_by_vs:
        invoice = amount_candidates[0]
        _create_match_suggestion(
            db,
            transaction_id=transaction.id,
            invoice_id=invoice.id,
            expense_id=None,
            match_type="amount_only",
            confidence=60,
            reason="Unikátní přesná shoda zbývající částky bez spolehlivého variabilního symbolu.",
        )


def _generate_expense_match_suggestions(db: Session, transaction: InvoiceBankTransaction) -> None:
    amount = _quantize_money(Decimal(transaction.amount))
    candidates = _load_expense_bank_match_candidates(db)
    variable_symbol = (transaction.variable_symbol or "").strip()
    matched_by_vs: list[InvoiceExpense] = []
    if variable_symbol:
        for expense in candidates:
            if expense.variable_symbol != variable_symbol:
                continue
            matched_by_vs.append(expense)
            remaining_amount = _quantize_money(Decimal(getattr(expense, "remaining_amount", Decimal("0.00"))))
            if remaining_amount == amount:
                _create_match_suggestion(
                    db,
                    transaction_id=transaction.id,
                    invoice_id=None,
                    expense_id=expense.id,
                    match_type="variable_symbol_amount",
                    confidence=100,
                    reason="Shoda variabilního symbolu a přesná shoda zbývající částky výdaje.",
                )
            else:
                _create_match_suggestion(
                    db,
                    transaction_id=transaction.id,
                    invoice_id=None,
                    expense_id=expense.id,
                    match_type="variable_symbol_only",
                    confidence=80,
                    reason="Shoda variabilního symbolu výdaje, částka vyžaduje kontrolu nebo odpovídá částečné úhradě.",
                )

    amount_candidates = [
        expense
        for expense in candidates
        if _quantize_money(Decimal(getattr(expense, "remaining_amount", Decimal("0.00")))) == amount
    ]
    if len(amount_candidates) == 1 and amount_candidates[0] not in matched_by_vs:
        expense = amount_candidates[0]
        _create_match_suggestion(
            db,
            transaction_id=transaction.id,
            invoice_id=None,
            expense_id=expense.id,
            match_type="amount_only",
            confidence=60,
            reason="Unikátní přesná shoda zbývající částky výdaje bez spolehlivého variabilního symbolu.",
        )


def _prepare_invoice_item(item) -> PreparedInvoiceItem:
    quantity = _quantize_quantity(Decimal(item.quantity))
    unit_price = _quantize_money(Decimal(item.unit_price))
    if quantity <= 0:
        raise InvoiceValidationError("Množství položky musí být větší než nula.")
    if unit_price < 0:
        raise InvoiceValidationError("Jednotková cena nemůže být záporná.")
    return PreparedInvoiceItem(
        description=item.description.strip(),
        quantity=quantity,
        unit_price=unit_price,
        line_total=_quantize_money(quantity * unit_price),
    )


def _build_prepared_item_from_snapshot(item: InvoiceItem) -> PreparedInvoiceItem:
    return PreparedInvoiceItem(
        description=item.description.strip(),
        quantity=_quantize_quantity(Decimal(item.quantity)),
        unit_price=_quantize_money(Decimal(item.unit_price)),
        line_total=_quantize_money(Decimal(item.line_total)),
    )


def _build_negative_item_from_snapshot(item: InvoiceItem) -> PreparedInvoiceItem:
    quantity = _quantize_quantity(Decimal(item.quantity))
    unit_price = _quantize_money(Decimal(item.unit_price) * Decimal("-1"))
    line_total = _quantize_money(Decimal(item.line_total) * Decimal("-1"))
    return PreparedInvoiceItem(
        description=item.description.strip(),
        quantity=quantity,
        unit_price=unit_price,
        line_total=line_total,
    )


def _build_tax_document_item(source_invoice: Invoice, payment_amount: Decimal) -> PreparedInvoiceItem:
    net_amount = _derive_tax_document_net_amount(
        tax_mode=source_invoice.tax_mode,
        vat_rate=Decimal(source_invoice.vat_rate) if source_invoice.vat_rate is not None else None,
        payment_amount=payment_amount,
    )
    return PreparedInvoiceItem(
        description=f"Přijatá platba k proformě {source_invoice.invoice_number}",
        quantity=Decimal("1.000"),
        unit_price=net_amount,
        line_total=net_amount,
    )


def _build_final_invoice_items(source_invoices: list[Invoice]) -> list[PreparedInvoiceItem]:
    prepared_items: list[PreparedInvoiceItem] = []
    total_gross_amount = Decimal("0.00")
    total_paid_advances = Decimal("0.00")

    for invoice in source_invoices:
        total_gross_amount += _quantize_money(Decimal(invoice.total))
        prepared_items.extend(_build_prepared_item_from_snapshot(item) for item in invoice.items)
        total_paid_advances += _sum_invoice_payments(invoice)

    total_gross_amount = _quantize_money(total_gross_amount)
    total_paid_advances = _quantize_money(total_paid_advances)
    if total_paid_advances > total_gross_amount:
        raise InvoiceValidationError("Součet uhrazených záloh nesmí překročit celkovou částku zdrojových proforem.")

    if total_paid_advances > Decimal("0.00"):
        advance_reference = ", ".join(invoice.invoice_number for invoice in source_invoices)
        prepared_items.append(
            _build_final_invoice_advance_item(
                tax_mode=source_invoices[0].tax_mode,
                vat_rate=Decimal(source_invoices[0].vat_rate) if source_invoices[0].vat_rate is not None else None,
                paid_advances=total_paid_advances,
                source_invoice_numbers=advance_reference,
            )
        )
    return prepared_items


def _build_final_invoice_advance_item(
    *,
    tax_mode: str,
    vat_rate: Decimal | None,
    paid_advances: Decimal,
    source_invoice_numbers: str,
) -> PreparedInvoiceItem:
    if tax_mode == "reverse_charge":
        advance_net_amount = paid_advances
    else:
        advance_net_amount = _derive_tax_document_net_amount(
            tax_mode=tax_mode,
            vat_rate=vat_rate,
            payment_amount=paid_advances,
        )
    negative_amount = _quantize_money(advance_net_amount * Decimal("-1"))
    return PreparedInvoiceItem(
        description=f"Odečtené uhrazené zálohy k proformám {source_invoice_numbers}",
        quantity=Decimal("1.000"),
        unit_price=negative_amount,
        line_total=negative_amount,
    )


def _build_tax_document_totals_from_payment(
    *,
    tax_mode: str,
    vat_rate: Decimal | None,
    payment_amount: Decimal,
    reverse_charge_reason: str | None,
    reverse_charge_text: str | None,
) -> InvoiceTotals:
    if tax_mode == "standard":
        if vat_rate is None:
            raise InvoiceValidationError("Pro běžný režim DPH chybí sazba DPH zdrojové proformy.")
        normalized_vat_rate = _normalize_vat_rate(vat_rate)
        subtotal = _derive_tax_document_net_amount(
            tax_mode=tax_mode,
            vat_rate=normalized_vat_rate,
            payment_amount=payment_amount,
        )
        vat_amount = _quantize_money(payment_amount - subtotal)
        return InvoiceTotals(
            subtotal=subtotal,
            vat_rate=normalized_vat_rate,
            vat_amount=vat_amount,
            total=payment_amount,
            reverse_charge_reason=None,
            reverse_charge_text=None,
        )

    if tax_mode == "reverse_charge":
        return InvoiceTotals(
            subtotal=payment_amount,
            vat_rate=_normalize_vat_rate(vat_rate) if vat_rate is not None else None,
            vat_amount=Decimal("0.00"),
            total=payment_amount,
            reverse_charge_reason=reverse_charge_reason,
            reverse_charge_text=reverse_charge_text,
        )

    raise InvoiceValidationError("Neznámý režim DPH.")


def _derive_tax_document_net_amount(
    *,
    tax_mode: str,
    vat_rate: Decimal | None,
    payment_amount: Decimal,
) -> Decimal:
    if tax_mode == "reverse_charge":
        return payment_amount
    if vat_rate is None:
        raise InvoiceValidationError("Pro běžný režim DPH chybí sazba DPH zdrojové proformy.")
    normalized_vat_rate = _normalize_vat_rate(vat_rate)
    divisor = Decimal("1.00") + (normalized_vat_rate / Decimal("100"))
    if divisor <= Decimal("0.00"):
        raise InvoiceValidationError("Neplatná sazba DPH pro daňový doklad.")
    return _quantize_money(payment_amount / divisor)


def _calculate_totals(
    *,
    tax_mode: str,
    vat_rate: Decimal | None,
    line_totals: list[Decimal],
) -> InvoiceTotals:
    subtotal = _quantize_money(sum(line_totals, Decimal("0.00")))

    if tax_mode == "standard":
        if vat_rate is None:
            raise InvoiceValidationError("Pro běžný režim DPH musíte vyplnit sazbu DPH.")
        normalized_vat_rate = _normalize_vat_rate(vat_rate)
        vat_amount = _quantize_money(subtotal * normalized_vat_rate / Decimal("100"))
        return InvoiceTotals(
            subtotal=subtotal,
            vat_rate=normalized_vat_rate,
            vat_amount=vat_amount,
            total=_quantize_money(subtotal + vat_amount),
            reverse_charge_reason=None,
            reverse_charge_text=None,
        )

    if tax_mode == "reverse_charge":
        normalized_vat_rate = _normalize_vat_rate(vat_rate) if vat_rate is not None else None
        reverse_charge_meta = REVERSE_CHARGE_RULES["reverse_charge"]
        return InvoiceTotals(
            subtotal=subtotal,
            vat_rate=normalized_vat_rate,
            vat_amount=Decimal("0.00"),
            total=subtotal,
            reverse_charge_reason=reverse_charge_meta.reason,
            reverse_charge_text=reverse_charge_meta.text,
        )

    raise InvoiceValidationError("Neznámý režim DPH.")


def _calculate_expense_totals(*, vat_rate: Decimal | None, line_totals: list[Decimal]) -> InvoiceTotals:
    subtotal = _quantize_money(sum(line_totals, Decimal("0.00")))
    normalized_vat_rate = _normalize_vat_rate(vat_rate) if vat_rate is not None else None
    vat_amount = (
        _quantize_money(subtotal * normalized_vat_rate / Decimal("100"))
        if normalized_vat_rate is not None
        else Decimal("0.00")
    )
    return InvoiceTotals(
        subtotal=subtotal,
        vat_rate=normalized_vat_rate,
        vat_amount=vat_amount,
        total=_quantize_money(subtotal + vat_amount),
        reverse_charge_reason=None,
        reverse_charge_text=None,
    )


def _normalize_vat_rate(value: Decimal) -> Decimal:
    normalized = Decimal(value).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
    if normalized < 0:
        raise InvoiceValidationError("Sazba DPH nemůže být záporná.")
    return normalized


def _quantize_money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(TWOPLACES, rounding=ROUND_HALF_UP)


def _quantize_quantity(value: Decimal) -> Decimal:
    return Decimal(value).quantize(THREEPLACES, rounding=ROUND_HALF_UP)


def _cache_invoice_nonfatal(invoice: Invoice) -> None:
    try:
        export_dto = build_invoice_export(invoice)
        cache_service = get_invoice_cache_service()
        cache_service.cache_invoice_detail(export_dto)
        cache_service.cache_customer_profile(export_dto)
    except Exception:
        LOGGER.warning("Synchronizace cache faktury %s selhala.", invoice.id, exc_info=True)


def _reserve_expense_sequence(
    db: Session,
    *,
    requested_expense_number: str | None = None,
) -> ExpenseSequencePreview:
    state = _get_or_create_expense_sequence_state(db)
    requested_number = normalize_invoice_number(requested_expense_number)

    if requested_number is None:
        next_numeric_value = state.last_number + 1
        padding = max(state.padding, DEFAULT_PADDING)
    else:
        next_numeric_value = int(requested_number)
        padding = max(state.padding, len(requested_number), DEFAULT_PADDING)

    preview = _build_expense_sequence_preview(
        next_numeric_value=next_numeric_value,
        padding=padding,
        sequence_key=state.sequence_key,
    )
    if _expense_number_exists(db, preview.expense_number):
        raise InvoiceNumberingError(f"Číslo přijatého dokladu {preview.expense_number} už existuje.")
    if _expense_variable_symbol_exists(db, preview.variable_symbol):
        raise InvoiceNumberingError(f"Variabilní symbol {preview.variable_symbol} už existuje.")

    state.last_number = max(state.last_number, next_numeric_value)
    state.padding = max(state.padding, padding)
    return preview


def _resolve_expense_sequence_for_update(
    db: Session,
    *,
    expense_id: int,
    current_expense_number: str,
    requested_expense_number: str | None,
) -> ExpenseSequencePreview:
    state = _get_or_create_expense_sequence_state(db)
    normalized_requested_number = normalize_invoice_number(requested_expense_number)
    resolved_expense_number = normalized_requested_number or current_expense_number
    next_numeric_value = int(resolved_expense_number)
    padding = max(state.padding, len(resolved_expense_number), DEFAULT_PADDING)

    preview = _build_expense_sequence_preview(
        next_numeric_value=next_numeric_value,
        padding=padding,
        sequence_key=state.sequence_key,
    )
    if _expense_number_exists(db, preview.expense_number, exclude_expense_id=expense_id):
        raise InvoiceNumberingError(f"Číslo přijatého dokladu {preview.expense_number} už existuje.")
    if _expense_variable_symbol_exists(db, preview.variable_symbol, exclude_expense_id=expense_id):
        raise InvoiceNumberingError(f"Variabilní symbol {preview.variable_symbol} už existuje.")

    state.last_number = max(state.last_number, next_numeric_value)
    state.padding = max(state.padding, padding)
    return preview


def _get_or_create_expense_sequence_state(db: Session) -> InvoiceSequenceState:
    state = (
        db.query(InvoiceSequenceState)
        .filter(InvoiceSequenceState.sequence_key == EXPENSE_SEQUENCE_KEY)
        .first()
    )
    if state is not None:
        if state.document_kind is None:
            state.document_kind = "expense"
        return state

    inferred_last_number, inferred_padding = _infer_expense_sequence_state(db)
    state = InvoiceSequenceState(
        sequence_key=EXPENSE_SEQUENCE_KEY,
        document_kind="expense",
        sequence_year=None,
        prefix=None,
        last_number=inferred_last_number,
        padding=inferred_padding,
    )
    db.add(state)
    db.flush()
    return state


def _infer_expense_sequence_state(db: Session) -> tuple[int, int]:
    inferred_last_number = 0
    inferred_padding = DEFAULT_PADDING
    existing_numbers = db.query(InvoiceExpense.expense_number, InvoiceExpense.variable_symbol).all()
    for expense_number, variable_symbol in existing_numbers:
        if expense_number and expense_number.isdigit():
            inferred_last_number = max(inferred_last_number, int(expense_number))
            inferred_padding = max(inferred_padding, len(expense_number))
        if variable_symbol and variable_symbol.isdigit():
            inferred_last_number = max(inferred_last_number, int(variable_symbol))
            inferred_padding = max(inferred_padding, len(variable_symbol))
    return inferred_last_number, inferred_padding


def _build_expense_sequence_preview(
    *,
    next_numeric_value: int,
    padding: int,
    sequence_key: str,
) -> ExpenseSequencePreview:
    if next_numeric_value <= 0:
        raise InvoiceNumberingError("Číslo přijatého dokladu musí být větší než nula.")

    resolved_padding = max(padding, DEFAULT_PADDING)
    expense_number = f"{next_numeric_value:0{max(resolved_padding, len(str(next_numeric_value)))}d}"
    if len(expense_number) > MAX_SEQUENCE_DIGITS:
        raise InvoiceNumberingError("Vyčerpala se číselná řada přijatých dokladů (max. 9 číslic).")

    return ExpenseSequencePreview(
        expense_number=expense_number,
        variable_symbol=expense_number,
        next_numeric_value=next_numeric_value,
        padding=resolved_padding,
        sequence_key=sequence_key,
    )


def _expense_number_exists(
    db: Session,
    expense_number: str,
    *,
    exclude_expense_id: int | None = None,
) -> bool:
    normalized_value = int(expense_number)
    query = db.query(InvoiceExpense.id, InvoiceExpense.expense_number)
    if exclude_expense_id is not None:
        query = query.filter(InvoiceExpense.id != exclude_expense_id)
    existing_numbers = query.all()
    return any(
        stored_number and stored_number.isdigit() and int(stored_number) == normalized_value
        for _, stored_number in existing_numbers
    )


def _expense_variable_symbol_exists(
    db: Session,
    variable_symbol: str,
    *,
    exclude_expense_id: int | None = None,
) -> bool:
    normalized_value = int(variable_symbol)
    query = db.query(InvoiceExpense.id, InvoiceExpense.variable_symbol).filter(InvoiceExpense.variable_symbol.isnot(None))
    if exclude_expense_id is not None:
        query = query.filter(InvoiceExpense.id != exclude_expense_id)
    existing_symbols = query.all()
    return any(
        stored_symbol and stored_symbol.isdigit() and int(stored_symbol) == normalized_value
        for _, stored_symbol in existing_symbols
    )


def _create_invoice_with_reserved_sequence(
    *,
    db: Session,
    payload: InvoiceCreate,
    subject: InvoiceSubject | None,
    customer_snapshot: CustomerSnapshot,
    issuer: IssuerProfile,
    payment_settings: InvoicePaymentSettingsProfile,
    prepared_items: list[PreparedInvoiceItem],
    totals: InvoiceTotals,
    audit_source: str = "admin_api",
    audit_metadata=None,
) -> Invoice:
    resolved_currency = (payload.currency or payment_settings.invoice_defaults.default_currency).strip().upper()
    resolved_note = payload.note if payload.note is not None else payment_settings.invoice_defaults.default_note
    resolved_document_kind = normalize_document_kind(payload.document_kind)
    _ensure_manual_document_creation_allowed(resolved_document_kind)
    for attempt in range(2):
        try:
            reserved_sequence = reserve_invoice_sequence(
                db,
                payload.invoice_number,
                document_kind=resolved_document_kind,
                reference_date=payload.issue_date,
            )
            invoice = Invoice(
                invoice_number=reserved_sequence.invoice_number,
                variable_symbol=reserved_sequence.variable_symbol,
                issue_date=payload.issue_date,
                due_date=payload.due_date,
                issuer_name=issuer.company_name,
                issuer_address=issuer.company_address,
                issuer_city=issuer.company_city,
                issuer_zip=issuer.company_zip,
                issuer_ico=issuer.company_ico,
                issuer_dic=issuer.company_dic,
                issuer_data_box=issuer.company_data_box,
                customer_name=customer_snapshot.name,
                customer_email=customer_snapshot.email,
                customer_phone=customer_snapshot.phone,
                customer_address=customer_snapshot.address,
                customer_ico=customer_snapshot.ico,
                customer_dic=customer_snapshot.dic,
                subject_id=subject.id if subject is not None else None,
                note=resolved_note,
                document_kind=resolved_document_kind,
                business_mode=payload.business_mode,
                tax_mode=payload.tax_mode,
                currency=resolved_currency,
                subtotal=totals.subtotal,
                vat_rate=totals.vat_rate,
                vat_amount=totals.vat_amount,
                total=totals.total,
                status=_normalize_invoice_status(payload.status),
                reverse_charge_reason=totals.reverse_charge_reason,
                reverse_charge_text=totals.reverse_charge_text,
                payment_method=(
                    payload.payment_method
                    if payload.payment_method is not None
                    else payment_settings.payment_profile.payment_method
                ),
                bank_account_number=payment_settings.payment_profile.account_number,
                bank_account_prefix=payment_settings.payment_profile.account_prefix,
                bank_code=payment_settings.payment_profile.bank_code,
                bank_iban=payment_settings.payment_profile.iban,
            )
            invoice.items = [
                InvoiceItem(
                    description=item.description,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    line_total=item.line_total,
                )
                for item in prepared_items
            ]

            db.add(invoice)
            db.flush()
            create_accounting_event(
                db,
                event_type="created",
                entity_type="invoice",
                entity_id=invoice.id,
                invoice_id=invoice.id,
                subject_id=invoice.subject_id,
                source=audit_source,
                new_values=_build_invoice_summary(invoice),
                metadata=audit_metadata,
            )
            db.commit()
            created_invoice = get_invoice_detail(db, invoice.id)
            _cache_invoice_nonfatal(created_invoice)
            return created_invoice
        except IntegrityError as exc:
            db.rollback()
            if payload.invoice_number or attempt > 0:
                raise InvoiceValidationError("Číslo faktury nebo variabilní symbol už existuje.") from exc
    raise InvoiceValidationError("Fakturu se nepodařilo bezpečně vytvořit.")


def _ensure_manual_document_creation_allowed(document_kind: str) -> None:
    metadata = get_document_kind_metadata(document_kind)
    if metadata.allows_manual_create:
        return
    if document_kind == "tax_document":
        raise InvoiceValidationError("Daňový doklad nelze vytvořit ručně. Vytvořte jej z platby proformy.")
    if document_kind == "final_invoice":
        raise InvoiceValidationError("Konečnou fakturu nelze vytvořit ručně. Vytvořte ji ze zdrojových proforem.")
    if document_kind == "correction":
        raise InvoiceValidationError("Opravný doklad nelze vytvořit ručně. Vytvořte jej ze zdrojového dokladu.")
    raise InvoiceValidationError(f"Typ dokladu {metadata.internal_label} nelze vytvořit ručně.")


def _tax_document_relation_exists(db: Session, *, source_payment_id: int) -> bool:
    relation = (
        db.query(InvoiceDocumentRelation.id)
        .filter(
            InvoiceDocumentRelation.source_payment_id == source_payment_id,
            InvoiceDocumentRelation.relation_type == RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT,
        )
        .first()
    )
    return relation is not None


def _final_invoice_relation_exists(db: Session, *, source_invoice_id: int) -> bool:
    relation = (
        db.query(InvoiceDocumentRelation.id)
        .filter(
            InvoiceDocumentRelation.source_invoice_id == source_invoice_id,
            InvoiceDocumentRelation.relation_type == RELATION_TYPE_FINAL_INVOICE_FOR_PROFORMA,
        )
        .first()
    )
    return relation is not None


def _correction_relation_exists(db: Session, *, source_invoice_id: int) -> bool:
    relation = (
        db.query(InvoiceDocumentRelation.id)
        .filter(
            InvoiceDocumentRelation.source_invoice_id == source_invoice_id,
            InvoiceDocumentRelation.relation_type == RELATION_TYPE_CORRECTION_FOR_INVOICE,
        )
        .first()
    )
    return relation is not None


def _quote_relation_type_for_target(target_document_kind: str) -> str:
    if target_document_kind == "invoice":
        return RELATION_TYPE_INVOICE_FROM_QUOTE
    if target_document_kind == "proforma":
        return RELATION_TYPE_PROFORMA_FROM_QUOTE
    raise InvoiceValidationError("Cenovou nabídku lze převést pouze na fakturu nebo proformu.")


def _quote_conversion_relation_exists(db: Session, *, source_invoice_id: int, relation_type: str) -> bool:
    relation = (
        db.query(InvoiceDocumentRelation.id)
        .filter(
            InvoiceDocumentRelation.source_invoice_id == source_invoice_id,
            InvoiceDocumentRelation.relation_type == relation_type,
        )
        .first()
    )
    return relation is not None


def _quote_has_any_conversion(db: Session, *, source_invoice_id: int) -> bool:
    relation = (
        db.query(InvoiceDocumentRelation.id)
        .filter(
            InvoiceDocumentRelation.source_invoice_id == source_invoice_id,
            InvoiceDocumentRelation.relation_type.in_(
                [RELATION_TYPE_INVOICE_FROM_QUOTE, RELATION_TYPE_PROFORMA_FROM_QUOTE]
            ),
        )
        .first()
    )
    return relation is not None


def _sum_invoice_payments(invoice: Invoice) -> Decimal:
    return _quantize_money(sum((Decimal(payment.amount) for payment in invoice.payments), Decimal("0.00")))


def _validate_final_invoice_source_invoices(source_invoices: list[Invoice]) -> None:
    primary_source = source_invoices[0]
    primary_customer_snapshot = _build_customer_snapshot_signature(primary_source)
    primary_currency = (primary_source.currency or "").strip().upper()
    primary_tax_signature = _build_invoice_tax_signature(primary_source)
    primary_issuer_signature = _build_invoice_issuer_signature(primary_source)
    primary_payment_signature = _build_invoice_payment_signature(primary_source)

    for source_invoice in source_invoices:
        if normalize_document_kind(source_invoice.document_kind) != "proforma":
            raise InvoiceValidationError("Konečnou fakturu lze vytvořit pouze z proformy.")
        if _build_customer_snapshot_signature(source_invoice) != primary_customer_snapshot:
            raise InvoiceValidationError("Zdrojové proformy musí mít shodného odběratele.")
        if (source_invoice.currency or "").strip().upper() != primary_currency:
            raise InvoiceValidationError("Zdrojové proformy musí mít shodnou měnu.")
        if _build_invoice_tax_signature(source_invoice) != primary_tax_signature:
            raise InvoiceValidationError("Zdrojové proformy musí mít shodné daňové nastavení.")
        if _build_invoice_issuer_signature(source_invoice) != primary_issuer_signature:
            raise InvoiceValidationError("Zdrojové proformy musí mít shodné dodavatelské údaje.")
        if _build_invoice_payment_signature(source_invoice) != primary_payment_signature:
            raise InvoiceValidationError("Zdrojové proformy musí mít shodné platební údaje.")


def _ensure_final_invoice_sources_are_available(db: Session, source_invoice_ids: list[int]) -> None:
    already_settled = [
        source_invoice_id
        for source_invoice_id in source_invoice_ids
        if _final_invoice_relation_exists(db, source_invoice_id=source_invoice_id)
    ]
    if already_settled:
        raise InvoiceValidationError("K některé z vybraných proforem už byla vytvořena konečná faktura.")


def _build_customer_snapshot_signature(invoice: Invoice) -> tuple[str | None, ...]:
    return (
        invoice.customer_name,
        invoice.customer_email,
        invoice.customer_phone,
        invoice.customer_address,
        invoice.customer_ico,
        invoice.customer_dic,
    )


def _build_invoice_tax_signature(invoice: Invoice) -> tuple[str | None, ...]:
    return (
        invoice.business_mode,
        invoice.tax_mode,
        str(invoice.vat_rate) if invoice.vat_rate is not None else None,
        invoice.reverse_charge_reason,
        invoice.reverse_charge_text,
    )


def _build_invoice_issuer_signature(invoice: Invoice) -> tuple[str | None, ...]:
    return (
        invoice.issuer_name,
        invoice.issuer_address,
        invoice.issuer_city,
        invoice.issuer_zip,
        invoice.issuer_ico,
        invoice.issuer_dic,
        invoice.issuer_data_box,
    )


def _build_invoice_payment_signature(invoice: Invoice) -> tuple[str | None, ...]:
    return (
        invoice.payment_method,
        invoice.bank_account_number,
        invoice.bank_account_prefix,
        invoice.bank_code,
        invoice.bank_iban,
    )


def _validate_correction_source_invoice(source_invoice: Invoice) -> None:
    source_document_kind = normalize_document_kind(source_invoice.document_kind)
    if source_document_kind not in {"invoice", "final_invoice", "tax_document"}:
        raise InvoiceValidationError("Opravný doklad lze vytvořit pouze z faktury, konečné faktury nebo daňového dokladu.")


def _compose_correction_note(source_invoice: Invoice, *, reason: str | None, note: str | None) -> str | None:
    parts: list[str] = []
    if reason:
        parts.append(f"Důvod opravy: {reason}")
    if note:
        parts.append(note)
    if parts:
        return "\n\n".join(parts)
    return source_invoice.note


def _update_existing_invoice(
    *,
    db: Session,
    invoice: Invoice,
    payload: InvoiceUpdate,
    subject: InvoiceSubject | None,
    customer_snapshot: CustomerSnapshot,
    prepared_items: list[PreparedInvoiceItem],
    totals: InvoiceTotals,
) -> Invoice:
    try:
        before = _build_invoice_summary(invoice)
        if _normalize_invoice_status(invoice.status) == "cancelled":
            raise InvoiceValidationError("Zrušený doklad nelze upravovat.")
        current_document_kind = normalize_document_kind(invoice.document_kind)
        if current_document_kind == "quote" and _quote_has_any_conversion(db, source_invoice_id=invoice.id):
            raise InvoiceValidationError("Převedenou cenovou nabídku už nelze upravovat.")
        requested_document_kind = (
            normalize_document_kind(payload.document_kind)
            if "document_kind" in payload.model_fields_set and payload.document_kind is not None
            else None
        )
        if requested_document_kind is not None and requested_document_kind != current_document_kind:
            raise InvoiceValidationError("Typ dokladu nelze po vytvoření měnit.")
        payment_summary = _build_payment_summary(invoice)
        if payment_summary.total_paid > totals.total:
            raise InvoiceValidationError("Součet plateb nesmí překročit novou celkovou částku dokladu.")
        reserved_sequence = resolve_invoice_sequence_for_update(
            db,
            invoice_id=invoice.id,
            current_invoice_number=invoice.invoice_number,
            requested_invoice_number=payload.invoice_number,
            document_kind=current_document_kind,
            reference_date=payload.issue_date,
        )
        invoice.invoice_number = reserved_sequence.invoice_number
        invoice.variable_symbol = reserved_sequence.variable_symbol
        invoice.document_kind = current_document_kind
        if "subject_id" in payload.model_fields_set:
            invoice.subject_id = subject.id if subject is not None else None
        invoice.issue_date = payload.issue_date
        invoice.due_date = payload.due_date
        invoice.customer_name = customer_snapshot.name
        invoice.customer_email = customer_snapshot.email
        invoice.customer_phone = customer_snapshot.phone
        invoice.customer_address = customer_snapshot.address
        invoice.customer_ico = customer_snapshot.ico
        invoice.customer_dic = customer_snapshot.dic
        invoice.note = payload.note
        invoice.business_mode = payload.business_mode
        invoice.tax_mode = payload.tax_mode
        invoice.currency = payload.currency
        invoice.subtotal = totals.subtotal
        invoice.vat_rate = totals.vat_rate
        invoice.vat_amount = totals.vat_amount
        invoice.total = totals.total
        if payload.status is not None:
            invoice.status = _normalize_invoice_status(payload.status)
        if "payment_method" in payload.model_fields_set and payload.payment_method is not None:
            invoice.payment_method = payload.payment_method
        invoice.reverse_charge_reason = totals.reverse_charge_reason
        invoice.reverse_charge_text = totals.reverse_charge_text
        invoice.items = [
            InvoiceItem(
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
            )
            for item in prepared_items
        ]

        db.add(invoice)
        after = _build_invoice_summary(invoice)
        old_values, new_values = _build_diff_payload(before, after)
        create_accounting_event(
            db,
            event_type="updated",
            entity_type="invoice",
            entity_id=invoice.id,
            invoice_id=invoice.id,
            subject_id=invoice.subject_id,
            source="admin_api",
            old_values=old_values,
            new_values=new_values,
        )
        if before.get("status") != after.get("status"):
            create_accounting_event(
                db,
                event_type="status_changed",
                entity_type="invoice",
                entity_id=invoice.id,
                invoice_id=invoice.id,
                subject_id=invoice.subject_id,
                source="admin_api",
                old_values={"status": before.get("status")},
                new_values={"status": after.get("status")},
            )
        db.commit()
        updated_invoice = get_invoice_detail(db, invoice.id)
        _cache_invoice_nonfatal(updated_invoice)
        return updated_invoice
    except IntegrityError as exc:
        db.rollback()
        raise InvoiceValidationError("Číslo faktury nebo variabilní symbol už existuje.") from exc
