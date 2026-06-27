"""Backend accounting export helpers for invoice-domain documents and expenses."""
from __future__ import annotations

import csv
import importlib.util
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from io import BytesIO, StringIO

from sqlalchemy.orm import Session

from backend.app.modules.invoices.service import list_invoice_expenses, list_invoices

OUTGOING_EXPORT_HEADERS = [
    "id",
    "document_kind",
    "invoice_number",
    "variable_symbol",
    "issue_date",
    "due_date",
    "customer_name",
    "customer_email",
    "customer_ico",
    "customer_dic",
    "currency",
    "subtotal",
    "vat_rate",
    "vat_amount",
    "total",
    "total_paid",
    "remaining_amount",
    "payment_status",
    "effective_status",
    "created_at",
]

EXPENSE_EXPORT_HEADERS = [
    "id",
    "expense_number",
    "variable_symbol",
    "issue_date",
    "received_date",
    "due_date",
    "taxable_supply_date",
    "supplier_name",
    "supplier_email",
    "supplier_ico",
    "supplier_dic",
    "currency",
    "subtotal",
    "vat_rate",
    "vat_amount",
    "total",
    "total_paid",
    "remaining_amount",
    "payment_status",
    "status",
    "created_at",
]


@dataclass(frozen=True)
class OutgoingExportFilters:
    document_kind: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    status: str | None = None
    customer_query: str | None = None


@dataclass(frozen=True)
class ExpenseExportFilters:
    date_from: date | None = None
    date_to: date | None = None
    status: str | None = None
    supplier_query: str | None = None


class AccountingExportError(RuntimeError):
    """Raised when an optional accounting export format is unavailable."""


def build_outgoing_csv_export(db: Session, filters: OutgoingExportFilters) -> str:
    rows = _build_outgoing_export_rows(db, filters)
    return _write_csv(OUTGOING_EXPORT_HEADERS, rows)


def build_expenses_csv_export(db: Session, filters: ExpenseExportFilters) -> str:
    rows = _build_expense_export_rows(db, filters)
    return _write_csv(EXPENSE_EXPORT_HEADERS, rows)


def build_outgoing_xlsx_export(db: Session, filters: OutgoingExportFilters) -> bytes:
    rows = _build_outgoing_export_rows(db, filters)
    return _write_xlsx(OUTGOING_EXPORT_HEADERS, rows)


def build_expenses_xlsx_export(db: Session, filters: ExpenseExportFilters) -> bytes:
    rows = _build_expense_export_rows(db, filters)
    return _write_xlsx(EXPENSE_EXPORT_HEADERS, rows)


def xlsx_exports_available() -> bool:
    return importlib.util.find_spec("openpyxl") is not None


def _build_outgoing_export_rows(db: Session, filters: OutgoingExportFilters) -> list[list[str]]:
    documents = list_invoices(db)
    filtered = [document for document in documents if _matches_outgoing_filters(document, filters)]
    return [
        [
            str(document.id),
            str(document.document_kind),
            str(document.invoice_number),
            str(document.variable_symbol),
            _format_date(document.issue_date),
            _format_date(document.due_date),
            str(document.customer_name),
            str(document.customer_email),
            _format_optional_text(document.customer_ico),
            _format_optional_text(document.customer_dic),
            str(document.currency),
            _format_decimal(document.subtotal),
            _format_optional_decimal(document.vat_rate),
            _format_decimal(document.vat_amount),
            _format_decimal(document.total),
            _format_decimal(document.total_paid),
            _format_decimal(document.remaining_amount),
            str(document.payment_status),
            str(document.effective_status),
            _format_datetime(document.created_at),
        ]
        for document in filtered
    ]


def _build_expense_export_rows(db: Session, filters: ExpenseExportFilters) -> list[list[str]]:
    expenses = list_invoice_expenses(db)
    filtered = [expense for expense in expenses if _matches_expense_filters(expense, filters)]
    return [
        [
            str(expense.id),
            str(expense.expense_number),
            str(expense.variable_symbol),
            _format_date(expense.issue_date),
            _format_date(expense.received_date),
            _format_date(expense.due_date),
            _format_date(expense.taxable_supply_date),
            str(expense.supplier_name),
            str(expense.supplier_email),
            _format_optional_text(expense.supplier_ico),
            _format_optional_text(expense.supplier_dic),
            str(expense.currency),
            _format_decimal(expense.subtotal),
            _format_optional_decimal(expense.vat_rate),
            _format_decimal(expense.vat_amount),
            _format_decimal(expense.total),
            _format_decimal(expense.total_paid),
            _format_decimal(expense.remaining_amount),
            str(expense.payment_status),
            str(expense.effective_status),
            _format_datetime(expense.created_at),
        ]
        for expense in filtered
    ]


def _matches_outgoing_filters(document, filters: OutgoingExportFilters) -> bool:
    if filters.document_kind and str(document.document_kind) != filters.document_kind:
        return False
    if filters.date_from and document.issue_date < filters.date_from:
        return False
    if filters.date_to and document.issue_date > filters.date_to:
        return False
    if filters.status and filters.status not in {str(document.status), str(document.effective_status)}:
        return False
    if filters.customer_query:
        normalized_query = _normalize_query(filters.customer_query)
        haystacks = [
            document.customer_name,
            document.customer_email,
            document.customer_ico,
            document.customer_dic,
        ]
        if not any(normalized_query in _normalize_query(value) for value in haystacks if value):
            return False
    return True


def _matches_expense_filters(expense, filters: ExpenseExportFilters) -> bool:
    if filters.date_from and expense.issue_date < filters.date_from:
        return False
    if filters.date_to and expense.issue_date > filters.date_to:
        return False
    if filters.status and filters.status not in {str(expense.status), str(expense.effective_status)}:
        return False
    if filters.supplier_query:
        normalized_query = _normalize_query(filters.supplier_query)
        haystacks = [
            expense.supplier_name,
            expense.supplier_email,
            expense.supplier_ico,
            expense.supplier_dic,
        ]
        if not any(normalized_query in _normalize_query(value) for value in haystacks if value):
            return False
    return True


def _write_csv(headers: list[str], rows: list[list[str]]) -> str:
    buffer = StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerows(rows)
    return buffer.getvalue()


def _write_xlsx(headers: list[str], rows: list[list[str]]) -> bytes:
    if not xlsx_exports_available():
        raise AccountingExportError("XLSX export není v tomto prostředí dostupný.")

    from openpyxl import Workbook

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "export"
    sheet.append(headers)
    for row in rows:
        sheet.append(row)

    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def _normalize_query(value: str | None) -> str:
    return (value or "").strip().lower()


def _format_optional_text(value: str | None) -> str:
    return value or ""


def _format_date(value: date | None) -> str:
    return value.isoformat() if value is not None else ""


def _format_datetime(value: datetime | None) -> str:
    return value.isoformat() if value is not None else ""


def _format_decimal(value: Decimal) -> str:
    return f"{Decimal(value):.2f}"


def _format_optional_decimal(value: Decimal | None) -> str:
    if value is None:
        return ""
    return f"{Decimal(value):.2f}"
