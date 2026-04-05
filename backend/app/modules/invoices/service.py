"""Aplikační logika pro faktury."""
import logging
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session, selectinload

from backend.app.modules.invoices.cache_service import get_invoice_cache_service
from backend.app.modules.invoices.email_service import InvoiceEmailDeliveryResult, deliver_invoice_email
from backend.app.modules.invoices.exporters import build_invoice_export
from backend.app.modules.invoices.models import Invoice, InvoiceItem
from backend.app.modules.invoices.pdf_service import InvoicePdfDocument, build_invoice_pdf_document
from backend.app.modules.invoices.schemas import InvoiceCreate

TWOPLACES = Decimal("0.01")
THREEPLACES = Decimal("0.001")
DEFAULT_STATUS = "draft"
DEFAULT_ISSUER_PROFILE_KEY = "default"
LOGGER = logging.getLogger(__name__)


class InvoiceValidationError(ValueError):
    """Neplatná data faktury."""


class InvoiceNotFoundError(LookupError):
    """Faktura neexistuje."""


@dataclass(frozen=True)
class IssuerProfile:
    key: str
    company_name: str
    company_address: str
    company_city: str
    company_zip: str
    company_ico: str
    company_dic: str
    company_data_box: str | None


@dataclass(frozen=True)
class ReverseChargeTexts:
    reason: str
    text: str


ISSUER_PROFILES: dict[str, IssuerProfile] = {
    DEFAULT_ISSUER_PROFILE_KEY: IssuerProfile(
        key=DEFAULT_ISSUER_PROFILE_KEY,
        company_name="lakodi s.r.o.",
        company_address="Jaurisova 515/4, Michle, 140 00 Praha",
        company_city="Praha",
        company_zip="140 00",
        company_ico="09695982",
        company_dic="CZ09695982",
        company_data_box="wzzs5bi",
    )
}

REVERSE_CHARGE_RULES: dict[str, ReverseChargeTexts] = {
    "reverse_charge": ReverseChargeTexts(
        reason="construction_services_reverse_charge",
        text="Daň odvede zákazník v režimu přenesené daňové povinnosti.",
    )
}


def get_default_issuer_profile() -> IssuerProfile:
    return ISSUER_PROFILES[DEFAULT_ISSUER_PROFILE_KEY]


def list_invoices(db: Session) -> list[Invoice]:
    return db.query(Invoice).order_by(Invoice.id.desc()).all()


def get_invoice_detail(db: Session, invoice_id: int) -> Invoice:
    invoice = (
        db.query(Invoice)
        .options(selectinload(Invoice.items))
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise InvoiceNotFoundError("Faktura nebyla nalezena.")
    return invoice


def create_invoice(db: Session, payload: InvoiceCreate) -> Invoice:
    issuer = get_default_issuer_profile()
    prepared_items = [_prepare_invoice_item(item) for item in payload.items]
    totals = _calculate_totals(
        business_mode=payload.business_mode,
        tax_mode=payload.tax_mode,
        vat_rate=payload.vat_rate,
        line_totals=[item.line_total for item in prepared_items],
    )

    invoice = Invoice(
        invoice_number=_generate_invoice_number(db, payload.issue_date),
        issue_date=payload.issue_date,
        due_date=payload.due_date,
        issuer_name=issuer.company_name,
        issuer_address=issuer.company_address,
        issuer_city=issuer.company_city,
        issuer_zip=issuer.company_zip,
        issuer_ico=issuer.company_ico,
        issuer_dic=issuer.company_dic,
        issuer_data_box=issuer.company_data_box,
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        customer_phone=payload.customer_phone,
        customer_address=payload.customer_address,
        customer_ico=payload.customer_ico,
        customer_dic=payload.customer_dic,
        note=payload.note,
        business_mode=payload.business_mode,
        tax_mode=payload.tax_mode,
        currency=payload.currency,
        subtotal=totals.subtotal,
        vat_rate=totals.vat_rate,
        vat_amount=totals.vat_amount,
        total=totals.total,
        status=DEFAULT_STATUS,
        reverse_charge_reason=totals.reverse_charge_reason,
        reverse_charge_text=totals.reverse_charge_text,
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


def generate_invoice_pdf(db: Session, invoice_id: int) -> InvoicePdfDocument:
    invoice = get_invoice_detail(db, invoice_id)
    return build_invoice_pdf_document(invoice)


def send_invoice_email(db: Session, invoice_id: int, to_email: str | None = None) -> InvoiceEmailDeliveryResult:
    invoice = get_invoice_detail(db, invoice_id)
    return deliver_invoice_email(invoice, to_email=to_email)


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


def _calculate_totals(
    *,
    business_mode: str,
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
        if business_mode != "construction":
            raise InvoiceValidationError("Režim přenesené daňové povinnosti lze použít jen pro stavební práce.")
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


def _normalize_vat_rate(value: Decimal) -> Decimal:
    normalized = Decimal(value).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
    if normalized < 0:
        raise InvoiceValidationError("Sazba DPH nemůže být záporná.")
    return normalized


def _generate_invoice_number(db: Session, issue_date: date) -> str:
    year = issue_date.year
    prefix = f"INV-{year}-"
    existing_count = db.query(Invoice).filter(Invoice.invoice_number.like(f"{prefix}%")).count()
    return f"{prefix}{existing_count + 1:04d}"


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
