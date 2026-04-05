"""Pydantic schémata pro faktury."""
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator


BusinessMode = Literal["autoservice", "construction"]
TaxMode = Literal["standard", "reverse_charge"]


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
    issue_date: date
    due_date: date

    customer_name: str = Field(min_length=1, max_length=256)
    customer_email: str = Field(min_length=1, max_length=256)
    customer_phone: str | None = Field(default=None, max_length=64)
    customer_address: str | None = Field(default=None, max_length=256)
    customer_ico: str | None = Field(default=None, max_length=32)
    customer_dic: str | None = Field(default=None, max_length=32)

    note: str | None = None

    business_mode: BusinessMode
    tax_mode: TaxMode
    currency: str = Field(default="CZK", min_length=3, max_length=8)
    vat_rate: Decimal | None = None

    items: list[InvoiceItemCreate]

    @field_validator("customer_name", "customer_email")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Toto pole je povinné.")
        return cleaned

    @field_validator("customer_phone", "customer_address", "customer_ico", "customer_dic", "note")
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
        if self.tax_mode == "reverse_charge" and self.business_mode != "construction":
            raise ValueError("Režim přenesené daňové povinnosti lze použít jen pro stavební práce.")
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


class InvoiceSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_number: str
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

    reverse_charge_reason: str | None
    reverse_charge_text: str | None

    created_at: datetime

    @field_serializer("subtotal", "vat_rate", "vat_amount", "total", when_used="json")
    def serialize_decimal(self, value: Decimal | None) -> float | None:
        if value is None:
            return None
        return float(value)


class InvoiceDetailResponse(InvoiceSummaryResponse):
    items: list[InvoiceItemResponse]


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
