"""Aplikační logika pro faktury."""
import logging
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from backend.app.modules.invoices.document_types import (
    DEFAULT_DOCUMENT_KIND,
    get_document_kind_metadata,
    normalize_document_kind,
)
from backend.app.modules.invoices.cache_service import get_invoice_cache_service
from backend.app.modules.invoices.email_service import InvoiceEmailDeliveryResult, deliver_invoice_email
from backend.app.modules.invoices.exporters import build_invoice_export
from backend.app.modules.invoices.models import (
    RELATION_TYPE_CORRECTION_FOR_INVOICE,
    RELATION_TYPE_FINAL_INVOICE_FOR_PROFORMA,
    RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT,
    Invoice,
    InvoiceDocumentRelation,
    InvoiceExpense,
    InvoiceExpenseItem,
    InvoiceExpensePayment,
    InvoiceItem,
    InvoicePayment,
    InvoiceSequenceState,
    InvoiceSubject,
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
    InvoicePaymentSettingsProfile,
    IssuerProfile,
    get_invoice_settings_profile,
    update_invoice_settings_profile,
)
from backend.app.modules.invoices.pdf_service import InvoicePdfDocument, build_invoice_pdf_document
from backend.app.modules.invoices.schemas import (
    CorrectionInvoiceCreateRequest,
    FinalInvoiceCreateRequest,
    InvoiceCreate,
    InvoiceExpenseCreate,
    InvoiceExpensePaymentCreate,
    InvoiceExpenseUpdate,
    InvoicePaymentCreate,
    InvoiceSubjectCreate,
    InvoiceSubjectUpdate,
    InvoiceSettingsUpdate,
    InvoiceUpdate,
)

TWOPLACES = Decimal("0.01")
THREEPLACES = Decimal("0.001")
DEFAULT_STATUS = "draft"
STORED_INVOICE_STATUSES = {"draft", "issued", "cancelled"}
DEFAULT_EXPENSE_STATUS = "open"
STORED_EXPENSE_STATUSES = {"open", "cancelled"}
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


@dataclass(frozen=True)
class ReverseChargeTexts:
    reason: str
    text: str

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
    invoice = (
        db.query(Invoice)
        .options(selectinload(Invoice.items), selectinload(Invoice.payments), selectinload(Invoice.subject))
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise InvoiceNotFoundError("Faktura nebyla nalezena.")
    return _attach_invoice_runtime_state(invoice)


def list_invoice_payments(db: Session, invoice_id: int) -> list[InvoicePayment]:
    invoice = get_invoice_detail(db, invoice_id)
    return list(invoice.payments)


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
    db.commit()
    return get_invoice_subject_detail(db, subject.id)


def update_invoice_subject(db: Session, subject_id: int, payload: InvoiceSubjectUpdate) -> InvoiceSubject:
    subject = get_invoice_subject_detail(db, subject_id)
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
    db.commit()
    return get_invoice_subject_detail(db, subject.id)


def delete_invoice_subject(db: Session, subject_id: int) -> int:
    subject = get_invoice_subject_detail(db, subject_id)
    is_referenced = db.query(Invoice.id).filter(Invoice.subject_id == subject.id).first() is not None
    if is_referenced:
        raise InvoiceValidationError("Subjekt nelze smazat, protože je navázaný na existující faktury.")
    db.delete(subject)
    db.commit()
    return subject_id


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


def create_invoice_expense(db: Session, payload: InvoiceExpenseCreate) -> InvoiceExpense:
    prepared_items = [_prepare_invoice_item(item) for item in payload.items]
    totals = _calculate_expense_totals(
        vat_rate=payload.vat_rate,
        line_totals=[item.line_total for item in prepared_items],
    )
    try:
        sequence = _reserve_expense_sequence(db, requested_expense_number=payload.expense_number)
        expense = InvoiceExpense(
            supplier_name=payload.supplier_name,
            supplier_email=payload.supplier_email,
            supplier_phone=payload.supplier_phone,
            supplier_address=payload.supplier_address,
            supplier_ico=payload.supplier_ico,
            supplier_dic=payload.supplier_dic,
            supplier_data_box=payload.supplier_data_box,
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
        db.commit()
        return get_invoice_expense_detail(db, expense.id)
    except (IntegrityError, InvoiceNumberingError) as exc:
        db.rollback()
        raise InvoiceValidationError("Číslo přijatého dokladu nebo variabilní symbol už existuje.") from exc


def update_invoice_expense(db: Session, expense_id: int, payload: InvoiceExpenseUpdate) -> InvoiceExpense:
    expense = _get_invoice_expense_or_raise(db, expense_id, include_items=True)
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
        expense.supplier_name = payload.supplier_name
        expense.supplier_email = payload.supplier_email
        expense.supplier_phone = payload.supplier_phone
        expense.supplier_address = payload.supplier_address
        expense.supplier_ico = payload.supplier_ico
        expense.supplier_dic = payload.supplier_dic
        expense.supplier_data_box = payload.supplier_data_box
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
        db.commit()
        return get_invoice_expense_detail(db, expense.id)
    except (IntegrityError, InvoiceNumberingError) as exc:
        db.rollback()
        raise InvoiceValidationError("Číslo přijatého dokladu nebo variabilní symbol už existuje.") from exc


def delete_invoice_expense(db: Session, expense_id: int) -> int:
    expense = _get_invoice_expense_or_raise(db, expense_id, include_payments=True)
    if expense.payments:
        raise InvoiceValidationError("Přijatý doklad s evidovanými platbami nelze smazat.")
    db.delete(expense)
    db.commit()
    return expense_id


def add_invoice_expense_payment(db: Session, expense_id: int, payload: InvoiceExpensePaymentCreate) -> InvoiceExpense:
    expense = _get_invoice_expense_or_raise(db, expense_id, include_items=True, include_payments=True)
    amount = _quantize_money(Decimal(payload.amount))
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
        paid_at=payload.paid_at,
        payment_method=payload.payment_method,
        note=payload.note,
    )
    db.add(payment)
    db.commit()
    return get_invoice_expense_detail(db, expense.id)


def delete_invoice_expense_payment(db: Session, expense_id: int, payment_id: int) -> InvoiceExpense:
    expense = _get_invoice_expense_or_raise(db, expense_id, include_items=True, include_payments=True)
    payment = next((item for item in expense.payments if item.id == payment_id), None)
    if payment is None:
        raise InvoiceExpensePaymentNotFoundError("Platba přijatého dokladu nebyla nalezena.")
    db.delete(payment)
    db.commit()
    return get_invoice_expense_detail(db, expense.id)


def create_invoice(db: Session, payload: InvoiceCreate) -> Invoice:
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


def add_invoice_payment(db: Session, invoice_id: int, payload: InvoicePaymentCreate) -> Invoice:
    invoice = get_invoice_detail(db, invoice_id)
    amount = _quantize_money(Decimal(payload.amount))
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
        paid_at=payload.paid_at,
        payment_method=payload.payment_method,
        note=payload.note,
    )
    db.add(payment)
    db.commit()
    return get_invoice_detail(db, invoice.id)


