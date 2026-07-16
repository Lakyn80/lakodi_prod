"""Bounded response schemas for AI accounting service endpoints."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_serializer


class InternalInvoiceItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    item_id: int
    description: str
    quantity: Decimal
    unit_price: Decimal
    total_with_vat: Decimal

    @field_serializer("quantity", "unit_price", "total_with_vat", when_used="json")
    def serialize_decimal(self, value: Decimal) -> float:
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
    subject_name: str
    total_without_vat: Decimal
    total_vat: Decimal
    total_with_vat: Decimal
    items: list[InternalInvoiceItemResponse]
    payments: list[InternalInvoicePaymentResponse]

    @field_serializer("total_without_vat", "total_vat", "total_with_vat", when_used="json")
    def serialize_decimal(self, value: Decimal) -> float:
        return float(value)


class InternalDocumentDefaultsResponse(BaseModel):
    document_kind: str
    document_number: str
    variable_symbol: str
