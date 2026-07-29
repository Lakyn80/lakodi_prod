"""Phase 1 hybrid search: normalization, schema, backfill, exact lookup."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import text

from backend.app.db import (
    SessionLocal,
    backfill_invoice_search_norms,
    engine,
    _ensure_invoice_search_norm_columns,
)
from backend.app.modules.invoices.models import Invoice, InvoiceSubject
from backend.app.modules.invoices.search_normalize import (
    is_hybrid_search_enabled,
    normalize_customer_name_search_key,
    normalize_dic_search_key,
    normalize_email_search_key,
    normalize_ico_search_key,
    normalize_invoice_number_search_key,
    normalize_variable_symbol_search_key,
)
from backend.app.modules.invoices.service import (
    OutgoingInvoiceFilters,
    list_invoice_subjects,
    _load_filtered_outgoing_invoices,
)


# --- Golden normalization cases (must stay aligned with AI connector) ---


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Novák", "novak"),
        ("Novak", "novak"),
        ("NOVÁK", "novak"),
        ("Novák s.r.o.", "novak s.r.o."),
        ("Novak, s. r. o.", "novak s.r.o."),
        ("ООО Новак", "ооо новак"),
        ("ТОВ Новак", "тов новак"),
        ("Novákovi", "novakovi"),
        ("Novakk", "novakk"),
    ],
)
def test_customer_name_search_key_golden(raw: str, expected: str) -> None:
    assert normalize_customer_name_search_key(raw) == expected


def test_novak_variants_share_key_but_typo_and_inflection_differ() -> None:
    assert normalize_customer_name_search_key("Novák") == normalize_customer_name_search_key(
        "Novak"
    )
    assert normalize_customer_name_search_key("Novák") != normalize_customer_name_search_key(
        "Novakk"
    )
    assert normalize_customer_name_search_key("Novák") != normalize_customer_name_search_key(
        "Novákovi"
    )


def test_cyrillic_not_latinized() -> None:
    key = normalize_customer_name_search_key("ООО Новак")
    assert key is not None
    assert "novak" not in key  # must not transliterate
    assert "новак" in key


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2026-001", "2026-001"),
        ("2026 - 001", "2026-001"),
        (" 2026-001 ", "2026-001"),
        ("FA 2026-001", "fa2026-001"),
    ],
)
def test_invoice_number_search_key(raw: str, expected: str) -> None:
    assert normalize_invoice_number_search_key(raw) == expected


def test_invoice_number_keys_keep_distinct_separators() -> None:
    assert normalize_invoice_number_search_key("2026-001") != normalize_invoice_number_search_key(
        "2026001"
    )


def test_variable_symbol_and_ico_dic_email_keys() -> None:
    assert normalize_variable_symbol_search_key("123 456") == "123456"
    assert normalize_ico_search_key("123 45 678") == "12345678"
    assert normalize_dic_search_key("cz12345678") == "CZ12345678"
    assert normalize_dic_search_key("CZ 123.45678") == "CZ12345678"
    assert normalize_email_search_key("Jan.Novak@Example.COM") == "jan.novak@example.com"


def test_hybrid_flag_default_false(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("HYBRID_SEARCH_ENABLED", raising=False)
    assert is_hybrid_search_enabled() is False
    monkeypatch.setenv("HYBRID_SEARCH_ENABLED", "true")
    assert is_hybrid_search_enabled() is True
    monkeypatch.setenv("HYBRID_SEARCH_ENABLED", "0")
    assert is_hybrid_search_enabled() is False


def test_schema_ensure_idempotent_and_indexes() -> None:
    _ensure_invoice_search_norm_columns()
    _ensure_invoice_search_norm_columns()
    with engine.begin() as conn:
        invoice_cols = {
            row[1] for row in conn.execute(text("PRAGMA table_info(invoices)")).fetchall()
        }
        subject_cols = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(invoice_subjects)")).fetchall()
        }
    for col in (
        "customer_name_search_norm",
        "invoice_number_norm",
        "variable_symbol_norm",
        "customer_ico_norm",
        "customer_dic_norm",
    ):
        assert col in invoice_cols
    for col in ("name_search_norm", "ico_norm", "dic_norm", "email_norm"):
        assert col in subject_cols


def test_create_subject_and_invoice_populate_norms() -> None:
    db = SessionLocal()
    try:
        subject = InvoiceSubject(
            name="Novák s.r.o.",
            email="Info@Novak.cz",
            address="Praha 1",
            ico="123 45678",
            dic="cz12345678",
        )
        db.add(subject)
        db.flush()
        assert subject.name == "Novák s.r.o."
        assert subject.name_search_norm == "novak s.r.o."
        assert subject.email_norm == "info@novak.cz"
        assert subject.ico_norm == "12345678"
        assert subject.dic_norm == "CZ12345678"

        invoice = Invoice(
            invoice_number="2026-001",
            variable_symbol="2026001",
            issue_date=date(2026, 1, 10),
            due_date=date(2026, 1, 24),
            issuer_name="Issuer",
            issuer_address="Addr",
            issuer_city="Praha",
            issuer_zip="11000",
            issuer_ico="00000000",
            issuer_dic="CZ00000000",
            customer_name="Novák",
            customer_email="Info@Novak.cz",
            customer_ico="123 45678",
            customer_dic="cz12345678",
            subject_id=subject.id,
            document_kind="invoice",
            business_mode="standard",
            tax_mode="standard_vat",
            currency="CZK",
            subtotal=Decimal("100.00"),
            vat_amount=Decimal("21.00"),
            total=Decimal("121.00"),
            status="issued",
            payment_method="Převodem",
            bank_account_number="1",
            bank_code="0800",
            bank_iban="CZ0000000000000000000000",
        )
        db.add(invoice)
        db.flush()
        assert invoice.invoice_number == "2026-001"
        assert invoice.invoice_number_norm == "2026-001"
        assert invoice.variable_symbol_norm == "2026001"
        assert invoice.customer_name_search_norm == "novak"
        assert invoice.customer_ico_norm == "12345678"
        db.commit()
    finally:
        db.close()


def test_backfill_idempotent(monkeypatch: pytest.MonkeyPatch) -> None:
    db = SessionLocal()
    try:
        subject = InvoiceSubject(
            name="Backfill Firma",
            email="a@b.cz",
            address="Addr",
        )
        db.add(subject)
        db.commit()
        subject_id = subject.id
    finally:
        db.close()

    # Bypass ORM events so norms look missing/stale (upgrade scenario).
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE invoice_subjects "
                "SET name_search_norm = NULL, email_norm = NULL, "
                "ico_norm = NULL, dic_norm = NULL "
                "WHERE id = :id"
            ),
            {"id": subject_id},
        )

    first = backfill_invoice_search_norms(batch_size=50)
    second = backfill_invoice_search_norms(batch_size=50)
    assert first["subjects_updated"] >= 1
    assert second["subjects_updated"] == 0

    db = SessionLocal()
    try:
        subject = db.query(InvoiceSubject).filter(InvoiceSubject.id == subject_id).one()
        assert subject.name == "Backfill Firma"
        assert subject.name_search_norm == "backfill firma"
        assert subject.email_norm == "a@b.cz"
    finally:
        db.close()


def test_hybrid_search_finds_diacritic_insensitive_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("HYBRID_SEARCH_ENABLED", "true")
    db = SessionLocal()
    try:
        subject = InvoiceSubject(
            name="Novák",
            email="novak@example.com",
            address="Praha",
            ico="87654321",
            dic="CZ87654321",
        )
        db.add(subject)
        db.flush()
        invoice = _minimal_invoice(
            invoice_number="HYB-2026-100",
            variable_symbol="2026100",
            customer_name="Novák",
            customer_email="novak@example.com",
            customer_ico="87654321",
            customer_dic="CZ87654321",
            subject_id=subject.id,
        )
        db.add(invoice)
        db.commit()

        subjects = list_invoice_subjects(db, search="Novak")
        assert any(item.id == subject.id for item in subjects)

        invoices = _load_filtered_outgoing_invoices(
            db,
            filters=OutgoingInvoiceFilters(query="Novak"),
        )
        assert any(item.id == invoice.id for item in invoices)

        # Typo must not exact-match via Phase 1 norms alone; substring also fails for Novakk.
        typo_subjects = list_invoice_subjects(db, search="Novakk")
        assert all(item.id != subject.id for item in typo_subjects)
    finally:
        db.close()


def test_legacy_ilike_when_flag_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HYBRID_SEARCH_ENABLED", "false")
    db = SessionLocal()
    try:
        subject = InvoiceSubject(
            name="Novák Legacy",
            email="legacy@example.com",
            address="Praha",
        )
        db.add(subject)
        db.commit()
        # Without hybrid, ASCII "Novak" does not match "Novák" via SQLite ILIKE.
        assert list_invoice_subjects(db, search="Novak") == []
        assert list_invoice_subjects(db, search="Novák")
    finally:
        db.close()


def test_exact_invoice_number_and_vs_and_ico(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HYBRID_SEARCH_ENABLED", "true")

    db = SessionLocal()
    try:
        invoice = _minimal_invoice(
            invoice_number="2026-777",
            variable_symbol="2026777",
            customer_name="Exact Co",
            customer_email="exact@example.com",
            customer_ico="11223344",
            customer_dic="CZ11223344",
        )
        db.add(invoice)
        db.commit()

        by_number = _load_filtered_outgoing_invoices(
            db,
            filters=OutgoingInvoiceFilters(invoice_number="2026 - 777"),
        )
        assert len(by_number) == 1
        assert by_number[0].invoice_number == "2026-777"

        by_vs = _load_filtered_outgoing_invoices(
            db,
            filters=OutgoingInvoiceFilters(query="2026 777"),
        )
        assert any(item.variable_symbol == "2026777" for item in by_vs)

        by_ico = _load_filtered_outgoing_invoices(
            db,
            filters=OutgoingInvoiceFilters(customer_query="1122 3344"),
        )
        assert any(item.customer_ico == "11223344" for item in by_ico)
    finally:
        db.close()


def test_payment_status_filter_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HYBRID_SEARCH_ENABLED", "true")

    db = SessionLocal()
    try:
        unpaid = _minimal_invoice(
            invoice_number="PAY-1",
            variable_symbol="900001",
            customer_name="Pay Filter",
            customer_email="pay@example.com",
            status="issued",
        )
        db.add(unpaid)
        db.commit()
        invoices = _load_filtered_outgoing_invoices(
            db,
            filters=OutgoingInvoiceFilters(
                customer_query="Pay Filter",
                payment_status="unpaid",
            ),
        )
        assert len(invoices) == 1
        assert invoices[0].payment_status == "unpaid"
    finally:
        db.close()


def _minimal_invoice(
    *,
    invoice_number: str,
    variable_symbol: str,
    customer_name: str,
    customer_email: str,
    customer_ico: str | None = None,
    customer_dic: str | None = None,
    subject_id: int | None = None,
    status: str = "issued",
) -> Invoice:
    return Invoice(
        invoice_number=invoice_number,
        variable_symbol=variable_symbol,
        issue_date=date(2026, 3, 1),
        due_date=date(2026, 3, 15),
        issuer_name="Issuer",
        issuer_address="Addr",
        issuer_city="Praha",
        issuer_zip="11000",
        issuer_ico="00000001",
        issuer_dic="CZ00000001",
        customer_name=customer_name,
        customer_email=customer_email,
        customer_ico=customer_ico,
        customer_dic=customer_dic,
        subject_id=subject_id,
        document_kind="invoice",
        business_mode="standard",
        tax_mode="standard_vat",
        currency="CZK",
        subtotal=Decimal("100.00"),
        vat_amount=Decimal("21.00"),
        total=Decimal("121.00"),
        status=status,
        payment_method="Převodem",
        bank_account_number="1",
        bank_code="0800",
        bank_iban="CZ0000000000000000000000",
    )