def delete_invoice_payment(db: Session, invoice_id: int, payment_id: int) -> Invoice:
    invoice = get_invoice_detail(db, invoice_id)
    payment = next((item for item in invoice.payments if item.id == payment_id), None)
    if payment is None:
        raise InvoicePaymentNotFoundError("Platba faktury nebyla nalezena.")
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


def _normalize_invoice_status(value: str | None) -> str:
    if value in STORED_INVOICE_STATUSES:
        return value
    return DEFAULT_STATUS


def _normalize_expense_status(value: str | None) -> str:
    if value in STORED_EXPENSE_STATUSES:
        return value
    return DEFAULT_EXPENSE_STATUS


def _build_payment_summary(invoice: Invoice, reference_date: date | None = None) -> InvoicePaymentSummary:
    invoice_total = _quantize_money(Decimal(invoice.total))
    document_metadata = get_document_kind_metadata(invoice.document_kind)
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


def _resolve_invoice_subject(db: Session, subject_id: int | None) -> InvoiceSubject | None:
    if subject_id is None:
        return None
    subject = db.query(InvoiceSubject).filter(InvoiceSubject.id == subject_id).first()
    if subject is None:
        raise InvoiceValidationError("Zvolený subjekt nebyl nalezen.")
    return subject


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
                payment_method=payment_settings.payment_profile.payment_method,
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
        current_document_kind = normalize_document_kind(invoice.document_kind)
        requested_document_kind = (
            normalize_document_kind(payload.document_kind)
            if "document_kind" in payload.model_fields_set and payload.document_kind is not None
            else None
        )
        if requested_document_kind is not None and requested_document_kind != current_document_kind:
            raise InvoiceValidationError("Typ dokladu nelze po vytvoření měnit.")
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
        db.commit()
        updated_invoice = get_invoice_detail(db, invoice.id)
        _cache_invoice_nonfatal(updated_invoice)
        return updated_invoice
    except IntegrityError as exc:
        db.rollback()
        raise InvoiceValidationError("Číslo faktury nebo variabilní symbol už existuje.") from exc
