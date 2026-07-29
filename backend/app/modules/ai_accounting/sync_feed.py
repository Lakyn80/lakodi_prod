"""Minimal AI retrieval change-feed helpers (no search / fuzzy / FTS)."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from backend.app.modules.invoices.models import Invoice, InvoiceSubject
from backend.app.modules.invoices.service import _build_payment_summary


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _encode_cursor(updated_at: datetime, entity_id: int) -> str:
    ts = _aware(updated_at) or datetime.now(tz=UTC)
    return f"{ts.isoformat()}|{entity_id}"


def _decode_cursor(cursor: str | None) -> tuple[datetime | None, int | None]:
    if not cursor:
        return None, None
    try:
        ts_raw, id_raw = cursor.rsplit("|", 1)
        return datetime.fromisoformat(ts_raw), int(id_raw)
    except (TypeError, ValueError):
        raise ValueError("cursor must be '{iso_utc}|{id}'") from None


def _stable_hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class SyncChangeItem:
    operation: str
    entity_type: str
    external_id: str
    source_version: str
    updated_at: datetime
    deleted_at: datetime | None
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


@dataclass(frozen=True)
class SyncChangePage:
    items: tuple[SyncChangeItem, ...]
    next_cursor: str | None
    has_more: bool


@dataclass(frozen=True)
class SyncIdPage:
    external_ids: tuple[str, ...]
    content_hashes: dict[str, str]
    next_cursor: str | None
    has_more: bool


def _after_cursor_filter(column_updated, column_id, cursor: str | None):
    updated_at, entity_id = _decode_cursor(cursor)
    if updated_at is None or entity_id is None:
        return None
    return or_(
        column_updated > updated_at,
        and_(column_updated == updated_at, column_id > entity_id),
    )


def _document_item(invoice: Invoice) -> SyncChangeItem:
    updated = _aware(getattr(invoice, "updated_at", None) or invoice.created_at) or datetime.now(
        tz=UTC
    )
    payment = _build_payment_summary(invoice)
    cancelled = (invoice.status or "").lower() == "cancelled"
    hash_payload = {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "variable_symbol": invoice.variable_symbol,
        "status": invoice.status,
        "payment_status": payment.payment_status,
        "currency": invoice.currency,
        "subtotal": str(invoice.subtotal),
        "vat_amount": str(invoice.vat_amount),
        "total": str(invoice.total),
        "customer_name": invoice.customer_name,
        "customer_email": invoice.customer_email,
        "customer_ico": invoice.customer_ico,
        "customer_dic": invoice.customer_dic,
        "subject_id": invoice.subject_id,
        "issue_date": invoice.issue_date.isoformat() if invoice.issue_date else None,
        "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
    }
    return SyncChangeItem(
        operation="delete" if cancelled else "upsert",
        entity_type="accounting_document",
        external_id=str(invoice.id),
        source_version=updated.isoformat(),
        updated_at=updated,
        deleted_at=updated if cancelled else None,
        content_hash=_stable_hash(hash_payload),
        display_name=invoice.customer_name,
        document_number=invoice.invoice_number,
        variable_symbol=invoice.variable_symbol,
        customer_external_id=str(invoice.subject_id) if invoice.subject_id is not None else None,
        customer_name=invoice.customer_name,
        customer_ico=invoice.customer_ico,
        customer_dic=invoice.customer_dic,
        customer_email=invoice.customer_email,
        document_status=invoice.status,
        payment_status=payment.payment_status,
        currency=invoice.currency,
        total_amount=Decimal(str(invoice.total)),
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
        taxable_supply_date=None,
    )


def _customer_item(subject: InvoiceSubject) -> SyncChangeItem:
    updated = _aware(subject.updated_at or subject.created_at) or datetime.now(tz=UTC)
    hash_payload = {
        "id": subject.id,
        "name": subject.name,
        "email": subject.email,
        "ico": subject.ico,
        "dic": subject.dic,
        "country": subject.country,
    }
    return SyncChangeItem(
        operation="upsert",
        entity_type="customer",
        external_id=str(subject.id),
        source_version=updated.isoformat(),
        updated_at=updated,
        deleted_at=None,
        content_hash=_stable_hash(hash_payload),
        display_name=subject.name,
        customer_external_id=str(subject.id),
        customer_name=subject.name,
        customer_ico=subject.ico,
        customer_dic=subject.dic,
        customer_email=subject.email,
    )


def list_document_changes(
    db: Session,
    *,
    cursor: str | None,
    limit: int,
) -> SyncChangePage:
    limit = max(1, min(int(limit), 500))
    query = db.query(Invoice).options(joinedload(Invoice.payments))
    filt = _after_cursor_filter(Invoice.updated_at, Invoice.id, cursor)
    if filt is not None:
        query = query.filter(filt)
    rows = (
        query.order_by(Invoice.updated_at.asc(), Invoice.id.asc()).limit(limit + 1).all()
    )
    page_rows = rows[:limit]
    items = tuple(_document_item(row) for row in page_rows)
    has_more = len(rows) > limit
    next_cursor = None
    if page_rows:
        last = page_rows[-1]
        next_cursor = _encode_cursor(
            _aware(getattr(last, "updated_at", None) or last.created_at) or datetime.now(tz=UTC),
            int(last.id),
        )
    return SyncChangePage(items=items, next_cursor=next_cursor, has_more=has_more)


def list_customer_changes(
    db: Session,
    *,
    cursor: str | None,
    limit: int,
) -> SyncChangePage:
    limit = max(1, min(int(limit), 500))
    query = db.query(InvoiceSubject)
    filt = _after_cursor_filter(InvoiceSubject.updated_at, InvoiceSubject.id, cursor)
    if filt is not None:
        query = query.filter(filt)
    rows = (
        query.order_by(InvoiceSubject.updated_at.asc(), InvoiceSubject.id.asc())
        .limit(limit + 1)
        .all()
    )
    page_rows = rows[:limit]
    items = tuple(_customer_item(row) for row in page_rows)
    has_more = len(rows) > limit
    next_cursor = None
    if page_rows:
        last = page_rows[-1]
        next_cursor = _encode_cursor(
            _aware(last.updated_at or last.created_at) or datetime.now(tz=UTC),
            int(last.id),
        )
    return SyncChangePage(items=items, next_cursor=next_cursor, has_more=has_more)


def list_document_ids(
    db: Session,
    *,
    cursor: str | None,
    limit: int,
) -> SyncIdPage:
    page = list_document_changes(db, cursor=cursor, limit=limit)
    active = [item for item in page.items if item.operation == "upsert"]
    return SyncIdPage(
        external_ids=tuple(item.external_id for item in active),
        content_hashes={item.external_id: item.content_hash for item in active},
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


def list_customer_ids(
    db: Session,
    *,
    cursor: str | None,
    limit: int,
) -> SyncIdPage:
    page = list_customer_changes(db, cursor=cursor, limit=limit)
    return SyncIdPage(
        external_ids=tuple(item.external_id for item in page.items),
        content_hashes={item.external_id: item.content_hash for item in page.items},
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )
