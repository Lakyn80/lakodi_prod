"""Pydantic schémata pro faktury."""
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator

from backend.app.modules.invoices.document_types import DEFAULT_DOCUMENT_KIND, normalize_document_kind

BusinessMode = Literal["autoservice", "construction"]
TaxMode = Literal["standard", "reverse_charge"]
StoredInvoiceStatus = Literal["draft", "issued", "cancelled"]
EffectiveInvoiceStatus = Literal["draft", "issued", "partially_paid", "paid", "overdue", "cancelled"]
InvoicePaymentStatus = Literal["unpaid", "partially_paid", "paid"]


class InvoiceItemCreate(BaseModel):
    description: str = Field(min_length=1, max_length=512)
    quantity: Decimal
    unit_price: Decimal

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Vyplňte popis položky.")
        return cleaned

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, value: Decimal) -> Decimal:
        if value <= 0:
            raise ValueError("Množství položky musí být větší než nula.")
        return value

    @field_validator("unit_price")
    @classmethod
    def validate_unit_price(cls, value: Decimal) -> Decimal:
        if value < 0:
            raise ValueError("Jednotková cena nemůže být záporná.")
        return value


class InvoiceCreate(BaseModel):
    invoice_number: str | None = Field(default=None, min_length=1, max_length=9)
    document_kind: str = DEFAULT_DOCUMENT_KIND
    status: StoredInvoiceStatus = "issued"
    issue_date: date
    due_date: date

    customer_name: str = Field(min_length=1, max_length=256)
    customer_email: str = Field(min_length=1, max_length=256)
    customer_phone: str | None = Field(default=None, max_length=64)
    customer_address: str = Field(max_length=256)
    customer_ico: str | None = Field(default=None, max_length=32)
    customer_dic: str | None = Field(default=None, max_length=32)

    note: str | None = None

    business_mode: BusinessMode
    tax_mode: TaxMode
    currency: str = Field(default="CZK", min_length=3, max_length=8)
    vat_rate: Decimal | None = None

    items: list[InvoiceItemCreate]

    @field_validator("customer_name", "customer_email", "customer_address")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Toto pole je povinné.")
        return cleaned

    @field_validator("invoice_number")
    @classmethod
    def validate_invoice_number(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            return None
        if not cleaned.isdigit():
            raise ValueError("Číslo faktury může obsahovat pouze číslice.")
        if len(cleaned) > 9:
            raise ValueError("Číslo faktury může mít maximálně 9 číslic.")
        if int(cleaned) <= 0:
            raise ValueError("Číslo faktury musí být větší než nula.")
        return cleaned

    @field_validator("document_kind")
    @classmethod
    def validate_document_kind(cls, value: str | None) -> str:
        return normalize_document_kind(value)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: StoredInvoiceStatus | None) -> StoredInvoiceStatus | None:
        return value

    @field_validator("customer_phone", "customer_ico", "customer_dic", "note")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("vat_rate")
    @classmethod
    def validate_vat_rate(cls, value: Decimal | None) -> Decimal | None:
        if value is not None and value < 0:
            raise ValueError("Sazba DPH nemůže být záporná.")
        return value

    @field_validator("items")
    @classmethod
    def validate_items(cls, value: list[InvoiceItemCreate]) -> list[InvoiceItemCreate]:
        if not value:
            raise ValueError("Faktura musí obsahovat alespoň jednu položku.")
        return value

    @model_validator(mode="after")
    def validate_dates_and_modes(self) -> "InvoiceCreate":
        if self.due_date < self.issue_date:
            raise ValueError("Datum splatnosti nemůže být dříve než datum vystavení.")
        if self.tax_mode == "standard" and self.vat_rate is None:
            raise ValueError("Pro běžný režim DPH musíte vyplnit sazbu DPH.")
        return self


class InvoiceItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    description: str
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal

    @field_serializer("quantity", "unit_price", "line_total", when_used="json")
    def serialize_decimal(self, value: Decimal) -> float:
        return float(value)


class InvoicePaymentCreate(BaseModel):
    amount: Decimal
    paid_at: date
    payment_method: str = Field(min_length=1, max_length=64)
    note: str | None = None

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: Decimal) -> Decimal:
        if value <= 0:
            raise ValueError("Částka platby musí být větší než nula.")
        return value

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Způsob platby je povinný.")
        return cleaned

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class InvoicePaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_id: int
    amount: Decimal
    paid_at: date
    payment_method: str
    note: str | None
    created_at: datetime

    @field_serializer("amount", when_used="json")
    def serialize_amount(self, value: Decimal) -> float:
        return float(value)


class InvoiceSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_number: str
    variable_symbol: str
    document_kind: str
    issue_date: date
    due_date: date

    issuer_name: str
    issuer_address: str
    issuer_city: str
    issuer_zip: str
    issuer_ico: str
    issuer_dic: str
    issuer_data_box: str | None

    customer_name: str
    customer_email: str
    customer_phone: str | None
    customer_address: str | None
    customer_ico: str | None
    customer_dic: str | None

    note: str | None

    business_mode: BusinessMode
    tax_mode: TaxMode
    currency: str
    subtotal: Decimal
    vat_rate: Decimal | None
    vat_amount: Decimal
    total: Decimal
    status: str
    total_paid: Decimal
    remaining_amount: Decimal
    payment_status: InvoicePaymentStatus
    effective_status: EffectiveInvoiceStatus

    reverse_charge_reason: str | None
    reverse_charge_text: str | None
    payment_method: str
    bank_account_number: str
    bank_account_prefix: str | None
    bank_code: str
    bank_iban: str

    created_at: datetime

    @field_serializer(
        "subtotal",
        "vat_rate",
        "vat_amount",
        "total",
        "total_paid",
        "remaining_amount",
        when_used="json",
    )
    def serialize_decimal(self, value: Decimal | None) -> float | None:
        if value is None:
            return None
        return float(value)


class InvoiceDetailResponse(InvoiceSummaryResponse):
    items: list[InvoiceItemResponse]
    payments: list[InvoicePaymentResponse]


class InvoiceUpdate(InvoiceCreate):
    document_kind: str | None = None
    status: StoredInvoiceStatus | None = None

    @field_validator("document_kind")
    @classmethod
    def validate_optional_document_kind(cls, value: str | None) -> str | None:
        return normalize_document_kind(value, default_to_invoice=False)


class AresCompanyLookupResponse(BaseModel):
    ico: str
    dic: str | None
    company_name: str
    address_line: str
    city: str
    zip: str
    country: str
    data_box: str | None
    source: Literal["ares", "mock_ares"]


class InvoiceSendEmailRequest(BaseModel):
    to_email: str | None = Field(default=None, max_length=256)

    @field_validator("to_email")
    @classmethod
    def normalize_to_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class InvoiceSendEmailResponse(BaseModel):
    ok: Literal[True]
    invoice_id: int
    invoice_number: str
    sent_to: str
    copied_to: list[str] = Field(default_factory=list)


class InvoiceDefaultsResponse(BaseModel):
    document_kind: str
    suggested_invoice_number: str
    suggested_variable_symbol: str


class InvoiceSettingsUpdate(BaseModel):
    owner_email: str = Field(min_length=3, max_length=256)
    issuer_name: str | None = Field(default=None, max_length=256)
    issuer_address: str | None = Field(default=None, max_length=256)
    issuer_city: str | None = Field(default=None, max_length=128)
    issuer_zip: str | None = Field(default=None, max_length=32)
    issuer_ico: str | None = Field(default=None, max_length=32)
    issuer_dic: str | None = Field(default=None, max_length=32)
    issuer_data_box: str | None = Field(default=None, max_length=64)
    issuer_email: str | None = Field(default=None, max_length=256)
    issuer_phone: str | None = Field(default=None, max_length=64)
    default_currency: str | None = Field(default=None, min_length=3, max_length=8)
    default_due_days: int | None = Field(default=None)
    default_note: str | None = None
    payment_method: str = Field(min_length=1, max_length=64)
    bank_account_number: str = Field(min_length=1, max_length=32)
    bank_account_prefix: str | None = Field(default=None, max_length=16)
    bank_code: str = Field(min_length=1, max_length=16)
    bank_iban: str | None = Field(default=None, max_length=34)

    @field_validator("owner_email", "payment_method", "bank_account_number", "bank_code")
    @classmethod
    def validate_required_string(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Toto pole je povinné.")
        return cleaned

    @field_validator(
        "issuer_name",
        "issuer_address",
        "issuer_city",
        "issuer_zip",
        "issuer_ico",
        "issuer_dic",
        "issuer_data_box",
        "issuer_email",
        "issuer_phone",
        "bank_account_prefix",
        "bank_iban",
        "default_note",
    )
    @classmethod
    def normalize_optional_setting(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("default_currency")
    @classmethod
    def normalize_optional_currency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().upper()
        return cleaned or None

    @field_validator("default_due_days")
    @classmethod
    def validate_default_due_days(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value <= 0:
            raise ValueError("Výchozí splatnost musí být větší než nula.")
        if value > 365:
            raise ValueError("Výchozí splatnost může být maximálně 365 dnů.")
        return value


class InvoiceSettingsResponse(BaseModel):
    owner_email: str
    issuer_name: str
    issuer_address: str
    issuer_city: str
    issuer_zip: str
    issuer_ico: str
    issuer_dic: str
    issuer_data_box: str | None
    issuer_email: str | None
    issuer_phone: str | None
    default_currency: str
    default_due_days: int
    default_note: str | None
    payment_method: str
    bank_account_number: str
    bank_account_prefix: str | None
    bank_code: str
    bank_iban: str
    account_label: str
