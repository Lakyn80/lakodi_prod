"""Bounded response schemas for AI accounting service endpoints."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from backend.app.modules.invoices.schemas import InvoiceCreate, InvoiceUpdate


class InternalInvoiceItemResponse(BaseModel):
    """Canonical line-item projection for AI read-back.

    Lakodi stores line ``unit_price`` and ``line_total`` as amounts **without VAT**.
    Document-level ``vat_rate`` lives on the invoice header, not on ``invoice_items``.
    Item VAT/gross are derived with the same Decimal HALF_UP money policy as
    ``_calculate_totals`` (per-line); header VAT remains authoritative for invoice totals.
    ``unit`` is not persisted on native ``InvoiceItem`` and is always null.
    """

    model_config = ConfigDict(from_attributes=True)

    item_id: int
    description: str
    quantity: Decimal
    unit: str | None = None
    unit_price_without_vat: Decimal
    vat_rate: Decimal | None = None
    total_without_vat: Decimal
    vat_amount: Decimal | None = None
    total_with_vat: Decimal | None = None
    # Compatibility alias: same net unit price (not gross).
    unit_price: Decimal | None = None

    @field_serializer(
        "quantity",
        "unit_price_without_vat",
        "vat_rate",
        "total_without_vat",
        "vat_amount",
        "total_with_vat",
        "unit_price",
        when_used="json",
    )
    def serialize_decimal(self, value: Decimal | None) -> float | None:
        if value is None:
            return None
        return float(value)


class InternalInvoicePaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    payment_id: int
    amount: Decimal
    paid_at: date
    payment_method: str
    note: str | None = None

    @field_serializer("amount", when_used="json")
    def serialize_amount(self, value: Decimal) -> float:
        return float(value)


class InternalOutgoingDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    document_id: int
    document_number: str
    document_kind: str
    status: str
    payment_status: str
    currency: str
    issue_date: date
    due_date: date
    subject_id: int | None = None
    subject_name: str
    vat_rate: Decimal | None = None
    total_without_vat: Decimal
    total_vat: Decimal
    total_with_vat: Decimal
    items: list[InternalInvoiceItemResponse]
    payments: list[InternalInvoicePaymentResponse]

    @field_serializer(
        "vat_rate",
        "total_without_vat",
        "total_vat",
        "total_with_vat",
        when_used="json",
    )
    def serialize_decimal(self, value: Decimal | None) -> float | None:
        if value is None:
            return None
        return float(value)


class InternalDocumentDefaultsResponse(BaseModel):
    document_kind: str
    document_number: str
    variable_symbol: str


class InternalOutgoingDocumentListItemResponse(BaseModel):
    document_id: int
    document_number: str
    document_kind: str
    status: str
    payment_status: str
    currency: str
    issue_date: date
    due_date: date
    subject_name: str
    total_without_vat: Decimal
    total_vat: Decimal
    total_with_vat: Decimal
    received_payments: Decimal
    outstanding_amount: Decimal

    @field_serializer(
        "total_without_vat",
        "total_vat",
        "total_with_vat",
        "received_payments",
        "outstanding_amount",
        when_used="json",
    )
    def serialize_decimal(self, value: Decimal) -> float:
        return float(value)


class InternalOutgoingDocumentListResponse(BaseModel):
    items: list[InternalOutgoingDocumentListItemResponse]
    limit: int
    offset: int
    total_count: int
    sort: str


class InternalOutgoingDocumentCurrencySummaryResponse(BaseModel):
    currency: str
    document_count: int
    invoiced_without_vat: Decimal
    vat: Decimal
    invoiced_with_vat: Decimal
    received_payments: Decimal
    outstanding_amount: Decimal

    @field_serializer(
        "invoiced_without_vat",
        "vat",
        "invoiced_with_vat",
        "received_payments",
        "outstanding_amount",
        when_used="json",
    )
    def serialize_decimal(self, value: Decimal) -> float:
        return float(value)


class InternalOutgoingDocumentsSummaryResponse(BaseModel):
    document_count: int
    currencies: list[InternalOutgoingDocumentCurrencySummaryResponse]


class InternalCustomerAccountingSummaryResponse(BaseModel):
    customer_query: str
    ambiguous: bool
    customer_matches: list[str]
    summary: InternalOutgoingDocumentsSummaryResponse | None


class InternalMonthlyAccountingSummaryResponse(InternalOutgoingDocumentsSummaryResponse):
    year: int
    month: int


class InternalCustomerSearchItemResponse(BaseModel):
    subject_id: int
    name: str
    email: str | None = None
    ico: str | None = None
    dic: str | None = None
    country: str | None = None


class InternalCustomerSearchResponse(BaseModel):
    items: list[InternalCustomerSearchItemResponse]
    limit: int
    total_count: int


class InternalInvoiceValidationResponse(BaseModel):
    valid: bool
    subject_id: int | None = None
    subject_name: str
    currency: str
    total_without_vat: Decimal
    total_vat: Decimal
    total_with_vat: Decimal
    vat_rate: Decimal | None = None
    item_count: int

    @field_serializer("total_without_vat", "total_vat", "total_with_vat", "vat_rate", when_used="json")
    def serialize_decimal(self, value: Decimal | None) -> float | None:
        return float(value) if value is not None else None


class InternalInvoiceCreateRequest(BaseModel):
    execution_id: str = Field(min_length=8, max_length=128)
    proposal_hash: str = Field(min_length=64, max_length=64)
    invoice: InvoiceCreate


class InternalDocumentMutationRequest(BaseModel):
    """Common envelope for mutations on an existing outgoing document."""

    execution_id: str = Field(min_length=8, max_length=128)
    proposal_hash: str = Field(min_length=64, max_length=64)
    invoice_id: int = Field(ge=1)


class InternalDocumentUpdateRequest(InternalDocumentMutationRequest):
    invoice: InvoiceUpdate


class InternalDocumentSendEmailRequest(InternalDocumentMutationRequest):
    to_email: str | None = Field(default=None, max_length=256)


class InternalExecutionStatusResponse(BaseModel):
    execution_id: str
    operation: str
    status: str
    proposal_hash: str
    invoice: InternalOutgoingDocumentResponse | None = None
    error_code: str | None = None
    email_delivery: dict[str, object] | None = None


class InternalSyncChangeItemResponse(BaseModel):
    operation: str
    entity_type: str
    external_id: str
    source_version: str
    updated_at: datetime
    deleted_at: datetime | None = None
    content_hash: str
    display_name: str | None = None
    document_number: str | None = None
    variable_symbol: str | None = None
    customer_external_id: str | None = None
    customer_name: str | None = None
    customer_ico: str | None = None
    customer_dic: str | None = None
    customer_email: str | None = None
    document_status: str | None = None
    payment_status: str | None = None
    currency: str | None = None
    total_amount: Decimal | None = None
    issue_date: date | None = None
    due_date: date | None = None
    taxable_supply_date: date | None = None

    @field_serializer("total_amount", when_used="json")
    def serialize_total_amount(self, value: Decimal | None) -> float | None:
        return None if value is None else float(value)


class InternalSyncChangePageResponse(BaseModel):
    items: list[InternalSyncChangeItemResponse]
    next_cursor: str | None = None
    has_more: bool = False


class InternalSyncIdPageResponse(BaseModel):
    external_ids: list[str]
    content_hashes: dict[str, str]
    next_cursor: str | None = None
    has_more: bool = False
