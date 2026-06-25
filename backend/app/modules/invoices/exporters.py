"""Stable export DTOs for future invoice integrations."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from backend.app.modules.invoices.models import Invoice


class InvoiceExportIdentityDTO(BaseModel):
    id: int
    invoice_number: str
    document_kind: str
    issue_date: date
    due_date: date
    status: str
    created_at: datetime | None


class InvoiceExportIssuerDTO(BaseModel):
    name: str
    address: str
    city: str
    zip: str
    ico: str
    dic: str
    data_box: str | None


class InvoiceExportCustomerDTO(BaseModel):
    name: str
    email: str
    phone: str | None
    address: str | None
    ico: str | None
    dic: str | None


class InvoiceExportItemDTO(BaseModel):
    id: int
    description: str
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal


class InvoiceExportTotalsDTO(BaseModel):
    currency: str
    subtotal: Decimal
    vat_rate: Decimal | None
    vat_amount: Decimal
    total: Decimal


class InvoiceExportPaymentDTO(BaseModel):
    method: str
    account_number: str
    account_prefix: str | None
    bank_code: str
    account_label: str
    iban: str
    variable_symbol: str


class InvoiceExportDTO(BaseModel):
    identity: InvoiceExportIdentityDTO
    issuer: InvoiceExportIssuerDTO
    customer: InvoiceExportCustomerDTO
    items: list[InvoiceExportItemDTO]
    payment: InvoiceExportPaymentDTO
    business_mode: str
    tax_mode: str
    totals: InvoiceExportTotalsDTO
    reverse_charge_reason: str | None
    reverse_charge_text: str | None
    note: str | None

    @property
    def id(self) -> int:
        return self.identity.id

    @property
    def created_at(self) -> datetime | None:
        return self.identity.created_at


def build_invoice_export(invoice: Invoice) -> InvoiceExportDTO:
    return InvoiceExportDTO(
        identity=InvoiceExportIdentityDTO(
            id=invoice.id,
            invoice_number=invoice.invoice_number,
            document_kind=invoice.document_kind or "invoice",
            issue_date=invoice.issue_date,
            due_date=invoice.due_date,
            status=invoice.status,
            created_at=invoice.created_at,
        ),
        issuer=InvoiceExportIssuerDTO(
            name=invoice.issuer_name,
            address=invoice.issuer_address,
            city=invoice.issuer_city,
            zip=invoice.issuer_zip,
            ico=invoice.issuer_ico,
            dic=invoice.issuer_dic,
            data_box=invoice.issuer_data_box,
        ),
        customer=InvoiceExportCustomerDTO(
            name=invoice.customer_name,
            email=invoice.customer_email,
            phone=invoice.customer_phone,
            address=invoice.customer_address,
            ico=invoice.customer_ico,
            dic=invoice.customer_dic,
        ),
        items=[
            InvoiceExportItemDTO(
                id=item.id,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
            )
            for item in invoice.items
        ],
        payment=InvoiceExportPaymentDTO(
            method=invoice.payment_method,
            account_number=invoice.bank_account_number,
            account_prefix=invoice.bank_account_prefix,
            bank_code=invoice.bank_code,
            account_label=(
                f"{invoice.bank_account_prefix}-{invoice.bank_account_number}/{invoice.bank_code}"
                if invoice.bank_account_prefix
                else f"{invoice.bank_account_number}/{invoice.bank_code}"
            ),
            iban=invoice.bank_iban,
            variable_symbol=invoice.variable_symbol,
        ),
        business_mode=invoice.business_mode,
        tax_mode=invoice.tax_mode,
        totals=InvoiceExportTotalsDTO(
            currency=invoice.currency,
            subtotal=invoice.subtotal,
            vat_rate=invoice.vat_rate,
            vat_amount=invoice.vat_amount,
            total=invoice.total,
        ),
        reverse_charge_reason=invoice.reverse_charge_reason,
        reverse_charge_text=invoice.reverse_charge_text,
        note=invoice.note,
    )
