import csv
from io import BytesIO
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from backend.app.db import SessionLocal
from backend.app.main import app
from backend.app.modules.invoices import ares_service
from backend.app.modules.invoices import attachment_storage
from backend.app.modules.invoices.ares_service import (
    AresCompanyNotFoundError,
    AresCompanyLookupResponse,
    AresUnavailableError,
    InvalidCompanyNameError,
    ResolvedAresProvider,
    resolve_ares_provider,
)
from backend.app.modules.invoices.cache_service import InvoiceCacheService
from backend.app.modules.invoices.email_service import InvoiceEmailSendError
from backend.app.modules.invoices.document_types import get_document_kind_metadata
from backend.app.modules.invoices.models import (
    RELATION_TYPE_CORRECTION_FOR_INVOICE,
    RELATION_TYPE_FINAL_INVOICE_FOR_PROFORMA,
    RELATION_TYPE_INVOICE_FROM_QUOTE,
    RELATION_TYPE_PROFORMA_FROM_QUOTE,
    RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT,
    InvoiceAttachment,
    InvoiceBankTransaction,
    InvoiceExpense,
    InvoiceDocumentRelation,
    InvoicePaymentMatch,
    InvoiceReminderEmail,
    InvoiceRecurringGeneration,
    InvoiceRecurringTemplate,
    InvoiceAccountingEvent,
    InvoiceSequenceState,
    InvoiceTodo,
)
from backend.app.modules.invoices.numbering_service import (
    get_document_sequence_preview,
    reserve_document_sequence,
)
from backend.app.modules.invoices.pdf_service import InvoicePdfDocument

client = TestClient(app)


def _login_admin() -> None:
    auth_state = client.get("/api/admin/check")
    assert auth_state.status_code == 200
    if auth_state.json().get("authenticated") is True:
        return
    response = client.post(
        "/api/admin/login",
        json={"email": "lakodi@seznam.cz", "password": "admin123"},
    )
    assert response.status_code == 200


def _vytvor_fakturu(payload: dict | None = None) -> dict:
    _login_admin()
    invoice_payload = {
        "issue_date": "2099-04-04",
        "due_date": "2099-04-18",
        "customer_name": "Jan Novák",
        "customer_email": "jan@example.com",
        "customer_phone": "+420123456789",
        "customer_address": "Praha 10",
        "customer_ico": "12345678",
        "customer_dic": "CZ12345678",
        "note": "Ruční servisní faktura",
        "business_mode": "autoservice",
        "tax_mode": "standard",
        "currency": "CZK",
        "vat_rate": 21,
        "items": [
            {"description": "Diagnostika", "quantity": 1, "unit_price": 1200},
            {"description": "Oprava převodovky", "quantity": 2, "unit_price": 3500},
        ],
    }
    if payload:
        invoice_payload.update(payload)
    response = client.post("/api/admin/invoices", json=invoice_payload)
    assert response.status_code == 200
    return response.json()


def _pridej_platbu(invoice_id: int, payload: dict | None = None) -> dict:
    _login_admin()
    payment_payload = {
        "amount": 1000,
        "paid_at": "2026-04-10",
        "payment_method": "Bankovní převod",
        "note": "Částečná úhrada",
    }
    if payload:
        payment_payload.update(payload)
    response = client.post(f"/api/admin/invoices/{invoice_id}/payments", json=payment_payload)
    assert response.status_code == 200
    return response.json()


def _vytvor_danovy_doklad_z_platby(invoice_id: int, payment_id: int) -> dict:
    _login_admin()
    response = client.post(f"/api/admin/invoices/{invoice_id}/payments/{payment_id}/tax-document")
    assert response.status_code == 200
    return response.json()


def _vytvor_konecnou_fakturu(source_proforma_ids: list[int], payload: dict | None = None) -> dict:
    _login_admin()
    request_payload = {"source_proforma_ids": source_proforma_ids}
    if payload:
        request_payload.update(payload)
    response = client.post("/api/admin/invoices/final-invoice", json=request_payload)
    assert response.status_code == 200
    return response.json()


def _vytvor_opravny_doklad(source_invoice_id: int, payload: dict | None = None) -> dict:
    _login_admin()
    response = client.post(f"/api/admin/invoices/{source_invoice_id}/correction", json=payload or {})
    assert response.status_code == 200
    return response.json()


def _preved_quote(quote_id: int, payload: dict | None = None) -> dict:
    _login_admin()
    request_payload = {"target_document_kind": "invoice"}
    if payload:
        request_payload.update(payload)
    response = client.post(f"/api/admin/invoices/{quote_id}/convert", json=request_payload)
    assert response.status_code == 200
    return response.json()


def _vytvor_subjekt(payload: dict | None = None) -> dict:
    _login_admin()
    subject_payload = {
        "name": "Jan Novák",
        "email": "jan.subject@example.com",
        "phone": "+420123456789",
        "address": "Praha 10",
        "ico": "12345678",
        "dic": "CZ12345678",
        "data_box": "abcd123",
        "country": "Česká republika",
        "note": "VIP zákazník",
    }
    if payload:
        subject_payload.update(payload)
    response = client.post("/api/admin/invoices/subjects", json=subject_payload)
    assert response.status_code == 200
    return response.json()


def _vytvor_dodavatele(payload: dict | None = None) -> dict:
    _login_admin()
    supplier_payload = {
        "name": "Dodavatel s.r.o.",
        "email": "supplier.registry@example.com",
        "phone": "+420987654321",
        "address": "Brno 5",
        "ico": "87654321",
        "dic": "CZ87654321",
        "data_box": "exp1234",
        "country": "Česká republika",
        "note": "Preferovaný dodavatel",
    }
    if payload:
        supplier_payload.update(payload)
    response = client.post("/api/admin/invoices/suppliers", json=supplier_payload)
    assert response.status_code == 200
    return response.json()


def _parse_csv_export(content: str) -> list[dict[str, str]]:
    return list(csv.DictReader(content.splitlines()))


def _vytvor_vydaj(payload: dict | None = None) -> dict:
    _login_admin()
    expense_payload = {
        "issue_date": "2099-05-01",
        "received_date": "2099-05-02",
        "due_date": "2099-05-16",
        "taxable_supply_date": "2099-05-01",
        "supplier_name": "Dodavatel s.r.o.",
        "supplier_email": "dodavatel@example.com",
        "supplier_phone": "+420987654321",
        "supplier_address": "Brno 5",
        "supplier_ico": "87654321",
        "supplier_dic": "CZ87654321",
        "supplier_data_box": "exp1234",
        "supplier_country": "Česká republika",
        "currency": "CZK",
        "vat_rate": 21,
        "note": "Přijatá faktura za materiál",
        "payment_method": "Bankovní převod",
        "bank_account_number": "123456789",
        "bank_account_prefix": "19",
        "bank_code": "0800",
        "bank_iban": "CZ6508000000001234567899",
        "items": [
            {"description": "Materiál", "quantity": 2, "unit_price": 1500},
            {"description": "Doprava", "quantity": 1, "unit_price": 500},
        ],
    }
    if payload:
        expense_payload.update(payload)
    response = client.post("/api/admin/invoices/expenses", json=expense_payload)
    assert response.status_code == 200
    return response.json()


def _vytvor_todo(payload: dict | None = None) -> dict:
    _login_admin()
    todo_payload = {
        "todo_type": "manual",
        "status": "open",
        "title": "Prověřit účetnictví",
        "message": "Zkontrolovat interní účetní poznámku.",
        "due_date": "2099-06-01",
    }
    if payload:
        todo_payload.update(payload)
    response = client.post("/api/admin/invoices/todos", json=todo_payload)
    assert response.status_code == 200
    return response.json()


def _vygeneruj_toda() -> dict:
    _login_admin()
    response = client.post("/api/admin/invoices/todos/generate")
    assert response.status_code == 200
    return response.json()


def _ziskej_relace_dokladu(invoice_id: int) -> dict:
    _login_admin()
    response = client.get(f"/api/admin/invoices/{invoice_id}/relations")
    assert response.status_code == 200
    return response.json()


def _list_relace(filters: str = "") -> list[dict]:
    _login_admin()
    suffix = f"?{filters}" if filters else ""
    response = client.get(f"/api/admin/invoices/relations{suffix}")
    assert response.status_code == 200
    return response.json()


def _pridej_platbu_vydaje(expense_id: int, payload: dict | None = None) -> dict:
    _login_admin()
    payment_payload = {
        "amount": 1000,
        "paid_at": "2026-05-10",
        "payment_method": "Bankovní převod",
        "note": "Částečná úhrada dodavateli",
    }
    if payload:
        payment_payload.update(payload)
    response = client.post(f"/api/admin/invoices/expenses/{expense_id}/payments", json=payment_payload)
    assert response.status_code == 200
    return response.json()


def _importuj_bankovni_transakce(transactions: list[dict]) -> dict:
    _login_admin()
    response = client.post("/api/admin/invoices/bank-transactions/import", json={"transactions": transactions})
    assert response.status_code == 200
    return response.json()


def _vygeneruj_matche_bankovni_transakce(transaction_id: int) -> list[dict]:
    _login_admin()
    response = client.post(f"/api/admin/invoices/bank-transactions/{transaction_id}/matches/generate")
    assert response.status_code == 200
    return response.json()


def _ziskej_matche_bankovni_transakce(transaction_id: int) -> list[dict]:
    _login_admin()
    response = client.get(f"/api/admin/invoices/bank-transactions/{transaction_id}/matches")
    assert response.status_code == 200
    return response.json()


def _ziskej_katalog_matche_bankovnich_transakci(query: str = "") -> list[dict]:
    _login_admin()
    suffix = f"?{query}" if query else ""
    response = client.get(f"/api/admin/invoices/bank-transactions/matches{suffix}")
    assert response.status_code == 200
    return response.json()


def _nastav_storage_priloh(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    storage_dir = tmp_path / "invoice_attachments"
    storage_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(attachment_storage, "STORAGE_DIR", storage_dir)


def _aplikuj_match_bankovni_transakce(transaction_id: int, match_id: int) -> dict:
    _login_admin()
    response = client.post(f"/api/admin/invoices/bank-transactions/{transaction_id}/matches/{match_id}/apply")
    assert response.status_code == 200
    return response.json()


def _vytvor_recurring_sablonu(payload: dict | None = None) -> dict:
    _login_admin()
    subject = _vytvor_subjekt({"email": "recurring-template-subject@example.com"})
    template_payload = {
        "template_type": "invoice",
        "document_kind": "invoice",
        "subject_id": subject["id"],
        "supplier_id": None,
        "name": "Recurring invoice template",
        "status": "active",
        "recurrence_interval": "monthly",
        "recurrence_count": 1,
        "next_run_date": "2099-07-01",
        "business_mode": "autoservice",
        "tax_mode": "standard",
        "currency": "CZK",
        "vat_rate": 21,
        "note": "Recurring note",
        "payment_method": None,
        "bank_account_number": None,
        "bank_account_prefix": None,
        "bank_code": None,
        "bank_iban": None,
        "items": [
            {"description": "Servisní paušál", "quantity": 1, "unit_price": 2500},
            {"description": "Monitoring", "quantity": 2, "unit_price": 500},
        ],
    }
    if payload:
        template_payload.update(payload)
    response = client.post("/api/admin/invoices/recurring-templates", json=template_payload)
    assert response.status_code == 200
    return response.json()


def _list_audit_events(filters: str = "") -> list[dict]:
    _login_admin()
    suffix = f"?{filters}" if filters else ""
    response = client.get(f"/api/admin/invoices/audit-events{suffix}")
    assert response.status_code == 200
    return response.json()


def _find_audit_event(
    events: list[dict],
    *,
    event_type: str,
    entity_type: str,
    invoice_id: int | None = None,
    expense_id: int | None = None,
    subject_id: int | None = None,
    supplier_id: int | None = None,
    bank_transaction_id: int | None = None,
    payment_match_id: int | None = None,
    todo_id: int | None = None,
    attachment_id: int | None = None,
    recurring_template_id: int | None = None,
    reminder_email_id: int | None = None,
    source: str | None = None,
) -> dict:
    for event in events:
        if event["event_type"] != event_type or event["entity_type"] != entity_type:
            continue
        if invoice_id is not None and event["invoice_id"] != invoice_id:
            continue
        if expense_id is not None and event["expense_id"] != expense_id:
            continue
        if subject_id is not None and event["subject_id"] != subject_id:
            continue
        if supplier_id is not None and event["supplier_id"] != supplier_id:
            continue
        if bank_transaction_id is not None and event["bank_transaction_id"] != bank_transaction_id:
            continue
        if payment_match_id is not None and event["payment_match_id"] != payment_match_id:
            continue
        if todo_id is not None and event["todo_id"] != todo_id:
            continue
        if attachment_id is not None and event["attachment_id"] != attachment_id:
            continue
        if recurring_template_id is not None and event["recurring_template_id"] != recurring_template_id:
            continue
        if reminder_email_id is not None and event["reminder_email_id"] != reminder_email_id:
            continue
        if source is not None and event["source"] != source:
            continue
        return event
    raise AssertionError(f"Audit event {event_type}/{entity_type} nebyl nalezen.")


def test_audit_endpoint_vyzaduje_admin_auth_a_filtry_razeni_funguji() -> None:
    invoice = _vytvor_fakturu({"customer_email": "audit-filter@example.com"})
    expense = _vytvor_vydaj({"supplier_email": "audit-expense@example.com"})
    imported = _importuj_bankovni_transakce(
        [
            {
                "external_id": "audit-filter-bank-tx",
                "transaction_date": "2026-06-01",
                "amount": invoice["total"],
                "currency": "CZK",
                "variable_symbol": invoice["variable_symbol"],
                "message": "Audit filter payment",
                "direction": "incoming",
            }
        ]
    )
    transaction_id = imported["imported_transaction_ids"][0]
    matches = _vygeneruj_matche_bankovni_transakce(transaction_id)
    anonymous_client = TestClient(app)

    global_unauthorized = anonymous_client.get("/api/admin/invoices/audit-events")
    invoice_unauthorized = anonymous_client.get(f"/api/admin/invoices/{invoice['id']}/audit-events")
    expense_unauthorized = anonymous_client.get(f"/api/admin/invoices/expenses/{expense['id']}/audit-events")

    assert global_unauthorized.status_code == 401
    assert global_unauthorized.json() == {"detail": "Přihlaste se do adminu"}
    assert invoice_unauthorized.status_code == 401
    assert invoice_unauthorized.json() == {"detail": "Přihlaste se do adminu"}
    assert expense_unauthorized.status_code == 401
    assert expense_unauthorized.json() == {"detail": "Přihlaste se do adminu"}

    all_events = _list_audit_events()
    event_ids = [event["id"] for event in all_events]
    assert event_ids == sorted(event_ids, reverse=True)

    invoice_created = _list_audit_events(f"event_type=created&entity_type=invoice&invoice_id={invoice['id']}")
    assert len(invoice_created) == 1
    assert invoice_created[0]["entity_id"] == invoice["id"]

    expense_created = _list_audit_events(f"entity_type=expense&expense_id={expense['id']}")
    assert len(expense_created) == 1
    assert expense_created[0]["event_type"] == "created"

    import_events = _list_audit_events(f"source=import&bank_transaction_id={transaction_id}")
    assert len(import_events) == 1
    assert import_events[0]["entity_type"] == "bank_transaction"

    payment_match_events = _list_audit_events(f"payment_match_id={matches[0]['id']}")
    assert len(payment_match_events) == 1
    assert payment_match_events[0]["event_type"] == "matched"
    assert payment_match_events[0]["entity_type"] == "payment_match"

    today = date.today().isoformat()
    today_events = _list_audit_events(f"date_from={today}&date_to={today}")
    assert len(today_events) == len(all_events)
    assert _list_audit_events("date_from=1999-01-01&date_to=1999-01-01") == []

    _login_admin()
    invoice_response = client.get(f"/api/admin/invoices/{invoice['id']}/audit-events")
    expense_response = client.get(f"/api/admin/invoices/expenses/{expense['id']}/audit-events")

    assert invoice_response.status_code == 200
    assert all(event["invoice_id"] == invoice["id"] for event in invoice_response.json())
    assert expense_response.status_code == 200
    assert all(event["expense_id"] == expense["id"] for event in expense_response.json())


def test_audit_eventy_se_emituji_napric_domenami_a_payload_je_bezpecny(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _nastav_storage_priloh(monkeypatch, tmp_path)

    subject = _vytvor_subjekt({"email": "audit-subject@example.com"})
    supplier = _vytvor_dodavatele({"email": "audit-supplier@example.com"})

    _login_admin()
    subject_update = client.put(
        f"/api/admin/invoices/subjects/{subject['id']}",
        json={
            "name": "Audit Subject Updated",
            "email": "audit-subject-updated@example.com",
            "phone": "+420111222333",
            "address": "Praha audit 1",
            "ico": "12345679",
            "dic": "CZ12345679",
            "data_box": "audit123",
            "country": "Česká republika",
            "note": "Updated subject note",
        },
    )
    supplier_update = client.put(
        f"/api/admin/invoices/suppliers/{supplier['id']}",
        json={
            "name": "Audit Supplier Updated",
            "email": "audit-supplier-updated@example.com",
            "phone": "+420999888777",
            "address": "Brno audit 2",
            "ico": "87654320",
            "dic": "CZ87654320",
            "data_box": "audit456",
            "country": "Česká republika",
            "note": "Updated supplier note",
        },
    )
    assert subject_update.status_code == 200
    assert supplier_update.status_code == 200

    invoice = _vytvor_fakturu({"subject_id": subject["id"], "customer_email": "audit-invoice@example.com"})
    _login_admin()
    invoice_update = client.put(
        f"/api/admin/invoices/{invoice['id']}",
        json={
            "invoice_number": invoice["invoice_number"],
            "issue_date": "2099-04-04",
            "due_date": "2099-04-19",
            "subject_id": subject["id"],
            "customer_name": "Audit customer",
            "customer_email": "audit-invoice@example.com",
            "customer_phone": "+420123456789",
            "customer_address": "Praha 10",
            "customer_ico": "12345678",
            "customer_dic": "CZ12345678",
            "note": "Audit invoice updated",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "status": "issued",
            "items": [
                {"description": "Diagnostika", "quantity": 1, "unit_price": 1200},
                {"description": "Oprava převodovky", "quantity": 2, "unit_price": 3500},
            ],
        },
    )
    assert invoice_update.status_code == 200
    paid_invoice = _pridej_platbu(invoice["id"], {"amount": 1000})
    payment_id = paid_invoice["payments"][0]["id"]
    _login_admin()
    delete_payment_response = client.delete(f"/api/admin/invoices/{invoice['id']}/payments/{payment_id}")
    assert delete_payment_response.status_code == 200

    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "status": "draft",
            "subject_id": subject["id"],
            "customer_email": "audit-quote@example.com",
        }
    )
    converted_invoice = _preved_quote(quote["id"], {"target_document_kind": "invoice", "issue_date": "2099-04-20"})

    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "status": "issued",
            "subject_id": subject["id"],
            "customer_email": "audit-proforma@example.com",
        }
    )
    proforma_with_payment = _pridej_platbu(proforma["id"], {"amount": 2500})
    proforma_payment_id = proforma_with_payment["payments"][0]["id"]
    tax_document = _vytvor_danovy_doklad_z_platby(proforma["id"], proforma_payment_id)

    second_proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "status": "issued",
            "subject_id": subject["id"],
            "customer_email": "audit-final@example.com",
        }
    )
    final_invoice = _vytvor_konecnou_fakturu([second_proforma["id"]], {"issue_date": "2099-04-21"})
    correction = _vytvor_opravny_doklad(invoice["id"], {"issue_date": "2099-04-22", "reason": "Audit correction"})

    expense = _vytvor_vydaj({"supplier_id": supplier["id"], "supplier_email": "audit-expense@example.com"})
    _login_admin()
    expense_update = client.put(
        f"/api/admin/invoices/expenses/{expense['id']}",
        json={
            "expense_number": expense["expense_number"],
            "supplier_id": supplier["id"],
            "supplier_name": "Audit Supplier Updated",
            "supplier_email": "audit-supplier-updated@example.com",
            "supplier_phone": "+420999888777",
            "supplier_address": "Brno audit 2",
            "supplier_ico": "87654320",
            "supplier_dic": "CZ87654320",
            "supplier_data_box": "audit456",
            "supplier_country": "Česká republika",
            "issue_date": "2099-05-01",
            "received_date": "2099-05-02",
            "due_date": "2099-05-16",
            "taxable_supply_date": "2099-05-01",
            "currency": "CZK",
            "vat_rate": 21,
            "note": "Audit expense updated",
            "status": "open",
            "payment_method": "Bankovní převod",
            "bank_account_number": "123456789",
            "bank_account_prefix": "19",
            "bank_code": "0800",
            "bank_iban": "CZ6508000000001234567899",
            "items": [
                {"description": "Materiál", "quantity": 2, "unit_price": 1500},
                {"description": "Doprava", "quantity": 1, "unit_price": 500},
            ],
        },
    )
    assert expense_update.status_code == 200
    expense_with_payment = _pridej_platbu_vydaje(expense["id"], {"amount": 1000})
    expense_payment_id = expense_with_payment["payments"][0]["id"]
    _login_admin()
    delete_expense_payment_response = client.delete(
        f"/api/admin/invoices/expenses/{expense['id']}/payments/{expense_payment_id}"
    )
    assert delete_expense_payment_response.status_code == 200

    manual_todo = _vytvor_todo({"invoice_id": invoice["id"], "title": "Manual audit todo"})
    cancel_todo = _vytvor_todo({"expense_id": expense["id"], "title": "Cancel audit todo"})
    _login_admin()
    complete_todo_response = client.post(f"/api/admin/invoices/todos/{manual_todo['id']}/complete")
    cancel_todo_response = client.post(f"/api/admin/invoices/todos/{cancel_todo['id']}/cancel")
    assert complete_todo_response.status_code == 200
    assert cancel_todo_response.status_code == 200

    overdue_invoice = _vytvor_fakturu(
        {
            "customer_email": "audit-overdue@example.com",
            "issue_date": "2000-01-01",
            "due_date": "2000-01-05",
        }
    )
    generated_todos = _vygeneruj_toda()
    assert generated_todos["generated_ids"]

    apply_import = _importuj_bankovni_transakce(
        [
            {
                "external_id": "audit-apply-bank-tx",
                "transaction_date": "2026-06-05",
                "amount": invoice["total"],
                "currency": "CZK",
                "variable_symbol": invoice["variable_symbol"],
                "message": "Audit apply payment",
                "direction": "incoming",
            }
        ]
    )
    apply_transaction_id = apply_import["imported_transaction_ids"][0]
    apply_matches = _vygeneruj_matche_bankovni_transakce(apply_transaction_id)
    applied_match = _aplikuj_match_bankovni_transakce(apply_transaction_id, apply_matches[0]["id"])
    assert applied_match["status"] == "applied"

    reject_import = _importuj_bankovni_transakce(
        [
            {
                "external_id": "audit-reject-bank-tx",
                "transaction_date": "2026-06-06",
                "amount": expense["total"],
                "currency": "CZK",
                "variable_symbol": expense["variable_symbol"],
                "message": "Audit reject payment",
                "direction": "outgoing",
            }
        ]
    )
    reject_transaction_id = reject_import["imported_transaction_ids"][0]
    reject_matches = _vygeneruj_matche_bankovni_transakce(reject_transaction_id)
    _login_admin()
    reject_response = client.post(
        f"/api/admin/invoices/bank-transactions/{reject_transaction_id}/matches/{reject_matches[0]['id']}/reject"
    )
    assert reject_response.status_code == 200

    ignore_import = _importuj_bankovni_transakce(
        [
            {
                "external_id": "audit-ignore-bank-tx",
                "transaction_date": "2026-06-07",
                "amount": 321,
                "currency": "CZK",
                "variable_symbol": "999888",
                "message": "Audit ignore payment",
                "direction": "incoming",
            }
        ]
    )
    ignore_transaction_id = ignore_import["imported_transaction_ids"][0]
    _login_admin()
    ignore_response = client.post(f"/api/admin/invoices/bank-transactions/{ignore_transaction_id}/ignore")
    assert ignore_response.status_code == 200

    recurring_proforma = _vytvor_recurring_sablonu(
        {
            "document_kind": "proforma",
            "name": "Recurring proforma audit",
        }
    )
    recurring_expense = _vytvor_recurring_sablonu(
        {
            "template_type": "expense",
            "document_kind": None,
            "subject_id": None,
            "supplier_id": supplier["id"],
            "name": "Recurring expense audit",
            "business_mode": None,
            "tax_mode": None,
            "payment_method": "Bankovní převod",
            "bank_account_number": "123456789",
            "bank_account_prefix": "19",
            "bank_code": "0800",
            "bank_iban": "CZ6508000000001234567899",
        }
    )
    _login_admin()
    recurring_proforma_generation = client.post(
        f"/api/admin/invoices/recurring-templates/{recurring_proforma['id']}/generate"
    )
    recurring_expense_generation = client.post(
        f"/api/admin/invoices/recurring-templates/{recurring_expense['id']}/generate"
    )
    assert recurring_proforma_generation.status_code == 200
    assert recurring_expense_generation.status_code == 200

    reminder_invoice = _vytvor_fakturu(
        {
            "customer_email": "audit-reminder@example.com",
            "issue_date": "2000-03-01",
            "due_date": "2000-03-10",
        }
    )
    from backend.app.modules.invoices import email_service as invoice_email_service

    original_is_email_configured = invoice_email_service.is_email_configured
    original_send_html_email = invoice_email_service.send_html_email
    original_build_invoice_pdf_document = invoice_email_service.build_invoice_pdf_document
    invoice_email_service.is_email_configured = lambda: True
    invoice_email_service.build_invoice_pdf_document = lambda _invoice: InvoicePdfDocument(
        filename=f"{reminder_invoice['invoice_number']}.pdf",
        content=b"%PDF-audit-reminder",
    )
    invoice_email_service.send_html_email = lambda *args, **kwargs: True
    try:
        _login_admin()
        reminder_response = client.post(f"/api/admin/invoices/{reminder_invoice['id']}/reminder-email/send")
    finally:
        invoice_email_service.is_email_configured = original_is_email_configured
        invoice_email_service.send_html_email = original_send_html_email
        invoice_email_service.build_invoice_pdf_document = original_build_invoice_pdf_document
    assert reminder_response.status_code == 200
    reminder_body = reminder_response.json()
    reminder_email_id = reminder_body["reminder_email_id"]

    _login_admin()
    upload_response = client.post(
        "/api/admin/invoices/attachments",
        files={"file": ("audit-note.txt", b"audit attachment", "text/plain")},
        data={"attachment_type": "other"},
    )
    assert upload_response.status_code == 200
    attachment = upload_response.json()
    attachment_id = attachment["id"]
    link_response = client.post(
        f"/api/admin/invoices/attachments/{attachment_id}/link",
        json={"invoice_id": invoice["id"]},
    )
    archive_response = client.post(f"/api/admin/invoices/attachments/{attachment_id}/archive")
    assert link_response.status_code == 200
    assert archive_response.status_code == 200

    events = _list_audit_events()

    _find_audit_event(events, event_type="created", entity_type="subject", subject_id=subject["id"], source="admin_api")
    _find_audit_event(events, event_type="updated", entity_type="subject", subject_id=subject["id"], source="admin_api")
    _find_audit_event(events, event_type="created", entity_type="supplier", supplier_id=supplier["id"], source="admin_api")
    _find_audit_event(events, event_type="updated", entity_type="supplier", supplier_id=supplier["id"], source="admin_api")
    _find_audit_event(events, event_type="created", entity_type="invoice", invoice_id=invoice["id"], source="admin_api")
    _find_audit_event(events, event_type="updated", entity_type="invoice", invoice_id=invoice["id"], source="admin_api")
    _find_audit_event(events, event_type="payment_added", entity_type="invoice_payment", invoice_id=invoice["id"], source="admin_api")
    _find_audit_event(events, event_type="payment_deleted", entity_type="invoice_payment", invoice_id=invoice["id"], source="admin_api")
    _find_audit_event(events, event_type="generated", entity_type="invoice", invoice_id=converted_invoice["id"], source="generation")
    _find_audit_event(events, event_type="linked", entity_type="document_relation", invoice_id=quote["id"], source="generation")
    _find_audit_event(events, event_type="generated", entity_type="invoice", invoice_id=tax_document["id"], source="generation")
    _find_audit_event(events, event_type="generated", entity_type="invoice", invoice_id=final_invoice["id"], source="generation")
    _find_audit_event(events, event_type="generated", entity_type="invoice", invoice_id=correction["id"], source="generation")
    _find_audit_event(events, event_type="created", entity_type="expense", expense_id=expense["id"], source="admin_api")
    _find_audit_event(events, event_type="updated", entity_type="expense", expense_id=expense["id"], source="admin_api")
    _find_audit_event(events, event_type="payment_added", entity_type="expense_payment", expense_id=expense["id"], source="admin_api")
    _find_audit_event(events, event_type="payment_deleted", entity_type="expense_payment", expense_id=expense["id"], source="admin_api")
    _find_audit_event(events, event_type="created", entity_type="todo", todo_id=manual_todo["id"], source="admin_api")
    _find_audit_event(events, event_type="status_changed", entity_type="todo", todo_id=manual_todo["id"], source="admin_api")
    _find_audit_event(events, event_type="status_changed", entity_type="todo", todo_id=cancel_todo["id"], source="admin_api")
    _find_audit_event(events, event_type="generated", entity_type="todo", invoice_id=overdue_invoice["id"], source="system")
    _find_audit_event(
        events,
        event_type="created",
        entity_type="bank_transaction",
        bank_transaction_id=apply_transaction_id,
        source="import",
    )
    _find_audit_event(
        events,
        event_type="matched",
        entity_type="payment_match",
        payment_match_id=apply_matches[0]["id"],
        source="bank_matching",
    )
    _find_audit_event(
        events,
        event_type="match_applied",
        entity_type="payment_match",
        payment_match_id=apply_matches[0]["id"],
        source="bank_matching",
    )
    _find_audit_event(
        events,
        event_type="match_rejected",
        entity_type="payment_match",
        payment_match_id=reject_matches[0]["id"],
        source="bank_matching",
    )
    _find_audit_event(
        events,
        event_type="ignored",
        entity_type="bank_transaction",
        bank_transaction_id=ignore_transaction_id,
        source="bank_matching",
    )
    _find_audit_event(
        events,
        event_type="created",
        entity_type="recurring_template",
        recurring_template_id=recurring_proforma["id"],
        source="admin_api",
    )
    _find_audit_event(
        events,
        event_type="generated",
        entity_type="recurring_template",
        recurring_template_id=recurring_proforma["id"],
        source="generation",
    )
    _find_audit_event(
        events,
        event_type="generated",
        entity_type="recurring_template",
        recurring_template_id=recurring_expense["id"],
        source="generation",
    )
    _find_audit_event(
        events,
        event_type="generated",
        entity_type="reminder_email",
        reminder_email_id=reminder_email_id,
        source="email",
    )
    _find_audit_event(
        events,
        event_type="email_sent",
        entity_type="reminder_email",
        reminder_email_id=reminder_email_id,
        source="email",
    )
    upload_event = _find_audit_event(
        events,
        event_type="uploaded",
        entity_type="attachment",
        attachment_id=attachment_id,
        source="admin_api",
    )
    _find_audit_event(events, event_type="linked", entity_type="attachment", attachment_id=attachment_id, source="admin_api")
    _find_audit_event(events, event_type="archived", entity_type="attachment", attachment_id=attachment_id, source="admin_api")

    assert upload_event["new_values"]["original_filename"] == "audit-note.txt"
    assert "stored_filename" not in upload_event["new_values"]
    assert str(tmp_path) not in str(upload_event)

    with SessionLocal() as db:
        stored_upload_event = (
            db.query(InvoiceAccountingEvent)
            .filter(
                InvoiceAccountingEvent.event_type == "uploaded",
                InvoiceAccountingEvent.entity_type == "attachment",
                InvoiceAccountingEvent.attachment_id == attachment_id,
            )
            .one()
        )
        assert stored_upload_event.new_values is not None
        assert "audit attachment" not in stored_upload_event.new_values
        assert "stored_filename" not in stored_upload_event.new_values
        assert str(tmp_path) not in stored_upload_event.new_values


def test_vytvoreni_seznam_a_detail_faktury() -> None:
    _login_admin()

    captured = {"invoice": None, "customer": None}

    class FakeCacheService(InvoiceCacheService):
        def __init__(self):
            super().__init__(client=None)

        def cache_invoice_detail(self, export_dto):
            captured["invoice"] = export_dto
            return True

        def cache_customer_profile(self, export_dto):
            captured["customer"] = export_dto
            return True

    from backend.app.modules.invoices import service as invoice_service

    original_get_cache_service = invoice_service.get_invoice_cache_service
    invoice_service.get_invoice_cache_service = lambda: FakeCacheService()
    try:
        create_response = client.post(
                "/api/admin/invoices",
                json={
                    "issue_date": "2099-04-04",
                    "due_date": "2099-04-18",
                "customer_name": "Jan Novák",
                "customer_email": "jan@example.com",
                "customer_phone": "+420123456789",
                "customer_address": "Praha 10",
                "customer_ico": "12345678",
                "customer_dic": "CZ12345678",
                "note": "Ruční servisní faktura",
                "business_mode": "autoservice",
                "tax_mode": "standard",
                "currency": "CZK",
                "vat_rate": 21,
                "items": [
                    {"description": "Diagnostika", "quantity": 1, "unit_price": 1200},
                    {"description": "Oprava převodovky", "quantity": 2, "unit_price": 3500},
                ],
            },
        )
    finally:
        invoice_service.get_invoice_cache_service = original_get_cache_service

    assert create_response.status_code == 200
    invoice = create_response.json()
    assert invoice["invoice_number"] == "001"
    assert invoice["variable_symbol"] == "001"
    assert invoice["document_kind"] == "invoice"
    assert invoice["issuer_name"] == "lakodi s.r.o."
    assert invoice["issuer_ico"] == "09695982"
    assert invoice["currency"] == "CZK"
    assert invoice["status"] == "issued"
    assert invoice["effective_status"] == "issued"
    assert invoice["payment_status"] == "unpaid"
    assert invoice["total_paid"] == 0.0
    assert invoice["remaining_amount"] == 9922.0
    assert invoice["payment_method"] == "Převodem"
    assert invoice["bank_account_number"] == "5997826359"
    assert invoice["bank_code"] == "0800"
    assert invoice["bank_iban"] == "CZ9108000000005997826359"
    assert invoice["subtotal"] == 8200.0
    assert invoice["vat_amount"] == 1722.0
    assert invoice["total"] == 9922.0
    assert invoice["reverse_charge_reason"] is None
    assert len(invoice["items"]) == 2
    assert invoice["payments"] == []
    assert invoice["items"][1]["line_total"] == 7000.0
    assert captured["invoice"] is not None
    assert captured["customer"] is not None
    assert captured["invoice"].identity.invoice_number == "001"
    assert captured["invoice"].payment.variable_symbol == "001"
    assert captured["customer"].customer.email == "jan@example.com"

    list_response = client.get("/api/admin/invoices")
    assert list_response.status_code == 200
    listed = list_response.json()
    assert len(listed) == 1
    assert listed[0]["id"] == invoice["id"]
    assert listed[0]["invoice_number"] == "001"
    assert listed[0]["document_kind"] == "invoice"
    assert listed[0]["effective_status"] == "issued"
    assert listed[0]["payment_status"] == "unpaid"

    detail_response = client.get(f"/api/admin/invoices/{invoice['id']}")
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["id"] == invoice["id"]
    assert detail["customer_name"] == "Jan Novák"
    assert detail["items"][0]["description"] == "Diagnostika"
    assert detail["variable_symbol"] == "001"
    assert detail["document_kind"] == "invoice"
    assert detail["payments"] == []
    assert detail["remaining_amount"] == 9922.0


def test_vytvoreni_faktury_se_subject_id_zkopiruje_snapshot_subjektu() -> None:
    subject = _vytvor_subjekt(
        {
            "name": "Master Subject",
            "email": "master@example.com",
            "phone": "+420111222333",
            "address": "Brno 1",
            "ico": "99999999",
            "dic": "CZ99999999",
        }
    )

    invoice = _vytvor_fakturu(
        {
            "subject_id": subject["id"],
            "customer_name": None,
            "customer_email": None,
            "customer_address": None,
            "customer_phone": None,
            "customer_ico": None,
            "customer_dic": None,
        }
    )

    assert invoice["subject_id"] == subject["id"]
    assert invoice["customer_name"] == "Master Subject"
    assert invoice["customer_email"] == "master@example.com"
    assert invoice["customer_phone"] == "+420111222333"
    assert invoice["customer_address"] == "Brno 1"
    assert invoice["customer_ico"] == "99999999"
    assert invoice["customer_dic"] == "CZ99999999"


def test_vytvoreni_faktury_se_subject_id_prepise_explicitni_customer_fields_snapshotem_subjektu() -> None:
    subject = _vytvor_subjekt(
        {
            "name": "Registry Winner",
            "email": "winner@example.com",
            "phone": "+420555666777",
            "address": "Ostrava 8",
            "ico": "55555555",
            "dic": "CZ55555555",
        }
    )

    invoice = _vytvor_fakturu(
        {
            "subject_id": subject["id"],
            "customer_name": "Ignored Name",
            "customer_email": "ignored@example.com",
            "customer_phone": "+420000000000",
            "customer_address": "Ignored Address",
            "customer_ico": "00000000",
            "customer_dic": "CZ00000000",
        }
    )

    assert invoice["subject_id"] == subject["id"]
    assert invoice["customer_name"] == "Registry Winner"
    assert invoice["customer_email"] == "winner@example.com"
    assert invoice["customer_phone"] == "+420555666777"
    assert invoice["customer_address"] == "Ostrava 8"
    assert invoice["customer_ico"] == "55555555"
    assert invoice["customer_dic"] == "CZ55555555"


def test_faktura_v_rezimu_prenesene_danove_povinnosti() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices",
        json={
            "issue_date": "2026-04-04",
            "due_date": "2026-04-20",
            "customer_name": "Stavby Partner",
            "customer_email": "stavby@example.com",
            "customer_address": "Stavební 1, 110 00 Praha",
            "business_mode": "construction",
            "tax_mode": "reverse_charge",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [
                {"description": "Odvoz železa", "quantity": 3, "unit_price": 5000},
            ],
        },
    )

    assert response.status_code == 200
    invoice = response.json()
    assert invoice["document_kind"] == "invoice"
    assert invoice["business_mode"] == "construction"
    assert invoice["tax_mode"] == "reverse_charge"
    assert invoice["subtotal"] == 15000.0
    assert invoice["vat_amount"] == 0.0
    assert invoice["total"] == 15000.0
    assert invoice["items"][0]["description"] == "Odvoz železa"
    assert invoice["reverse_charge_reason"] == "reverse_charge"
    assert "Daň odvede zákazník" in invoice["reverse_charge_text"]


def test_defaults_vraci_navrzene_cislo_faktury_a_variabilni_symbol() -> None:
    _login_admin()

    response = client.get("/api/admin/invoices/defaults")

    assert response.status_code == 200
    assert response.json() == {
        "document_kind": "invoice",
        "suggested_invoice_number": "001",
        "suggested_variable_symbol": "001",
    }


def test_nastaveni_fakturace_vraci_defaultni_hodnoty() -> None:
    _login_admin()

    response = client.get("/api/admin/invoices/settings")

    assert response.status_code == 200
    assert response.json() == {
        "owner_email": "lakodi@seznam.cz",
        "issuer_name": "lakodi s.r.o.",
        "issuer_address": "Jaurisova 515/4, Michle, 140 00 Praha",
        "issuer_city": "Praha",
        "issuer_zip": "140 00",
        "issuer_ico": "09695982",
        "issuer_dic": "CZ09695982",
        "issuer_data_box": "wzzs5bi",
        "issuer_email": None,
        "issuer_phone": None,
        "default_currency": "CZK",
        "default_due_days": 14,
        "default_note": None,
        "payment_method": "Převodem",
        "bank_account_number": "5997826359",
        "bank_account_prefix": None,
        "bank_code": "0800",
        "bank_iban": "CZ9108000000005997826359",
        "account_label": "5997826359/0800",
    }


def test_vytvoreni_subjektu_funguje() -> None:
    subject = _vytvor_subjekt()

    assert subject["id"] > 0
    assert subject["name"] == "Jan Novák"
    assert subject["email"] == "jan.subject@example.com"
    assert subject["phone"] == "+420123456789"
    assert subject["address"] == "Praha 10"
    assert subject["ico"] == "12345678"
    assert subject["dic"] == "CZ12345678"
    assert subject["data_box"] == "abcd123"
    assert subject["country"] == "Česká republika"
    assert subject["note"] == "VIP zákazník"


def test_list_subjektu_funguje() -> None:
    first = _vytvor_subjekt({"name": "Jan Novák", "email": "list1@example.com"})
    second = _vytvor_subjekt({"name": "Petr Svoboda", "email": "list2@example.com"})
    _login_admin()

    response = client.get("/api/admin/invoices/subjects")

    assert response.status_code == 200
    listed = response.json()
    assert len(listed) == 2
    assert listed[0]["id"] == second["id"]
    assert listed[1]["id"] == first["id"]


def test_search_subjektu_podle_name_email_ico_dic_funguje() -> None:
    _vytvor_subjekt({"name": "Autoservis Alfa", "email": "alfa@example.com", "ico": "11111111", "dic": "CZ11111111"})
    _vytvor_subjekt({"name": "Stavby Beta", "email": "beta@example.com", "ico": "22222222", "dic": "CZ22222222"})
    _login_admin()

    by_name = client.get("/api/admin/invoices/subjects?search=alfa")
    by_email = client.get("/api/admin/invoices/subjects?search=beta@example.com")
    by_ico = client.get("/api/admin/invoices/subjects?search=11111111")
    by_dic = client.get("/api/admin/invoices/subjects?search=CZ22222222")

    assert by_name.status_code == 200
    assert by_email.status_code == 200
    assert by_ico.status_code == 200
    assert by_dic.status_code == 200
    assert len(by_name.json()) == 1
    assert by_name.json()[0]["name"] == "Autoservis Alfa"
    assert len(by_email.json()) == 1
    assert by_email.json()[0]["email"] == "beta@example.com"
    assert len(by_ico.json()) == 1
    assert by_ico.json()[0]["ico"] == "11111111"
    assert len(by_dic.json()) == 1
    assert by_dic.json()[0]["dic"] == "CZ22222222"


def test_detail_subjektu_funguje() -> None:
    subject = _vytvor_subjekt({"name": "Detail Subject", "email": "detail@example.com"})
    _login_admin()

    response = client.get(f"/api/admin/invoices/subjects/{subject['id']}")

    assert response.status_code == 200
    assert response.json()["id"] == subject["id"]
    assert response.json()["name"] == "Detail Subject"


def test_update_subjektu_funguje() -> None:
    subject = _vytvor_subjekt()
    _login_admin()

    response = client.put(
        f"/api/admin/invoices/subjects/{subject['id']}",
        json={
            "name": "Jan Novák Updated",
            "email": "updated@example.com",
            "phone": "+420777888999",
            "address": "Brno 5",
            "ico": "87654321",
            "dic": "CZ87654321",
            "data_box": "newbox22",
            "country": "Slovensko",
            "note": "Aktualizovaný subjekt",
        },
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["name"] == "Jan Novák Updated"
    assert updated["email"] == "updated@example.com"
    assert updated["phone"] == "+420777888999"
    assert updated["address"] == "Brno 5"
    assert updated["ico"] == "87654321"
    assert updated["dic"] == "CZ87654321"
    assert updated["data_box"] == "newbox22"
    assert updated["country"] == "Slovensko"
    assert updated["note"] == "Aktualizovaný subjekt"


def test_smazani_nepouziteho_subjektu_funguje() -> None:
    subject = _vytvor_subjekt({"email": "delete@example.com"})
    _login_admin()

    response = client.delete(f"/api/admin/invoices/subjects/{subject['id']}")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "subject_id": subject["id"]}

    detail_response = client.get(f"/api/admin/invoices/subjects/{subject['id']}")
    assert detail_response.status_code == 404
    assert detail_response.json() == {"detail": "Subjekt nebyl nalezen."}


def test_smazani_subjektu_navazaneho_na_fakturu_je_blokovano() -> None:
    subject = _vytvor_subjekt({"email": "referenced@example.com"})
    invoice = _vytvor_fakturu(
        {
            "subject_id": subject["id"],
            "customer_name": None,
            "customer_email": None,
            "customer_address": None,
            "customer_phone": None,
            "customer_ico": None,
            "customer_dic": None,
        }
    )
    _login_admin()

    response = client.delete(f"/api/admin/invoices/subjects/{subject['id']}")

    assert invoice["subject_id"] == subject["id"]
    assert response.status_code == 400
    assert response.json() == {"detail": "Subjekt nelze smazat, protože je navázaný na existující faktury."}


def test_update_faktury_se_subject_id_zkopiruje_snapshot_noveho_subjektu() -> None:
    first_subject = _vytvor_subjekt(
        {
            "name": "First Subject",
            "email": "first.subject@example.com",
            "address": "Plzeň 3",
            "ico": "10101010",
            "dic": "CZ10101010",
        }
    )
    second_subject = _vytvor_subjekt(
        {
            "name": "Second Subject",
            "email": "second.subject@example.com",
            "phone": "+420999888777",
            "address": "Liberec 7",
            "ico": "20202020",
            "dic": "CZ20202020",
        }
    )
    invoice = _vytvor_fakturu(
        {
            "subject_id": first_subject["id"],
            "customer_name": None,
            "customer_email": None,
            "customer_address": None,
            "customer_phone": None,
            "customer_ico": None,
            "customer_dic": None,
        }
    )
    _login_admin()

    response = client.put(
        f"/api/admin/invoices/{invoice['id']}",
        json={
            "subject_id": second_subject["id"],
            "invoice_number": invoice["invoice_number"],
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
            "customer_name": None,
            "customer_email": None,
            "customer_phone": None,
            "customer_address": None,
            "customer_ico": None,
            "customer_dic": None,
            "note": "Ruční servisní faktura",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [
                {"description": "Diagnostika", "quantity": 1, "unit_price": 1200},
                {"description": "Oprava převodovky", "quantity": 2, "unit_price": 3500},
            ],
        },
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["subject_id"] == second_subject["id"]
    assert updated["customer_name"] == "Second Subject"
    assert updated["customer_email"] == "second.subject@example.com"
    assert updated["customer_phone"] == "+420999888777"
    assert updated["customer_address"] == "Liberec 7"
    assert updated["customer_ico"] == "20202020"
    assert updated["customer_dic"] == "CZ20202020"


def test_uprava_subjektu_po_vystaveni_faktury_nemeni_historicky_snapshot() -> None:
    subject = _vytvor_subjekt(
        {
            "name": "Historic Subject",
            "email": "historic@example.com",
            "address": "Praha 1",
        }
    )
    invoice = _vytvor_fakturu(
        {
            "subject_id": subject["id"],
            "customer_name": None,
            "customer_email": None,
            "customer_address": None,
            "customer_phone": None,
            "customer_ico": None,
            "customer_dic": None,
        }
    )
    _login_admin()

    update_subject_response = client.put(
        f"/api/admin/invoices/subjects/{subject['id']}",
        json={
            "name": "Historic Subject Updated",
            "email": "updated-historic@example.com",
            "phone": "+420777111222",
            "address": "Brno 9",
            "ico": "30303030",
            "dic": "CZ30303030",
            "data_box": "historic01",
            "country": "Česká republika",
            "note": "Updated note",
        },
    )
    assert update_subject_response.status_code == 200

    detail_response = client.get(f"/api/admin/invoices/{invoice['id']}")
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["subject_id"] == subject["id"]
    assert detail["customer_name"] == "Historic Subject"
    assert detail["customer_email"] == "historic@example.com"
    assert detail["customer_address"] == "Praha 1"


def test_detail_a_list_faktury_zustavaji_kompatibilni_a_obsahuji_subject_id() -> None:
    subject = _vytvor_subjekt({"email": "list-detail-subject@example.com"})
    invoice = _vytvor_fakturu(
        {
            "subject_id": subject["id"],
            "customer_name": None,
            "customer_email": None,
            "customer_address": None,
            "customer_phone": None,
            "customer_ico": None,
            "customer_dic": None,
        }
    )

    list_response = client.get("/api/admin/invoices")
    detail_response = client.get(f"/api/admin/invoices/{invoice['id']}")

    assert list_response.status_code == 200
    assert detail_response.status_code == 200
    assert list_response.json()[0]["subject_id"] == subject["id"]
    assert detail_response.json()["subject_id"] == subject["id"]


def test_vytvoreni_dodavatele_funguje() -> None:
    supplier = _vytvor_dodavatele()

    assert supplier["id"] > 0
    assert supplier["name"] == "Dodavatel s.r.o."
    assert supplier["email"] == "supplier.registry@example.com"
    assert supplier["phone"] == "+420987654321"
    assert supplier["address"] == "Brno 5"
    assert supplier["ico"] == "87654321"
    assert supplier["dic"] == "CZ87654321"
    assert supplier["data_box"] == "exp1234"
    assert supplier["country"] == "Česká republika"
    assert supplier["note"] == "Preferovaný dodavatel"


def test_list_a_search_dodavatelu_funguji() -> None:
    first = _vytvor_dodavatele({"name": "Alfa Supplier", "email": "alfa-supplier@example.com", "ico": "11111111", "dic": "CZ11111111"})
    second = _vytvor_dodavatele({"name": "Beta Supplier", "email": "beta-supplier@example.com", "ico": "22222222", "dic": "CZ22222222"})
    _login_admin()

    list_response = client.get("/api/admin/invoices/suppliers")
    by_name = client.get("/api/admin/invoices/suppliers?search=alfa")
    by_email = client.get("/api/admin/invoices/suppliers?search=beta-supplier@example.com")
    by_ico = client.get("/api/admin/invoices/suppliers?search=11111111")
    by_dic = client.get("/api/admin/invoices/suppliers?search=CZ22222222")

    assert list_response.status_code == 200
    assert by_name.status_code == 200
    assert by_email.status_code == 200
    assert by_ico.status_code == 200
    assert by_dic.status_code == 200
    listed = list_response.json()
    assert listed[0]["id"] == second["id"]
    assert listed[1]["id"] == first["id"]
    assert by_name.json()[0]["name"] == "Alfa Supplier"
    assert by_email.json()[0]["email"] == "beta-supplier@example.com"
    assert by_ico.json()[0]["ico"] == "11111111"
    assert by_dic.json()[0]["dic"] == "CZ22222222"


def test_detail_a_update_dodavatele_funguji() -> None:
    supplier = _vytvor_dodavatele({"name": "Detail Supplier", "email": "detail-supplier@example.com"})
    _login_admin()

    detail_response = client.get(f"/api/admin/invoices/suppliers/{supplier['id']}")
    update_response = client.put(
        f"/api/admin/invoices/suppliers/{supplier['id']}",
        json={
            "name": "Updated Supplier",
            "email": "updated-supplier@example.com",
            "phone": "+420111222333",
            "address": "Ostrava 8",
            "ico": "33334444",
            "dic": "CZ33334444",
            "data_box": "supplier22",
            "country": "Slovensko",
            "note": "Aktualizovaný dodavatel",
        },
    )

    assert detail_response.status_code == 200
    assert detail_response.json()["id"] == supplier["id"]
    assert detail_response.json()["name"] == "Detail Supplier"
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["name"] == "Updated Supplier"
    assert updated["email"] == "updated-supplier@example.com"
    assert updated["country"] == "Slovensko"
    assert updated["note"] == "Aktualizovaný dodavatel"


def test_smazani_nepouziteho_dodavatele_funguje() -> None:
    supplier = _vytvor_dodavatele({"email": "delete-supplier@example.com"})
    _login_admin()

    response = client.delete(f"/api/admin/invoices/suppliers/{supplier['id']}")
    detail_response = client.get(f"/api/admin/invoices/suppliers/{supplier['id']}")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "supplier_id": supplier["id"]}
    assert detail_response.status_code == 404
    assert detail_response.json() == {"detail": "Dodavatel nebyl nalezen."}


def test_smazani_dodavatele_navazaneho_na_vydaj_je_blokovano() -> None:
    supplier = _vytvor_dodavatele({"email": "referenced-supplier@example.com"})
    expense = _vytvor_vydaj(
        {
            "supplier_id": supplier["id"],
            "supplier_name": None,
            "supplier_email": None,
            "supplier_phone": None,
            "supplier_address": None,
            "supplier_ico": None,
            "supplier_dic": None,
            "supplier_data_box": None,
            "supplier_country": None,
        }
    )
    _login_admin()

    response = client.delete(f"/api/admin/invoices/suppliers/{supplier['id']}")

    assert expense["supplier_id"] == supplier["id"]
    assert response.status_code == 400
    assert response.json() == {"detail": "Dodavatele nelze smazat, protože je navázaný na existující výdaje."}


def test_ulozeni_nastaveni_fakturace_se_propise_do_novych_faktur() -> None:
    _login_admin()

    save_response = client.put(
        "/api/admin/invoices/settings",
        json={
            "owner_email": "ucetni@lakodi.cz",
            "issuer_name": "Novy Lakodi s.r.o.",
            "issuer_address": "Nova 1",
            "issuer_city": "Brno",
            "issuer_zip": "60200",
            "issuer_ico": "12345678",
            "issuer_dic": "CZ12345678",
            "issuer_data_box": "newdb01",
            "issuer_email": "faktury@lakodi.cz",
            "issuer_phone": "+420777111222",
            "default_currency": "EUR",
            "default_due_days": 21,
            "default_note": "Výchozí poznámka k faktuře",
            "payment_method": "Bankovním převodem",
            "bank_account_number": "1234567890",
            "bank_account_prefix": "19",
            "bank_code": "0800",
            "bank_iban": "",
        },
    )

    assert save_response.status_code == 200
    saved = save_response.json()
    assert saved["owner_email"] == "ucetni@lakodi.cz"
    assert saved["issuer_name"] == "Novy Lakodi s.r.o."
    assert saved["issuer_address"] == "Nova 1"
    assert saved["issuer_city"] == "Brno"
    assert saved["issuer_zip"] == "60200"
    assert saved["issuer_ico"] == "12345678"
    assert saved["issuer_dic"] == "CZ12345678"
    assert saved["issuer_data_box"] == "newdb01"
    assert saved["issuer_email"] == "faktury@lakodi.cz"
    assert saved["issuer_phone"] == "+420777111222"
    assert saved["default_currency"] == "EUR"
    assert saved["default_due_days"] == 21
    assert saved["default_note"] == "Výchozí poznámka k faktuře"
    assert saved["payment_method"] == "Bankovním převodem"
    assert saved["bank_account_number"] == "1234567890"
    assert saved["bank_account_prefix"] == "19"
    assert saved["bank_code"] == "0800"
    assert saved["account_label"] == "19-1234567890/0800"
    assert saved["bank_iban"].startswith("CZ")

    invoice = _vytvor_fakturu()
    assert invoice["issuer_name"] == "Novy Lakodi s.r.o."
    assert invoice["issuer_address"] == "Nova 1"
    assert invoice["issuer_city"] == "Brno"
    assert invoice["issuer_zip"] == "60200"
    assert invoice["issuer_ico"] == "12345678"
    assert invoice["issuer_dic"] == "CZ12345678"
    assert invoice["issuer_data_box"] == "newdb01"
    assert invoice["currency"] == "CZK"
    assert invoice["payment_method"] == "Bankovním převodem"
    assert invoice["bank_account_number"] == "1234567890"
    assert invoice["bank_account_prefix"] == "19"
    assert invoice["bank_code"] == "0800"
    assert invoice["bank_iban"] == saved["bank_iban"]
    assert invoice["note"] == "Ruční servisní faktura"


def test_rucne_nastavene_cislo_faktury_posune_dalsi_automatickou_radu() -> None:
    prvni = _vytvor_fakturu({"invoice_number": "024"})
    druha = _vytvor_fakturu({"customer_email": "druhy@example.com"})

    assert prvni["invoice_number"] == "024"
    assert prvni["variable_symbol"] == "024"
    assert druha["invoice_number"] == "025"
    assert druha["variable_symbol"] == "025"

    _login_admin()
    defaults_response = client.get("/api/admin/invoices/defaults")
    assert defaults_response.status_code == 200
    assert defaults_response.json() == {
        "document_kind": "invoice",
        "suggested_invoice_number": "026",
        "suggested_variable_symbol": "026",
    }


def test_stara_faktura_si_po_zmene_settings_necha_puvodni_issuer_snapshot() -> None:
    original = _vytvor_fakturu({"customer_email": "puvodni@example.com"})

    _login_admin()
    save_response = client.put(
        "/api/admin/invoices/settings",
        json={
            "owner_email": "ucetni@lakodi.cz",
            "issuer_name": "Druhy Dodavatel s.r.o.",
            "issuer_address": "Zmenena 99",
            "issuer_city": "Ostrava",
            "issuer_zip": "70030",
            "issuer_ico": "87654321",
            "issuer_dic": "CZ87654321",
            "issuer_data_box": "newbox22",
            "issuer_email": "office@dodavatel.cz",
            "issuer_phone": "+420777999000",
            "default_currency": "CZK",
            "default_due_days": 30,
            "default_note": "Novy default note",
            "payment_method": "Převodem",
            "bank_account_number": "5997826359",
            "bank_account_prefix": "",
            "bank_code": "0800",
            "bank_iban": "CZ9108000000005997826359",
        },
    )
    assert save_response.status_code == 200

    detail_response = client.get(f"/api/admin/invoices/{original['id']}")
    assert detail_response.status_code == 200
    unchanged = detail_response.json()
    assert unchanged["issuer_name"] == "lakodi s.r.o."
    assert unchanged["issuer_address"] == "Jaurisova 515/4, Michle, 140 00 Praha"
    assert unchanged["issuer_city"] == "Praha"
    assert unchanged["issuer_zip"] == "140 00"
    assert unchanged["issuer_ico"] == "09695982"
    assert unchanged["issuer_dic"] == "CZ09695982"
    assert unchanged["issuer_data_box"] == "wzzs5bi"


def test_vytvoreni_faktury_bez_persisted_settings_funguje_s_fallback_company_snapshotem() -> None:
    invoice = _vytvor_fakturu({"customer_email": "fallback@example.com"})

    assert invoice["issuer_name"] == "lakodi s.r.o."
    assert invoice["issuer_address"] == "Jaurisova 515/4, Michle, 140 00 Praha"
    assert invoice["issuer_city"] == "Praha"
    assert invoice["issuer_zip"] == "140 00"
    assert invoice["issuer_ico"] == "09695982"
    assert invoice["issuer_dic"] == "CZ09695982"
    assert invoice["issuer_data_box"] == "wzzs5bi"


def test_rucne_nizsi_volne_cislo_faktury_je_povoleno() -> None:
    _vytvor_fakturu({"invoice_number": "024"})
    _vytvor_fakturu({"customer_email": "druhy@example.com"})
    treti = _vytvor_fakturu({"invoice_number": "010", "customer_email": "treti@example.com"})

    assert treti["invoice_number"] == "010"
    assert treti["variable_symbol"] == "010"

    _login_admin()
    defaults_response = client.get("/api/admin/invoices/defaults")
    assert defaults_response.status_code == 200
    assert defaults_response.json() == {
        "document_kind": "invoice",
        "suggested_invoice_number": "026",
        "suggested_variable_symbol": "026",
    }


def test_numbering_foundation_pripravi_nezavisle_dokladove_rady_podle_typu_a_roku() -> None:
    with SessionLocal() as db:
        invoice_preview = get_document_sequence_preview(db, document_kind="invoice", reference_date=date(2026, 1, 1))
        proforma_preview = get_document_sequence_preview(db, document_kind="proforma", reference_date=date(2026, 1, 1))
        next_proforma = reserve_document_sequence(db, document_kind="proforma", reference_date=date(2026, 1, 1))
        next_quote = reserve_document_sequence(db, document_kind="quote", reference_date=date(2026, 1, 1))
        future_proforma = get_document_sequence_preview(db, document_kind="proforma", reference_date=date(2027, 1, 1))

        assert invoice_preview.sequence_key == "invoice:2026"
        assert invoice_preview.sequence_year == 2026
        assert invoice_preview.invoice_number == "2026001"
        assert invoice_preview.variable_symbol == "2026001"

        assert proforma_preview.sequence_key == "proforma:2026"
        assert proforma_preview.sequence_year == 2026
        assert proforma_preview.invoice_number == "12026001"
        assert next_proforma.invoice_number == "12026001"

        assert next_quote.sequence_key == "quote:2026"
        assert next_quote.invoice_number == "52026001"

        assert future_proforma.sequence_key == "proforma:2027"
        assert future_proforma.sequence_year == 2027
        assert future_proforma.invoice_number == "12027001"


def test_defaults_preview_pro_proformu_je_oddeleny_od_bezne_invoice_rady() -> None:
    _login_admin()

    proforma_response = client.get("/api/admin/invoices/defaults?document_kind=proforma")
    invoice_response = client.get("/api/admin/invoices/defaults")

    assert proforma_response.status_code == 200
    assert invoice_response.status_code == 200

    proforma_defaults = proforma_response.json()
    invoice_defaults = invoice_response.json()
    assert proforma_defaults["document_kind"] == "proforma"
    assert proforma_defaults["suggested_invoice_number"].isdigit()
    assert proforma_defaults["suggested_variable_symbol"].isdigit()
    assert proforma_defaults["suggested_invoice_number"].startswith("1")
    assert invoice_defaults == {
        "document_kind": "invoice",
        "suggested_invoice_number": "001",
        "suggested_variable_symbol": "001",
    }


def test_defaults_preview_pro_tax_document_je_oddeleny_od_ostatnich_rad() -> None:
    _login_admin()

    tax_document_response = client.get("/api/admin/invoices/defaults?document_kind=tax_document")
    invoice_response = client.get("/api/admin/invoices/defaults")

    assert tax_document_response.status_code == 200
    assert invoice_response.status_code == 200

    tax_document_defaults = tax_document_response.json()
    invoice_defaults = invoice_response.json()
    assert tax_document_defaults["document_kind"] == "tax_document"
    assert tax_document_defaults["suggested_invoice_number"].isdigit()
    assert tax_document_defaults["suggested_variable_symbol"].isdigit()
    assert tax_document_defaults["suggested_invoice_number"].startswith("2")
    assert tax_document_defaults["suggested_variable_symbol"] == tax_document_defaults["suggested_invoice_number"]
    assert invoice_defaults == {
        "document_kind": "invoice",
        "suggested_invoice_number": "001",
        "suggested_variable_symbol": "001",
    }


def test_defaults_preview_pro_final_invoice_je_oddeleny_od_ostatnich_rad() -> None:
    _login_admin()

    final_invoice_response = client.get("/api/admin/invoices/defaults?document_kind=final_invoice")
    invoice_response = client.get("/api/admin/invoices/defaults")

    assert final_invoice_response.status_code == 200
    assert invoice_response.status_code == 200

    final_invoice_defaults = final_invoice_response.json()
    invoice_defaults = invoice_response.json()
    assert final_invoice_defaults["document_kind"] == "final_invoice"
    assert final_invoice_defaults["suggested_invoice_number"].isdigit()
    assert final_invoice_defaults["suggested_variable_symbol"].isdigit()
    assert final_invoice_defaults["suggested_invoice_number"].startswith("4")
    assert final_invoice_defaults["suggested_variable_symbol"] == final_invoice_defaults["suggested_invoice_number"]
    assert invoice_defaults == {
        "document_kind": "invoice",
        "suggested_invoice_number": "001",
        "suggested_variable_symbol": "001",
    }


def test_defaults_preview_pro_correction_je_oddeleny_od_ostatnich_rad() -> None:
    _login_admin()

    correction_response = client.get("/api/admin/invoices/defaults?document_kind=correction")
    invoice_response = client.get("/api/admin/invoices/defaults")

    assert correction_response.status_code == 200
    assert invoice_response.status_code == 200

    correction_defaults = correction_response.json()
    invoice_defaults = invoice_response.json()
    assert correction_defaults["document_kind"] == "correction"
    assert correction_defaults["suggested_invoice_number"].isdigit()
    assert correction_defaults["suggested_variable_symbol"].isdigit()
    assert correction_defaults["suggested_invoice_number"].startswith("3")
    assert correction_defaults["suggested_variable_symbol"] == correction_defaults["suggested_invoice_number"]
    assert invoice_defaults == {
        "document_kind": "invoice",
        "suggested_invoice_number": "001",
        "suggested_variable_symbol": "001",
    }


def test_defaults_preview_pro_quote_je_oddeleny_od_ostatnich_rad() -> None:
    _login_admin()

    quote_response = client.get("/api/admin/invoices/defaults?document_kind=quote")
    invoice_response = client.get("/api/admin/invoices/defaults")

    assert quote_response.status_code == 200
    assert invoice_response.status_code == 200

    quote_defaults = quote_response.json()
    invoice_defaults = invoice_response.json()
    assert quote_defaults["document_kind"] == "quote"
    assert quote_defaults["suggested_invoice_number"].isdigit()
    assert quote_defaults["suggested_variable_symbol"].isdigit()
    assert quote_defaults["suggested_invoice_number"].startswith("5")
    assert quote_defaults["suggested_variable_symbol"] == quote_defaults["suggested_invoice_number"]
    assert invoice_defaults == {
        "document_kind": "invoice",
        "suggested_invoice_number": "001",
        "suggested_variable_symbol": "001",
    }


def test_vytvoreni_proformy_pouzije_document_kind_a_vlastni_radu() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "proforma@example.com",
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
        }
    )
    invoice = _vytvor_fakturu({"customer_email": "normal@example.com"})

    assert proforma["document_kind"] == "proforma"
    assert proforma["invoice_number"] == "12026001"
    assert proforma["variable_symbol"] == "12026001"

    assert invoice["document_kind"] == "invoice"
    assert invoice["invoice_number"] == "001"
    assert invoice["variable_symbol"] == "001"


def test_vytvoreni_quote_pouzije_document_kind_vlastni_radu_a_not_payable_summary() -> None:
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "quote@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    invoice = _vytvor_fakturu({"customer_email": "quote-normal@example.com"})

    assert quote["document_kind"] == "quote"
    assert quote["invoice_number"] == "52099001"
    assert quote["variable_symbol"] == "52099001"
    assert quote["payment_status"] == "not_payable"
    assert quote["effective_status"] == "issued"
    assert quote["total_paid"] == 0.0
    assert quote["remaining_amount"] == quote["total"]

    assert invoice["document_kind"] == "invoice"
    assert invoice["invoice_number"] == "001"
    assert invoice["variable_symbol"] == "001"


def test_proforma_metadata_povoluje_platby_pdf_email_a_neimplementuje_navazne_workflow() -> None:
    proforma_metadata = get_document_kind_metadata("proforma")
    tax_document_metadata = get_document_kind_metadata("tax_document")
    final_invoice_metadata = get_document_kind_metadata("final_invoice")
    correction_metadata = get_document_kind_metadata("correction")
    quote_metadata = get_document_kind_metadata("quote")

    assert proforma_metadata.machine_value == "proforma"
    assert proforma_metadata.allows_payment_tracking is True
    assert proforma_metadata.allows_pdf_email is True
    assert proforma_metadata.participates_in_total_calculation is True
    assert proforma_metadata.allows_manual_create is True
    assert proforma_metadata.requires_source_relation is False
    assert proforma_metadata.supports_tax_document_generation is True
    assert proforma_metadata.supports_final_invoice_settlement is True

    assert tax_document_metadata.machine_value == "tax_document"
    assert tax_document_metadata.allows_payment_tracking is False
    assert tax_document_metadata.allows_pdf_email is True
    assert tax_document_metadata.participates_in_total_calculation is True
    assert tax_document_metadata.allows_manual_create is False
    assert tax_document_metadata.requires_source_relation is True
    assert tax_document_metadata.supports_tax_document_generation is False
    assert tax_document_metadata.supports_final_invoice_settlement is False

    assert final_invoice_metadata.machine_value == "final_invoice"
    assert final_invoice_metadata.allows_payment_tracking is False
    assert final_invoice_metadata.allows_pdf_email is True
    assert final_invoice_metadata.participates_in_total_calculation is True
    assert final_invoice_metadata.allows_manual_create is False
    assert final_invoice_metadata.requires_source_relation is True
    assert final_invoice_metadata.supports_tax_document_generation is False
    assert final_invoice_metadata.supports_final_invoice_settlement is False

    assert correction_metadata.machine_value == "correction"
    assert correction_metadata.allows_payment_tracking is False
    assert correction_metadata.allows_pdf_email is True
    assert correction_metadata.participates_in_total_calculation is True
    assert correction_metadata.allows_manual_create is False
    assert correction_metadata.requires_source_relation is True
    assert correction_metadata.supports_tax_document_generation is False
    assert correction_metadata.supports_final_invoice_settlement is False

    assert quote_metadata.machine_value == "quote"
    assert quote_metadata.allows_payment_tracking is False
    assert quote_metadata.allows_pdf_email is True
    assert quote_metadata.participates_in_total_calculation is True
    assert quote_metadata.allows_manual_create is True
    assert quote_metadata.requires_source_relation is False
    assert quote_metadata.supports_tax_document_generation is False
    assert quote_metadata.supports_final_invoice_settlement is False


def test_neplatny_document_kind_je_odmitnut() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices",
        json={
            "document_kind": "unsupported_kind",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
            "customer_name": "Jan Novák",
            "customer_email": "jan@example.com",
            "customer_address": "Praha 10",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [
                {"description": "Diagnostika", "quantity": 1, "unit_price": 1200},
            ],
        },
    )

    assert response.status_code == 422
    assert "Neplatný typ dokladu." in response.text


def test_vsechny_bezne_supported_document_kinds_krome_tax_document_final_invoice_a_correction_jdou_vytvorit_generic_create() -> None:
    supported_document_kinds = [
        "invoice",
        "proforma",
        "quote",
    ]

    for index, document_kind in enumerate(supported_document_kinds, start=1):
        invoice = _vytvor_fakturu(
            {
                "document_kind": document_kind,
                "customer_email": f"{document_kind}{index}@example.com",
                "issue_date": "2026-04-04" if document_kind != "invoice" else "2099-04-04",
                "due_date": "2026-04-18" if document_kind != "invoice" else "2099-04-18",
            }
        )
        assert invoice["document_kind"] == document_kind


def test_tax_document_generic_create_je_blokovan_s_jasnou_chybou() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices",
        json={
            "document_kind": "tax_document",
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
            "customer_name": "Jan Novák",
            "customer_email": "manual-tax-document@example.com",
            "customer_address": "Praha 10",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [
                {"description": "Ruční daňový doklad", "quantity": 1, "unit_price": 1200},
            ],
        },
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Daňový doklad nelze vytvořit ručně. Vytvořte jej z platby proformy."
    }


def test_final_invoice_generic_create_je_blokovan_s_jasnou_chybou() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices",
        json={
            "document_kind": "final_invoice",
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
            "customer_name": "Jan Novák",
            "customer_email": "manual-final-invoice@example.com",
            "customer_address": "Praha 10",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [
                {"description": "Ruční konečná faktura", "quantity": 1, "unit_price": 1200},
            ],
        },
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Konečnou fakturu nelze vytvořit ručně. Vytvořte ji ze zdrojových proforem."
    }


def test_correction_generic_create_je_blokovan_s_jasnou_chybou() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices",
        json={
            "document_kind": "correction",
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
            "customer_name": "Jan Novák",
            "customer_email": "manual-correction@example.com",
            "customer_address": "Praha 10",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [
                {"description": "Ruční opravný doklad", "quantity": 1, "unit_price": 1200},
            ],
        },
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Opravný doklad nelze vytvořit ručně. Vytvořte jej ze zdrojového dokladu."
    }


def test_document_kind_nelze_po_vytvoreni_menit() -> None:
    invoice = _vytvor_fakturu()
    _login_admin()

    response = client.put(
        f"/api/admin/invoices/{invoice['id']}",
        json={
            "document_kind": "quote",
            "invoice_number": invoice["invoice_number"],
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
            "customer_name": "Jan Novák",
            "customer_email": "jan@example.com",
            "customer_phone": "+420123456789",
            "customer_address": "Praha 10",
            "customer_ico": "12345678",
            "customer_dic": "CZ12345678",
            "note": "Ruční servisní faktura",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [
                {"description": "Diagnostika", "quantity": 1, "unit_price": 1200},
                {"description": "Oprava převodovky", "quantity": 2, "unit_price": 3500},
            ],
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Typ dokladu nelze po vytvoření měnit."}


def test_quote_muže_pouzit_subject_id_a_detail_list_zustavaji_kompatibilni() -> None:
    subject = _vytvor_subjekt(
        {
            "name": "Quote Subject",
            "email": "quote-subject@example.com",
            "phone": "+420333444555",
            "address": "Plzeň 4",
            "ico": "11113333",
            "dic": "CZ11113333",
        }
    )
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "subject_id": subject["id"],
            "customer_name": None,
            "customer_email": None,
            "customer_address": None,
            "customer_phone": None,
            "customer_ico": None,
            "customer_dic": None,
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    _login_admin()

    list_response = client.get("/api/admin/invoices")
    detail_response = client.get(f"/api/admin/invoices/{quote['id']}")

    assert list_response.status_code == 200
    assert detail_response.status_code == 200
    listed_quote = next(item for item in list_response.json() if item["id"] == quote["id"])
    detail = detail_response.json()
    assert listed_quote["document_kind"] == "quote"
    assert listed_quote["payment_status"] == "not_payable"
    assert listed_quote["subject_id"] == subject["id"]
    assert detail["customer_name"] == "Quote Subject"
    assert detail["customer_email"] == "quote-subject@example.com"
    assert detail["payment_status"] == "not_payable"
    assert detail["effective_status"] == "issued"


def test_quote_lze_upravit_pokud_nebyl_preveden() -> None:
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "quote-update@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    _login_admin()

    response = client.put(
        f"/api/admin/invoices/{quote['id']}",
        json={
            "invoice_number": quote["invoice_number"],
            "document_kind": "quote",
            "issue_date": "2099-04-05",
            "due_date": "2099-04-19",
            "customer_name": "Upravená nabídka",
            "customer_email": "quote-update@example.com",
            "customer_phone": "+420999888777",
            "customer_address": "Olomouc 9",
            "customer_ico": "12312312",
            "customer_dic": "CZ12312312",
            "note": "Upravená cenová nabídka",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [
                {"description": "Nabídková položka", "quantity": 1, "unit_price": 2000},
            ],
        },
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["document_kind"] == "quote"
    assert updated["customer_name"] == "Upravená nabídka"
    assert updated["total"] == 2420.0
    assert updated["payment_status"] == "not_payable"


def test_pridani_platby_ke_quote_je_odmitnuto_a_list_plateb_je_prazdny() -> None:
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "quote-payment@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    _login_admin()

    add_response = client.post(
        f"/api/admin/invoices/{quote['id']}/payments",
        json={
            "amount": 1000,
            "paid_at": "2099-04-10",
            "payment_method": "Převodem",
            "note": "Neplatná platba k nabídce",
        },
    )
    list_response = client.get(f"/api/admin/invoices/{quote['id']}/payments")
    detail_response = client.get(f"/api/admin/invoices/{quote['id']}")

    assert add_response.status_code == 400
    assert add_response.json() == {"detail": "Pro tento typ dokladu zatím nelze evidovat platby."}
    assert list_response.status_code == 200
    assert list_response.json() == []
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["payment_status"] == "not_payable"
    assert detail["effective_status"] == "issued"
    assert detail["total_paid"] == 0.0
    assert detail["remaining_amount"] == detail["total"]


def test_quote_po_splatnosti_nepada_do_overdue() -> None:
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "quote-not-overdue@example.com",
            "issue_date": "2020-01-01",
            "due_date": "2020-01-15",
        }
    )

    assert quote["payment_status"] == "not_payable"
    assert quote["effective_status"] == "issued"


def test_castecna_uhrada_proformy_funguje() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "proforma-partial@example.com",
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
        }
    )

    updated = _pridej_platbu(
        proforma["id"],
        {
            "amount": 2000,
            "paid_at": "2026-04-10",
            "payment_method": "Bankovní převod",
            "note": "Částečná úhrada proformy",
        },
    )

    assert updated["document_kind"] == "proforma"
    assert updated["payment_status"] == "partially_paid"
    assert updated["effective_status"] == "partially_paid"
    assert updated["total_paid"] == 2000.0
    assert updated["remaining_amount"] == 7922.0


def test_plna_uhrada_proformy_funguje() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "proforma-paid@example.com",
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
        }
    )

    updated = _pridej_platbu(
        proforma["id"],
        {
            "amount": 9922.0,
            "paid_at": "2026-04-11",
            "payment_method": "Bankovní převod",
            "note": "Plná úhrada proformy",
        },
    )

    assert updated["document_kind"] == "proforma"
    assert updated["payment_status"] == "paid"
    assert updated["effective_status"] == "paid"
    assert updated["total_paid"] == 9922.0
    assert updated["remaining_amount"] == 0.0


def test_preplatek_u_proformy_je_odmitnut() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "proforma-overpay@example.com",
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
        }
    )
    _login_admin()

    response = client.post(
        f"/api/admin/invoices/{proforma['id']}/payments",
        json={
            "amount": 10000,
            "paid_at": "2026-04-10",
            "payment_method": "Převodem",
            "note": "Přeplatek proformy",
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Součet plateb nesmí překročit celkovou částku faktury."}


def test_smazani_platby_proformy_prepocita_summary() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "proforma-delete@example.com",
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
        }
    )
    _pridej_platbu(proforma["id"], {"amount": 2000, "paid_at": "2026-04-10"})
    after_second = _pridej_platbu(proforma["id"], {"amount": 1500, "paid_at": "2026-04-11"})
    payment_id = after_second["payments"][0]["id"]

    _login_admin()
    response = client.delete(f"/api/admin/invoices/{proforma['id']}/payments/{payment_id}")

    assert response.status_code == 200
    updated = response.json()
    assert updated["document_kind"] == "proforma"
    assert len(updated["payments"]) == 1
    assert updated["payment_status"] == "partially_paid"
    assert updated["effective_status"] == "partially_paid"
    assert updated["total_paid"] == 1500.0
    assert updated["remaining_amount"] == 8422.0


def test_vytvoreni_danoveho_dokladu_z_platby_proformy_funguje_a_rady_zustanou_oddeleny() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "proforma-taxdoc@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    paid_proforma = _pridej_platbu(
        proforma["id"],
        {
            "amount": 2000,
            "paid_at": "2099-04-10",
            "payment_method": "Bankovní převod",
            "note": "Přijatá záloha pro daňový doklad",
        },
    )
    payment_id = paid_proforma["payments"][0]["id"]

    tax_document = _vytvor_danovy_doklad_z_platby(proforma["id"], payment_id)
    next_proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "proforma-taxdoc-2@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    invoice = _vytvor_fakturu({"customer_email": "after-tax-document@example.com"})

    assert proforma["document_kind"] == "proforma"
    assert proforma["invoice_number"] == "12099001"
    assert tax_document["document_kind"] == "tax_document"
    assert tax_document["invoice_number"] == "22099001"
    assert tax_document["variable_symbol"] == "22099001"
    assert tax_document["issue_date"] == "2099-04-10"
    assert tax_document["due_date"] == "2099-04-10"
    assert tax_document["customer_name"] == proforma["customer_name"]
    assert tax_document["customer_email"] == proforma["customer_email"]
    assert tax_document["issuer_name"] == proforma["issuer_name"]
    assert tax_document["issuer_ico"] == proforma["issuer_ico"]
    assert tax_document["currency"] == proforma["currency"]
    assert tax_document["payment_method"] == proforma["payment_method"]
    assert tax_document["bank_account_number"] == proforma["bank_account_number"]
    assert tax_document["status"] == "issued"
    assert tax_document["effective_status"] == "issued"
    assert tax_document["payment_status"] == "unpaid"
    assert tax_document["total_paid"] == 0.0
    assert tax_document["remaining_amount"] == 2000.0
    assert tax_document["subtotal"] == 1652.89
    assert tax_document["vat_amount"] == 347.11
    assert tax_document["total"] == 2000.0
    assert len(tax_document["items"]) == 1
    assert tax_document["items"][0]["description"] == f"Přijatá platba k proformě {proforma['invoice_number']}"
    assert tax_document["items"][0]["quantity"] == 1.0
    assert tax_document["items"][0]["unit_price"] == 1652.89
    assert tax_document["items"][0]["line_total"] == 1652.89
    assert next_proforma["invoice_number"] == "12099002"
    assert invoice["invoice_number"] == "001"

    with SessionLocal() as db:
        relation = (
            db.query(InvoiceDocumentRelation)
            .filter(InvoiceDocumentRelation.source_payment_id == payment_id)
            .first()
        )
        assert relation is not None
        assert relation.source_invoice_id == proforma["id"]
        assert relation.target_invoice_id == tax_document["id"]
        assert relation.source_payment_id == payment_id
        assert relation.relation_type == RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT


def test_z_bezne_faktury_nejde_vytvorit_danovy_doklad_z_platby() -> None:
    invoice = _vytvor_fakturu({"customer_email": "invoice-taxdoc@example.com"})
    paid_invoice = _pridej_platbu(invoice["id"], {"amount": 2000, "paid_at": "2099-04-10"})
    payment_id = paid_invoice["payments"][0]["id"]
    _login_admin()

    response = client.post(f"/api/admin/invoices/{invoice['id']}/payments/{payment_id}/tax-document")

    assert response.status_code == 400
    assert response.json() == {"detail": "Daňový doklad lze vytvořit pouze z platby proformy."}


def test_danovy_doklad_nejde_vytvorit_pro_platbu_jine_proformy() -> None:
    first_proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "first-proforma@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    second_proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "second-proforma@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    paid_first = _pridej_platbu(first_proforma["id"], {"amount": 2000, "paid_at": "2099-04-10"})
    payment_id = paid_first["payments"][0]["id"]
    _login_admin()

    response = client.post(f"/api/admin/invoices/{second_proforma['id']}/payments/{payment_id}/tax-document")

    assert response.status_code == 400
    assert response.json() == {"detail": "Platba nepatří k zadané proformě."}


def test_danovy_doklad_nejde_vytvorit_dvakrat_pro_stejnou_platbu() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "duplicate-taxdoc@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    paid_proforma = _pridej_platbu(proforma["id"], {"amount": 2000, "paid_at": "2099-04-10"})
    payment_id = paid_proforma["payments"][0]["id"]

    first_tax_document = _vytvor_danovy_doklad_z_platby(proforma["id"], payment_id)
    _login_admin()
    response = client.post(f"/api/admin/invoices/{proforma['id']}/payments/{payment_id}/tax-document")

    assert first_tax_document["document_kind"] == "tax_document"
    assert response.status_code == 400
    assert response.json() == {"detail": "Daňový doklad pro tuto platbu už existuje."}


def test_danovy_doklad_endpoint_vrati_404_pro_neexistujici_proformu() -> None:
    _login_admin()

    response = client.post("/api/admin/invoices/999999/payments/1/tax-document")

    assert response.status_code == 404
    assert response.json() == {"detail": "Faktura nebyla nalezena."}


def test_danovy_doklad_endpoint_vrati_404_pro_neexistujici_platbu() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "missing-payment@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    _login_admin()

    response = client.post(f"/api/admin/invoices/{proforma['id']}/payments/999999/tax-document")

    assert response.status_code == 404
    assert response.json() == {"detail": "Platba faktury nebyla nalezena."}


def test_vytvoreni_konecne_faktury_z_jedne_proformy_funguje() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "final-single@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    _pridej_platbu(
        proforma["id"],
        {
            "amount": 2000,
            "paid_at": "2099-04-10",
            "payment_method": "Bankovní převod",
        },
    )

    final_invoice = _vytvor_konecnou_fakturu(
        [proforma["id"]],
        {"issue_date": "2099-05-01", "due_date": "2099-05-15", "note": "Konečné vyúčtování zakázky"},
    )
    next_proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "final-single-2@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    invoice = _vytvor_fakturu({"customer_email": "final-single-invoice@example.com"})

    assert final_invoice["document_kind"] == "final_invoice"
    assert final_invoice["invoice_number"] == "42099001"
    assert final_invoice["variable_symbol"] == "42099001"
    assert final_invoice["issue_date"] == "2099-05-01"
    assert final_invoice["due_date"] == "2099-05-15"
    assert final_invoice["customer_name"] == proforma["customer_name"]
    assert final_invoice["customer_email"] == proforma["customer_email"]
    assert final_invoice["issuer_name"] == proforma["issuer_name"]
    assert final_invoice["issuer_ico"] == proforma["issuer_ico"]
    assert final_invoice["currency"] == proforma["currency"]
    assert final_invoice["payment_method"] == proforma["payment_method"]
    assert final_invoice["bank_account_number"] == proforma["bank_account_number"]
    assert final_invoice["status"] == "issued"
    assert final_invoice["effective_status"] == "issued"
    assert final_invoice["payment_status"] == "unpaid"
    assert final_invoice["total_paid"] == 0.0
    assert final_invoice["remaining_amount"] == 7922.0
    assert final_invoice["subtotal"] == 6547.11
    assert final_invoice["vat_amount"] == 1374.89
    assert final_invoice["total"] == 7922.0
    assert final_invoice["note"] == "Konečné vyúčtování zakázky"
    assert len(final_invoice["items"]) == 3
    assert final_invoice["items"][0]["description"] == "Diagnostika"
    assert final_invoice["items"][1]["description"] == "Oprava převodovky"
    assert final_invoice["items"][2]["description"] == f"Odečtené uhrazené zálohy k proformám {proforma['invoice_number']}"
    assert final_invoice["items"][2]["unit_price"] == -1652.89
    assert next_proforma["invoice_number"] == "12099002"
    assert invoice["invoice_number"] == "001"

    with SessionLocal() as db:
        relation = (
            db.query(InvoiceDocumentRelation)
            .filter(
                InvoiceDocumentRelation.source_invoice_id == proforma["id"],
                InvoiceDocumentRelation.target_invoice_id == final_invoice["id"],
                InvoiceDocumentRelation.relation_type == RELATION_TYPE_FINAL_INVOICE_FOR_PROFORMA,
            )
            .first()
        )
        assert relation is not None
        assert relation.source_payment_id is None


def test_vytvoreni_konecne_faktury_z_vice_kompatibilnich_proforem_funguje() -> None:
    first = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "multi-final@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    second = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "multi-final@example.com",
            "issue_date": "2099-04-05",
            "due_date": "2099-04-19",
            "note": "Druhá část zakázky",
            "items": [
                {"description": "Lakování", "quantity": 1, "unit_price": 1000},
                {"description": "Montáž", "quantity": 2, "unit_price": 500},
            ],
        }
    )
    _pridej_platbu(first["id"], {"amount": 1000, "paid_at": "2099-04-10"})
    _pridej_platbu(second["id"], {"amount": 500, "paid_at": "2099-04-11"})

    final_invoice = _vytvor_konecnou_fakturu(
        [first["id"], second["id"]],
        {"issue_date": "2099-05-02", "due_date": "2099-05-16"},
    )

    assert final_invoice["document_kind"] == "final_invoice"
    assert final_invoice["invoice_number"] == "42099001"
    assert final_invoice["total"] == 10842.0
    assert final_invoice["remaining_amount"] == 10842.0
    assert len(final_invoice["items"]) == 5
    assert final_invoice["items"][0]["description"] == "Diagnostika"
    assert final_invoice["items"][1]["description"] == "Oprava převodovky"
    assert final_invoice["items"][2]["description"] == "Lakování"
    assert final_invoice["items"][3]["description"] == "Montáž"
    assert final_invoice["items"][4]["description"] == f"Odečtené uhrazené zálohy k proformám {first['invoice_number']}, {second['invoice_number']}"

    with SessionLocal() as db:
        relations = (
            db.query(InvoiceDocumentRelation)
            .filter(InvoiceDocumentRelation.target_invoice_id == final_invoice["id"])
            .order_by(InvoiceDocumentRelation.source_invoice_id)
            .all()
        )
        assert len(relations) == 2
        assert relations[0].source_invoice_id == first["id"]
        assert relations[1].source_invoice_id == second["id"]
        assert all(relation.relation_type == RELATION_TYPE_FINAL_INVOICE_FOR_PROFORMA for relation in relations)
        assert all(relation.source_payment_id is None for relation in relations)


def test_konecna_faktura_z_plne_uhrazene_proformy_ma_nulovy_zustatek() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "final-paid@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    _pridej_platbu(proforma["id"], {"amount": 9922.0, "paid_at": "2099-04-10"})

    final_invoice = _vytvor_konecnou_fakturu([proforma["id"]], {"issue_date": "2099-05-01", "due_date": "2099-05-15"})

    assert final_invoice["document_kind"] == "final_invoice"
    assert final_invoice["total"] == 0.0
    assert final_invoice["remaining_amount"] == 0.0
    assert final_invoice["subtotal"] == 0.0
    assert final_invoice["vat_amount"] == 0.0


def test_konecnou_fakturu_nejde_vytvorit_z_bezne_faktury() -> None:
    invoice = _vytvor_fakturu({"customer_email": "not-proforma-final@example.com"})
    _login_admin()

    response = client.post(
        "/api/admin/invoices/final-invoice",
        json={"source_proforma_ids": [invoice["id"]], "issue_date": "2099-05-01", "due_date": "2099-05-15"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Konečnou fakturu lze vytvořit pouze z proformy."}


def test_konecnou_fakturu_nejde_vytvorit_z_danoveho_dokladu() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "taxdoc-source-final@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    paid_proforma = _pridej_platbu(proforma["id"], {"amount": 2000, "paid_at": "2099-04-10"})
    payment_id = paid_proforma["payments"][0]["id"]
    tax_document = _vytvor_danovy_doklad_z_platby(proforma["id"], payment_id)
    _login_admin()

    response = client.post(
        "/api/admin/invoices/final-invoice",
        json={"source_proforma_ids": [tax_document["id"]], "issue_date": "2099-05-01", "due_date": "2099-05-15"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Konečnou fakturu lze vytvořit pouze z proformy."}


def test_konecna_faktura_endpoint_vrati_404_pro_neexistujici_proformu() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices/final-invoice",
        json={"source_proforma_ids": [999999], "issue_date": "2099-05-01", "due_date": "2099-05-15"},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Faktura nebyla nalezena."}


def test_konecnou_fakturu_nejde_vytvorit_z_nekompatibilnich_zakazniku() -> None:
    first = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "customer-a@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    second = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_name": "Petr Svoboda",
            "customer_email": "customer-b@example.com",
            "issue_date": "2099-04-05",
            "due_date": "2099-04-19",
        }
    )
    _login_admin()

    response = client.post(
        "/api/admin/invoices/final-invoice",
        json={"source_proforma_ids": [first["id"], second["id"]], "issue_date": "2099-05-01", "due_date": "2099-05-15"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Zdrojové proformy musí mít shodného odběratele."}


def test_konecnou_fakturu_nejde_vytvorit_z_nekompatibilnich_men() -> None:
    first = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "currency-final@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    second = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "currency-final@example.com",
            "currency": "EUR",
            "issue_date": "2099-04-05",
            "due_date": "2099-04-19",
        }
    )
    _login_admin()

    response = client.post(
        "/api/admin/invoices/final-invoice",
        json={"source_proforma_ids": [first["id"], second["id"]], "issue_date": "2099-05-01", "due_date": "2099-05-15"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Zdrojové proformy musí mít shodnou měnu."}


def test_duplicitni_konecna_faktura_pro_stejnou_proformu_je_blokovana() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "duplicate-final@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )

    first_final_invoice = _vytvor_konecnou_fakturu([proforma["id"]], {"issue_date": "2099-05-01", "due_date": "2099-05-15"})
    _login_admin()
    response = client.post(
        "/api/admin/invoices/final-invoice",
        json={"source_proforma_ids": [proforma["id"]], "issue_date": "2099-05-02", "due_date": "2099-05-16"},
    )

    assert first_final_invoice["document_kind"] == "final_invoice"
    assert response.status_code == 400
    assert response.json() == {"detail": "K některé z vybraných proforem už byla vytvořena konečná faktura."}


def test_quote_lze_prevest_na_invoice_a_vznikne_relation() -> None:
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "quote-convert-invoice@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )

    converted = _preved_quote(
        quote["id"],
        {
            "target_document_kind": "invoice",
            "issue_date": "2099-05-01",
            "due_date": "2099-05-15",
            "note": "Převedeno z nabídky",
        },
    )

    assert converted["document_kind"] == "invoice"
    assert converted["invoice_number"] == "001"
    assert converted["customer_email"] == "quote-convert-invoice@example.com"
    assert converted["items"][0]["description"] == "Diagnostika"
    assert converted["payment_status"] == "unpaid"

    with SessionLocal() as db:
        relation = (
            db.query(InvoiceDocumentRelation)
            .filter(
                InvoiceDocumentRelation.source_invoice_id == quote["id"],
                InvoiceDocumentRelation.target_invoice_id == converted["id"],
                InvoiceDocumentRelation.relation_type == RELATION_TYPE_INVOICE_FROM_QUOTE,
            )
            .first()
        )
        assert relation is not None


def test_quote_lze_prevest_na_proformu_a_vznikne_relation() -> None:
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "quote-convert-proforma@example.com",
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
        }
    )

    converted = _preved_quote(
        quote["id"],
        {
            "target_document_kind": "proforma",
            "issue_date": "2026-05-01",
            "due_date": "2026-05-15",
        },
    )

    assert converted["document_kind"] == "proforma"
    assert converted["invoice_number"] == "12026001"
    assert converted["customer_email"] == "quote-convert-proforma@example.com"
    assert converted["payment_status"] == "unpaid"

    with SessionLocal() as db:
        relation = (
            db.query(InvoiceDocumentRelation)
            .filter(
                InvoiceDocumentRelation.source_invoice_id == quote["id"],
                InvoiceDocumentRelation.target_invoice_id == converted["id"],
                InvoiceDocumentRelation.relation_type == RELATION_TYPE_PROFORMA_FROM_QUOTE,
            )
            .first()
        )
        assert relation is not None


def test_duplicitni_prevod_quote_na_stejny_target_kind_je_blokovan() -> None:
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "quote-duplicate-conversion@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    first_invoice = _preved_quote(quote["id"], {"target_document_kind": "invoice", "issue_date": "2099-05-01"})
    _login_admin()

    response = client.post(
        f"/api/admin/invoices/{quote['id']}/convert",
        json={"target_document_kind": "invoice", "issue_date": "2099-05-02"},
    )

    assert first_invoice["document_kind"] == "invoice"
    assert response.status_code == 400
    assert response.json() == {"detail": "Z této cenové nabídky už byla vytvořena faktura."}


def test_prevod_nequote_dokladu_je_odmitnut() -> None:
    invoice = _vytvor_fakturu({"customer_email": "convert-non-quote@example.com"})
    _login_admin()

    response = client.post(
        f"/api/admin/invoices/{invoice['id']}/convert",
        json={"target_document_kind": "invoice", "issue_date": "2099-05-01"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Převádět lze pouze cenovou nabídku."}


def test_nepodporovany_target_kind_prevodu_quote_je_odmitnut() -> None:
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "quote-unsupported-conversion@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    _login_admin()

    response = client.post(
        f"/api/admin/invoices/{quote['id']}/convert",
        json={"target_document_kind": "correction", "issue_date": "2099-05-01"},
    )

    assert response.status_code == 422


def test_prevedenou_quote_uz_nelze_upravit() -> None:
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "quote-locked-after-conversion@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    _preved_quote(quote["id"], {"target_document_kind": "invoice", "issue_date": "2099-05-01"})
    _login_admin()

    response = client.put(
        f"/api/admin/invoices/{quote['id']}",
        json={
            "invoice_number": quote["invoice_number"],
            "document_kind": "quote",
            "issue_date": "2099-04-05",
            "due_date": "2099-04-19",
            "customer_name": "Locked Quote",
            "customer_email": "quote-locked-after-conversion@example.com",
            "customer_phone": "+420123456789",
            "customer_address": "Praha 10",
            "customer_ico": "12345678",
            "customer_dic": "CZ12345678",
            "note": "Locked quote",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [
                {"description": "Diagnostika", "quantity": 1, "unit_price": 1200},
                {"description": "Oprava převodovky", "quantity": 2, "unit_price": 3500},
            ],
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Převedenou cenovou nabídku už nelze upravovat."}


def test_prevod_quote_nekonsumuji_quote_radu() -> None:
    first_quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "quote-sequence-1@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    converted = _preved_quote(first_quote["id"], {"target_document_kind": "invoice", "issue_date": "2099-05-01"})
    second_quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "quote-sequence-2@example.com",
            "issue_date": "2099-04-05",
            "due_date": "2099-04-19",
        }
    )

    assert converted["document_kind"] == "invoice"
    assert first_quote["invoice_number"] == "52099001"
    assert second_quote["invoice_number"] == "52099002"


def test_vytvoreni_opravneho_dokladu_z_faktury_funguje() -> None:
    invoice = _vytvor_fakturu({"customer_email": "correction-invoice@example.com"})

    correction = _vytvor_opravny_doklad(
        invoice["id"],
        {"issue_date": "2099-05-05", "reason": "Storno celé faktury", "note": "Vystaven opravný doklad"},
    )

    assert correction["document_kind"] == "correction"
    assert correction["invoice_number"] == "32099001"
    assert correction["variable_symbol"] == "32099001"
    assert correction["issue_date"] == "2099-05-05"
    assert correction["due_date"] == "2099-05-05"
    assert correction["customer_name"] == invoice["customer_name"]
    assert correction["customer_email"] == invoice["customer_email"]
    assert correction["issuer_name"] == invoice["issuer_name"]
    assert correction["issuer_ico"] == invoice["issuer_ico"]
    assert correction["currency"] == invoice["currency"]
    assert correction["payment_method"] == invoice["payment_method"]
    assert correction["bank_account_number"] == invoice["bank_account_number"]
    assert correction["status"] == "issued"
    assert correction["effective_status"] == "issued"
    assert correction["payment_status"] == "unpaid"
    assert correction["total_paid"] == 0.0
    assert correction["remaining_amount"] == 0.0
    assert correction["subtotal"] == -8200.0
    assert correction["vat_amount"] == -1722.0
    assert correction["total"] == -9922.0
    assert "Storno celé faktury" in correction["note"]
    assert "Vystaven opravný doklad" in correction["note"]
    assert len(correction["items"]) == 2
    assert correction["items"][0]["description"] == "Diagnostika"
    assert correction["items"][0]["quantity"] == 1.0
    assert correction["items"][0]["unit_price"] == -1200.0
    assert correction["items"][0]["line_total"] == -1200.0
    assert correction["items"][1]["unit_price"] == -3500.0
    assert correction["items"][1]["line_total"] == -7000.0

    detail_response = client.get(f"/api/admin/invoices/{invoice['id']}")
    assert detail_response.status_code == 200
    source_detail = detail_response.json()
    assert source_detail["total"] == 9922.0
    assert source_detail["subtotal"] == 8200.0
    assert source_detail["document_kind"] == "invoice"

    with SessionLocal() as db:
        relation = (
            db.query(InvoiceDocumentRelation)
            .filter(
                InvoiceDocumentRelation.source_invoice_id == invoice["id"],
                InvoiceDocumentRelation.target_invoice_id == correction["id"],
                InvoiceDocumentRelation.relation_type == RELATION_TYPE_CORRECTION_FOR_INVOICE,
            )
            .first()
        )
        assert relation is not None
        assert relation.source_payment_id is None


def test_vytvoreni_opravneho_dokladu_z_konecne_faktury_funguje() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "correction-final-proforma@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    _pridej_platbu(proforma["id"], {"amount": 2000, "paid_at": "2099-04-10"})
    final_invoice = _vytvor_konecnou_fakturu([proforma["id"]], {"issue_date": "2099-05-01", "due_date": "2099-05-15"})

    correction = _vytvor_opravny_doklad(final_invoice["id"], {"issue_date": "2099-05-20", "reason": "Storno vyúčtování"})

    assert correction["document_kind"] == "correction"
    assert correction["invoice_number"] == "32099001"
    assert correction["total"] == -7922.0
    assert correction["subtotal"] == -6547.11
    assert correction["vat_amount"] == -1374.89
    assert len(correction["items"]) == 3
    assert correction["items"][0]["line_total"] == -1200.0
    assert correction["items"][1]["line_total"] == -7000.0
    assert correction["items"][2]["line_total"] == 1652.89
    assert "Storno vyúčtování" in correction["note"]


def test_vytvoreni_opravneho_dokladu_z_danoveho_dokladu_funguje() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "correction-taxdoc-proforma@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    paid_proforma = _pridej_platbu(proforma["id"], {"amount": 2000, "paid_at": "2099-04-10"})
    payment_id = paid_proforma["payments"][0]["id"]
    tax_document = _vytvor_danovy_doklad_z_platby(proforma["id"], payment_id)

    correction = _vytvor_opravny_doklad(tax_document["id"], {"issue_date": "2099-05-20"})

    assert correction["document_kind"] == "correction"
    assert correction["invoice_number"] == "32099001"
    assert correction["subtotal"] == -1652.89
    assert correction["vat_amount"] == -347.11
    assert correction["total"] == -2000.0
    assert len(correction["items"]) == 1
    assert correction["items"][0]["description"] == f"Přijatá platba k proformě {proforma['invoice_number']}"
    assert correction["items"][0]["unit_price"] == -1652.89


def test_opravny_doklad_nejde_vytvorit_z_proformy() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "correction-proforma@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    _login_admin()

    response = client.post(f"/api/admin/invoices/{proforma['id']}/correction", json={"issue_date": "2099-05-05"})

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Opravný doklad lze vytvořit pouze z faktury, konečné faktury nebo daňového dokladu."
    }


def test_opravny_doklad_nejde_vytvorit_z_quote() -> None:
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "correction-quote@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    _login_admin()

    response = client.post(f"/api/admin/invoices/{quote['id']}/correction", json={"issue_date": "2099-05-05"})

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Opravný doklad lze vytvořit pouze z faktury, konečné faktury nebo daňového dokladu."
    }


def test_opravny_doklad_nejde_vytvorit_z_opravneho_dokladu() -> None:
    invoice = _vytvor_fakturu({"customer_email": "correction-source-invoice@example.com"})
    correction = _vytvor_opravny_doklad(invoice["id"], {"issue_date": "2099-05-05"})
    _login_admin()

    response = client.post(f"/api/admin/invoices/{correction['id']}/correction", json={"issue_date": "2099-05-06"})

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Opravný doklad lze vytvořit pouze z faktury, konečné faktury nebo daňového dokladu."
    }


def test_opravny_doklad_endpoint_vrati_404_pro_neexistujici_zdroj() -> None:
    _login_admin()

    response = client.post("/api/admin/invoices/999999/correction", json={"issue_date": "2099-05-05"})

    assert response.status_code == 404
    assert response.json() == {"detail": "Faktura nebyla nalezena."}


def test_duplicitni_opravny_doklad_pro_stejny_zdroj_je_blokovan() -> None:
    invoice = _vytvor_fakturu({"customer_email": "duplicate-correction@example.com"})
    first_correction = _vytvor_opravny_doklad(invoice["id"], {"issue_date": "2099-05-05"})
    _login_admin()

    response = client.post(f"/api/admin/invoices/{invoice['id']}/correction", json={"issue_date": "2099-05-06"})

    assert first_correction["document_kind"] == "correction"
    assert response.status_code == 400
    assert response.json() == {"detail": "Pro tento doklad už byl vytvořen opravný doklad."}


def test_invoice_sequence_state_zustava_zpetne_kompatibilni_s_default_klicem() -> None:
    created = _vytvor_fakturu()
    assert created["invoice_number"] == "001"

    with SessionLocal() as db:
        state = (
            db.query(InvoiceSequenceState)
            .filter(InvoiceSequenceState.sequence_key == "default")
            .first()
        )
        assert state is not None
        assert state.document_kind == "invoice"
        assert state.sequence_year is None
        assert state.last_number == 1
        assert state.padding == 3


def test_standardni_faktura_bez_sazby_dph_je_odmitnuta() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices",
        json={
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
            "customer_name": "Jan Novák",
            "customer_email": "jan@example.com",
            "customer_address": "Praha 10",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "items": [
                {"description": "Diagnostika", "quantity": 1, "unit_price": 1200},
            ],
        },
    )

    assert response.status_code == 422
    assert "Pro běžný režim DPH musíte vyplnit sazbu DPH." in response.text


def test_prenesena_danova_povinnost_je_povolena_i_pro_autoservis() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices",
        json={
            "issue_date": "2026-04-04",
            "due_date": "2026-04-20",
            "customer_name": "Klient",
            "customer_email": "klient@example.com",
            "customer_address": "Servisní 5, 100 00 Praha",
            "business_mode": "autoservice",
            "tax_mode": "reverse_charge",
            "currency": "CZK",
            "items": [
                {"description": "Servis", "quantity": 1, "unit_price": 5000},
            ],
        },
    )

    assert response.status_code == 200
    invoice = response.json()
    assert invoice["business_mode"] == "autoservice"
    assert invoice["tax_mode"] == "reverse_charge"
    assert invoice["vat_amount"] == 0.0
    assert invoice["total"] == 5000.0
    assert invoice["reverse_charge_reason"] == "reverse_charge"


def test_vytvoreni_faktury_bez_adresy_odberatele_je_odmitnuto() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices",
        json={
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
            "customer_name": "Jan Novák",
            "customer_email": "jan@example.com",
            "customer_address": "",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [
                {"description": "Diagnostika", "quantity": 1, "unit_price": 1200},
            ],
        },
    )

    assert response.status_code == 422
    assert "Toto pole je povinné." in response.text


def test_faktura_bez_polozek_je_odmitnuta() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices",
        json={
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
            "customer_name": "Jan Novák",
            "customer_email": "jan@example.com",
            "customer_address": "Praha 10",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [],
        },
    )

    assert response.status_code == 422
    assert "Faktura musí obsahovat alespoň jednu položku." in response.text


def test_faktura_s_nekladnym_mnozstvim_je_odmitnuta() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices",
        json={
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
            "customer_name": "Jan Novák",
            "customer_email": "jan@example.com",
            "customer_address": "Praha 10",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [
                {"description": "Diagnostika", "quantity": 0, "unit_price": 1200},
            ],
        },
    )

    assert response.status_code == 422
    assert "Množství položky musí být větší než nula." in response.text


def test_faktura_se_zapornou_cenou_je_odmitnuta() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices",
        json={
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
            "customer_name": "Jan Novák",
            "customer_email": "jan@example.com",
            "customer_address": "Praha 10",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [
                {"description": "Diagnostika", "quantity": 1, "unit_price": -1},
            ],
        },
    )

    assert response.status_code == 422
    assert "Jednotková cena nemůže být záporná." in response.text


def test_uprava_existujici_faktury_je_povolena_a_prepocita_hodnoty() -> None:
    invoice = _vytvor_fakturu({"invoice_number": "024"})
    _login_admin()

    response = client.put(
        f"/api/admin/invoices/{invoice['id']}",
        json={
            "invoice_number": "010",
            "issue_date": "2026-04-06",
            "due_date": "2026-04-21",
            "customer_name": "Upravený klient",
            "customer_email": "upraveny@example.com",
            "customer_phone": "+420777888999",
            "customer_address": "Dlouhá 15, 110 00 Praha, Česká republika",
            "customer_ico": "87654321",
            "customer_dic": "CZ87654321",
            "note": "Upravená faktura",
            "business_mode": "construction",
            "tax_mode": "reverse_charge",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [
                {"description": "Bourací práce", "quantity": 2, "unit_price": 4500},
            ],
        },
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["id"] == invoice["id"]
    assert updated["invoice_number"] == "010"
    assert updated["variable_symbol"] == "010"
    assert updated["customer_name"] == "Upravený klient"
    assert updated["customer_address"] == "Dlouhá 15, 110 00 Praha, Česká republika"
    assert updated["tax_mode"] == "reverse_charge"
    assert updated["vat_amount"] == 0.0
    assert updated["total"] == 9000.0
    assert updated["items"][0]["description"] == "Bourací práce"
    assert updated["reverse_charge_reason"] == "reverse_charge"

    defaults_response = client.get("/api/admin/invoices/defaults")
    assert defaults_response.status_code == 200
    assert defaults_response.json() == {
        "document_kind": "invoice",
        "suggested_invoice_number": "025",
        "suggested_variable_symbol": "025",
    }


def test_detail_neexistujici_faktury_vrati_404() -> None:
    _login_admin()

    response = client.get("/api/admin/invoices/999999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Faktura nebyla nalezena."}


def test_koncept_faktury_zustane_konceptem_bez_plateb() -> None:
    invoice = _vytvor_fakturu({"status": "draft"})

    assert invoice["status"] == "draft"
    assert invoice["effective_status"] == "draft"
    assert invoice["payment_status"] == "unpaid"
    assert invoice["total_paid"] == 0.0
    assert invoice["remaining_amount"] == invoice["total"]


def test_faktura_po_splatnosti_ma_computed_overdue_status() -> None:
    invoice = _vytvor_fakturu(
        {
            "issue_date": "2020-01-01",
            "due_date": "2020-01-15",
            "customer_email": "overdue@example.com",
        }
    )

    assert invoice["status"] == "issued"
    assert invoice["effective_status"] == "overdue"
    assert invoice["payment_status"] == "unpaid"


def test_plna_uhrada_oznaci_fakturu_jako_paid_a_zobrazi_platby() -> None:
    invoice = _vytvor_fakturu()

    updated = _pridej_platbu(
        invoice["id"],
        {
            "amount": 9922.0,
            "paid_at": "2026-04-11",
            "payment_method": "Bankovní převod",
            "note": "Plná úhrada",
        },
    )

    assert updated["payment_status"] == "paid"
    assert updated["effective_status"] == "paid"
    assert updated["total_paid"] == 9922.0
    assert updated["remaining_amount"] == 0.0
    assert len(updated["payments"]) == 1
    assert updated["payments"][0]["amount"] == 9922.0
    assert updated["payments"][0]["payment_method"] == "Bankovní převod"

    _login_admin()
    payments_response = client.get(f"/api/admin/invoices/{invoice['id']}/payments")
    assert payments_response.status_code == 200
    assert payments_response.json() == updated["payments"]


def test_castecna_uhrada_a_vice_plateb_se_scita_spravne() -> None:
    invoice = _vytvor_fakturu()

    after_first = _pridej_platbu(
        invoice["id"],
        {
            "amount": 2000,
            "paid_at": "2026-04-10",
            "payment_method": "Hotově",
            "note": "Záloha",
        },
    )
    assert after_first["payment_status"] == "partially_paid"
    assert after_first["effective_status"] == "partially_paid"
    assert after_first["total_paid"] == 2000.0
    assert after_first["remaining_amount"] == 7922.0

    after_second = _pridej_platbu(
        invoice["id"],
        {
            "amount": 3000,
            "paid_at": "2026-04-12",
            "payment_method": "Kartou",
            "note": "Druhá platba",
        },
    )
    assert after_second["payment_status"] == "partially_paid"
    assert after_second["effective_status"] == "partially_paid"
    assert after_second["total_paid"] == 5000.0
    assert after_second["remaining_amount"] == 4922.0
    assert len(after_second["payments"]) == 2


def test_platba_nesmi_prekrocit_celkovou_castku_faktury() -> None:
    invoice = _vytvor_fakturu()
    _login_admin()

    response = client.post(
        f"/api/admin/invoices/{invoice['id']}/payments",
        json={
            "amount": 10000,
            "paid_at": "2026-04-10",
            "payment_method": "Převodem",
            "note": "Přeplatek",
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Součet plateb nesmí překročit celkovou částku faktury."}


def test_smazani_platby_prepocita_payment_summary() -> None:
    invoice = _vytvor_fakturu()
    _pridej_platbu(invoice["id"], {"amount": 2000, "paid_at": "2026-04-10"})
    after_second = _pridej_platbu(invoice["id"], {"amount": 1500, "paid_at": "2026-04-11"})
    payment_id = after_second["payments"][0]["id"]

    _login_admin()
    response = client.delete(f"/api/admin/invoices/{invoice['id']}/payments/{payment_id}")

    assert response.status_code == 200
    updated = response.json()
    assert len(updated["payments"]) == 1
    assert updated["payments"][0]["id"] == after_second["payments"][1]["id"]
    assert updated["payment_status"] == "partially_paid"
    assert updated["effective_status"] == "partially_paid"
    assert updated["total_paid"] == 1500.0
    assert updated["remaining_amount"] == 8422.0


def test_vytvoreni_prijateho_dokladu_spocita_soucet_a_dph() -> None:
    expense = _vytvor_vydaj()

    assert expense["expense_number"] == "001"
    assert expense["variable_symbol"] == "001"
    assert expense["subtotal"] == 3500.0
    assert expense["vat_amount"] == 735.0
    assert expense["total"] == 4235.0
    assert expense["status"] == "open"
    assert expense["payment_status"] == "unpaid"
    assert expense["total_paid"] == 0.0
    assert expense["remaining_amount"] == 4235.0
    assert len(expense["items"]) == 2
    assert expense["payments"] == []


def test_seznam_a_detail_prijatych_dokladu_funguji() -> None:
    expense = _vytvor_vydaj({"supplier_email": "seznam-expense@example.com"})
    _login_admin()

    list_response = client.get("/api/admin/invoices/expenses")
    detail_response = client.get(f"/api/admin/invoices/expenses/{expense['id']}")

    assert list_response.status_code == 200
    assert detail_response.status_code == 200
    listed = list_response.json()
    detail = detail_response.json()
    assert listed[0]["id"] == expense["id"]
    assert listed[0]["status"] == "open"
    assert detail["id"] == expense["id"]
    assert detail["supplier_name"] == "Dodavatel s.r.o."
    assert detail["payments"] == []


def test_vytvoreni_prijateho_dokladu_se_supplier_id_zkopiruje_snapshot() -> None:
    supplier = _vytvor_dodavatele(
        {
            "name": "Registry Supplier",
            "email": "registry-supplier@example.com",
            "phone": "+420111222333",
            "address": "Plzeň 6",
            "ico": "45454545",
            "dic": "CZ45454545",
            "data_box": "registry12",
            "country": "Slovensko",
        }
    )

    expense = _vytvor_vydaj(
        {
            "supplier_id": supplier["id"],
            "supplier_name": "Ignored Supplier Name",
            "supplier_email": "ignored@example.com",
            "supplier_phone": None,
            "supplier_address": "Ignored address",
            "supplier_ico": None,
            "supplier_dic": None,
            "supplier_data_box": None,
            "supplier_country": None,
        }
    )

    assert expense["supplier_id"] == supplier["id"]
    assert expense["supplier_name"] == "Registry Supplier"
    assert expense["supplier_email"] == "registry-supplier@example.com"
    assert expense["supplier_phone"] == "+420111222333"
    assert expense["supplier_address"] == "Plzeň 6"
    assert expense["supplier_ico"] == "45454545"
    assert expense["supplier_dic"] == "CZ45454545"
    assert expense["supplier_data_box"] == "registry12"
    assert expense["supplier_country"] == "Slovensko"


def test_uprava_prijateho_dokladu_prepocita_hodnoty() -> None:
    expense = _vytvor_vydaj({"expense_number": "015"})
    _login_admin()

    response = client.put(
        f"/api/admin/invoices/expenses/{expense['id']}",
        json={
            "expense_number": "010",
            "issue_date": "2026-05-03",
            "received_date": "2026-05-04",
            "due_date": "2026-05-20",
            "taxable_supply_date": "2026-05-03",
            "supplier_name": "Upravený dodavatel",
            "supplier_email": "upraveny-dodavatel@example.com",
            "supplier_phone": "+420111111111",
            "supplier_address": "Ostrava 2",
            "supplier_ico": "11112222",
            "supplier_dic": "CZ11112222",
            "supplier_data_box": "newbox12",
            "currency": "EUR",
            "vat_rate": 12,
            "status": "open",
            "note": "Upravený přijatý doklad",
            "payment_method": "Hotově",
            "bank_account_number": "777888999",
            "bank_account_prefix": None,
            "bank_code": "2010",
            "bank_iban": None,
            "items": [
                {"description": "Služba", "quantity": 3, "unit_price": 100},
            ],
        },
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["expense_number"] == "010"
    assert updated["variable_symbol"] == "010"
    assert updated["currency"] == "EUR"
    assert updated["subtotal"] == 300.0
    assert updated["vat_amount"] == 36.0
    assert updated["total"] == 336.0
    assert updated["supplier_name"] == "Upravený dodavatel"


def test_uprava_prijateho_dokladu_se_supplier_id_zkopiruje_novy_snapshot() -> None:
    first_supplier = _vytvor_dodavatele(
        {
            "name": "Old Supplier",
            "email": "old-supplier@example.com",
            "address": "Praha 2",
            "ico": "56565656",
            "dic": "CZ56565656",
        }
    )
    second_supplier = _vytvor_dodavatele(
        {
            "name": "New Supplier",
            "email": "new-supplier@example.com",
            "phone": "+420444555666",
            "address": "Brno 9",
            "ico": "78787878",
            "dic": "CZ78787878",
            "data_box": "new-registry",
            "country": "Rakousko",
        }
    )
    expense = _vytvor_vydaj(
        {
            "supplier_id": first_supplier["id"],
            "supplier_name": None,
            "supplier_email": None,
            "supplier_phone": None,
            "supplier_address": None,
            "supplier_ico": None,
            "supplier_dic": None,
            "supplier_data_box": None,
            "supplier_country": None,
        }
    )
    _login_admin()

    response = client.put(
        f"/api/admin/invoices/expenses/{expense['id']}",
        json={
            "supplier_id": second_supplier["id"],
            "expense_number": expense["expense_number"],
            "issue_date": expense["issue_date"],
            "received_date": expense["received_date"],
            "due_date": expense["due_date"],
            "taxable_supply_date": expense["taxable_supply_date"],
            "supplier_name": "Ignored Updated Name",
            "supplier_email": "ignored-updated@example.com",
            "supplier_phone": None,
            "supplier_address": "Ignored updated address",
            "supplier_ico": None,
            "supplier_dic": None,
            "supplier_data_box": None,
            "supplier_country": None,
            "currency": expense["currency"],
            "vat_rate": 21,
            "status": "open",
            "note": expense["note"],
            "payment_method": expense["payment_method"],
            "bank_account_number": expense["bank_account_number"],
            "bank_account_prefix": expense["bank_account_prefix"],
            "bank_code": expense["bank_code"],
            "bank_iban": expense["bank_iban"],
            "items": [
                {"description": "Materiál", "quantity": 2, "unit_price": 1500},
                {"description": "Doprava", "quantity": 1, "unit_price": 500},
            ],
        },
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["supplier_id"] == second_supplier["id"]
    assert updated["supplier_name"] == "New Supplier"
    assert updated["supplier_email"] == "new-supplier@example.com"
    assert updated["supplier_phone"] == "+420444555666"
    assert updated["supplier_address"] == "Brno 9"
    assert updated["supplier_ico"] == "78787878"
    assert updated["supplier_dic"] == "CZ78787878"
    assert updated["supplier_data_box"] == "new-registry"
    assert updated["supplier_country"] == "Rakousko"


def test_uprava_dodavatele_po_vytvoreni_vydaje_nemeni_historicky_snapshot() -> None:
    supplier = _vytvor_dodavatele(
        {
            "name": "Historic Supplier",
            "email": "historic-supplier@example.com",
            "address": "Liberec 4",
            "country": "Česká republika",
        }
    )
    expense = _vytvor_vydaj(
        {
            "supplier_id": supplier["id"],
            "supplier_name": None,
            "supplier_email": None,
            "supplier_phone": None,
            "supplier_address": None,
            "supplier_ico": None,
            "supplier_dic": None,
            "supplier_data_box": None,
            "supplier_country": None,
        }
    )
    _login_admin()

    update_supplier_response = client.put(
        f"/api/admin/invoices/suppliers/{supplier['id']}",
        json={
            "name": "Historic Supplier Updated",
            "email": "historic-supplier-updated@example.com",
            "phone": "+420999000111",
            "address": "Olomouc 1",
            "ico": "90909090",
            "dic": "CZ90909090",
            "data_box": "historic-supplier",
            "country": "Německo",
            "note": "Updated registry supplier",
        },
    )
    assert update_supplier_response.status_code == 200

    detail_response = client.get(f"/api/admin/invoices/expenses/{expense['id']}")
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["supplier_id"] == supplier["id"]
    assert detail["supplier_name"] == "Historic Supplier"
    assert detail["supplier_email"] == "historic-supplier@example.com"
    assert detail["supplier_address"] == "Liberec 4"
    assert detail["supplier_country"] == "Česká republika"


def test_smazani_neuhrazeneho_prijateho_dokladu_funguje() -> None:
    expense = _vytvor_vydaj({"supplier_email": "delete-expense@example.com"})
    _login_admin()

    response = client.delete(f"/api/admin/invoices/expenses/{expense['id']}")
    detail_response = client.get(f"/api/admin/invoices/expenses/{expense['id']}")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "expense_id": expense["id"]}
    assert detail_response.status_code == 404


def test_smazani_uhrazeneho_nebo_castecne_uhrazeneho_prijateho_dokladu_je_blokovano() -> None:
    expense = _vytvor_vydaj({"supplier_email": "paid-delete@example.com"})
    _pridej_platbu_vydaje(expense["id"], {"amount": 1000})
    _login_admin()

    response = client.delete(f"/api/admin/invoices/expenses/{expense['id']}")

    assert response.status_code == 400
    assert response.json() == {"detail": "Přijatý doklad s evidovanými platbami nelze smazat."}


def test_castecna_a_plna_uhrada_prijateho_dokladu_funguji() -> None:
    expense = _vytvor_vydaj({"supplier_email": "payment-expense@example.com"})

    after_first = _pridej_platbu_vydaje(
        expense["id"],
        {"amount": 1000, "paid_at": "2026-05-10", "payment_method": "Bankovní převod"},
    )
    assert after_first["payment_status"] == "partially_paid"
    assert after_first["status"] == "partially_paid"
    assert after_first["total_paid"] == 1000.0
    assert after_first["remaining_amount"] == 3235.0

    after_second = _pridej_platbu_vydaje(
        expense["id"],
        {"amount": 3235.0, "paid_at": "2026-05-11", "payment_method": "Kartou"},
    )
    assert after_second["payment_status"] == "paid"
    assert after_second["status"] == "paid"
    assert after_second["total_paid"] == 4235.0
    assert after_second["remaining_amount"] == 0.0
    assert len(after_second["payments"]) == 2

    _login_admin()
    payments_response = client.get(f"/api/admin/invoices/expenses/{expense['id']}/payments")
    assert payments_response.status_code == 200
    assert payments_response.json() == after_second["payments"]


def test_preplatek_u_prijateho_dokladu_je_odmitnut() -> None:
    expense = _vytvor_vydaj({"supplier_email": "overpay-expense@example.com"})
    _login_admin()

    response = client.post(
        f"/api/admin/invoices/expenses/{expense['id']}/payments",
        json={
            "amount": 5000,
            "paid_at": "2026-05-10",
            "payment_method": "Převodem",
            "note": "Přeplatek",
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Součet plateb nesmí překročit celkovou částku přijatého dokladu."}


def test_smazani_platby_prijateho_dokladu_prepocita_summary() -> None:
    expense = _vytvor_vydaj({"supplier_email": "delete-payment-expense@example.com"})
    _pridej_platbu_vydaje(expense["id"], {"amount": 1000, "paid_at": "2026-05-10"})
    after_second = _pridej_platbu_vydaje(expense["id"], {"amount": 500, "paid_at": "2026-05-11"})
    payment_id = after_second["payments"][0]["id"]
    _login_admin()

    response = client.delete(f"/api/admin/invoices/expenses/{expense['id']}/payments/{payment_id}")

    assert response.status_code == 200
    updated = response.json()
    assert len(updated["payments"]) == 1
    assert updated["payments"][0]["amount"] == 500.0
    assert updated["payment_status"] == "partially_paid"
    assert updated["status"] == "partially_paid"
    assert updated["total_paid"] == 500.0
    assert updated["remaining_amount"] == 3735.0


def test_prijaty_doklad_po_splatnosti_ma_status_overdue() -> None:
    expense = _vytvor_vydaj(
        {
            "supplier_email": "overdue-expense@example.com",
            "issue_date": "2020-01-01",
            "received_date": "2020-01-02",
            "due_date": "2020-01-15",
            "taxable_supply_date": "2020-01-01",
        }
    )

    assert expense["status"] == "overdue"
    assert expense["payment_status"] == "unpaid"


def test_rada_prijatych_dokladu_je_nezavisla_na_fakturach() -> None:
    invoice = _vytvor_fakturu({"customer_email": "expense-sequence-invoice@example.com"})
    expense = _vytvor_vydaj({"supplier_email": "expense-sequence@example.com"})

    assert invoice["invoice_number"] == "001"
    assert expense["expense_number"] == "001"

    with SessionLocal() as db:
        invoice_state = (
            db.query(InvoiceSequenceState)
            .filter(InvoiceSequenceState.sequence_key == "default")
            .first()
        )
        expense_state = (
            db.query(InvoiceSequenceState)
            .filter(InvoiceSequenceState.sequence_key == "expense")
            .first()
        )
        assert invoice_state is not None
        assert expense_state is not None
        assert invoice_state.document_kind == "invoice"
        assert expense_state.document_kind == "expense"
        assert invoice_state.last_number == 1
        assert expense_state.last_number == 1


def test_vytvoreni_prijateho_dokladu_nezmeni_invoice_radu_a_naopak() -> None:
    first_expense = _vytvor_vydaj({"supplier_email": "independent-expense-1@example.com"})
    first_invoice = _vytvor_fakturu({"customer_email": "independent-invoice-1@example.com"})
    second_expense = _vytvor_vydaj({"supplier_email": "independent-expense-2@example.com"})
    second_invoice = _vytvor_fakturu({"customer_email": "independent-invoice-2@example.com"})

    assert first_expense["expense_number"] == "001"
    assert second_expense["expense_number"] == "002"
    assert first_invoice["invoice_number"] == "001"
    assert second_invoice["invoice_number"] == "002"

    with SessionLocal() as db:
        expense_count = db.query(InvoiceExpense).count()
        assert expense_count == 2


def test_uprava_prijateho_dokladu_nepovoli_snizit_total_pod_soucet_plateb() -> None:
    expense = _vytvor_vydaj({"supplier_email": "update-paid-expense@example.com"})
    _pridej_platbu_vydaje(expense["id"], {"amount": 1500})
    _login_admin()

    response = client.put(
        f"/api/admin/invoices/expenses/{expense['id']}",
        json={
            "issue_date": "2026-05-01",
            "received_date": "2026-05-02",
            "due_date": "2026-05-16",
            "taxable_supply_date": "2026-05-01",
            "supplier_name": "Dodavatel s.r.o.",
            "supplier_email": "update-paid-expense@example.com",
            "supplier_phone": "+420987654321",
            "supplier_address": "Brno 5",
            "supplier_ico": "87654321",
            "supplier_dic": "CZ87654321",
            "supplier_data_box": "exp1234",
            "currency": "CZK",
            "vat_rate": 0,
            "status": "open",
            "note": "Pokus o zmenšení totalu",
            "payment_method": "Bankovní převod",
            "bank_account_number": "123456789",
            "bank_account_prefix": "19",
            "bank_code": "0800",
            "bank_iban": "CZ6508000000001234567899",
            "items": [
                {"description": "Drobná položka", "quantity": 1, "unit_price": 1000},
            ],
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Součet plateb nesmí překročit novou celkovou částku přijatého dokladu."}


def test_import_bankovnich_transakci_list_detail_a_duplicate_guard_funguji() -> None:
    first_import = _importuj_bankovni_transakce(
        [
            {
                "external_id": "bank-tx-1",
                "transaction_date": "2026-06-01",
                "booked_date": "2026-06-02",
                "amount": 2000,
                "currency": "czk",
                "variable_symbol": "123",
                "message": "Prichozi platba",
                "direction": "incoming",
            },
            {
                "external_id": "bank-tx-2",
                "transaction_date": "2026-06-03",
                "amount": 4235,
                "currency": "CZK",
                "variable_symbol": "456",
                "message": "Odchozi platba",
                "direction": "outgoing",
            },
        ]
    )
    second_import = _importuj_bankovni_transakce(
        [
            {
                "external_id": "bank-tx-1",
                "transaction_date": "2026-06-01",
                "amount": 2000,
                "currency": "CZK",
                "variable_symbol": "123",
                "direction": "incoming",
            }
        ]
    )
    _login_admin()

    list_response = client.get("/api/admin/invoices/bank-transactions")
    detail_response = client.get(f"/api/admin/invoices/bank-transactions/{first_import['imported_transaction_ids'][0]}")

    assert first_import["imported_count"] == 2
    assert first_import["skipped_duplicate_count"] == 0
    assert second_import["imported_count"] == 0
    assert second_import["skipped_duplicate_count"] == 1
    assert list_response.status_code == 200
    listed = list_response.json()
    assert len(listed) == 2
    assert listed[0]["direction"] == "outgoing"
    assert detail_response.status_code == 200
    assert detail_response.json()["external_id"] == "bank-tx-1"
    assert detail_response.json()["status"] == "imported"


def test_import_bankovni_transakce_s_neplatnou_castkou_je_odmitnut() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices/bank-transactions/import",
        json={
            "transactions": [
                {
                    "external_id": "invalid-bank-tx",
                    "transaction_date": "2026-06-01",
                    "amount": 0,
                    "currency": "CZK",
                    "direction": "incoming",
                }
            ]
        },
    )

    assert response.status_code == 422


def test_ignore_bankovni_transakce_funguje() -> None:
    imported = _importuj_bankovni_transakce(
        [
            {
                "external_id": "ignore-bank-tx",
                "transaction_date": "2026-06-05",
                "amount": 1000,
                "currency": "CZK",
                "direction": "incoming",
            }
        ]
    )
    transaction_id = imported["imported_transaction_ids"][0]
    _login_admin()

    response = client.post(f"/api/admin/invoices/bank-transactions/{transaction_id}/ignore")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "transaction_id": transaction_id, "status": "ignored"}


def test_generate_matches_pro_incoming_transakci_s_variabilnim_symbolem_a_castkou_navrhne_fakturu() -> None:
    invoice = _vytvor_fakturu({"customer_email": "bank-match-invoice@example.com"})
    imported = _importuj_bankovni_transakce(
        [
            {
                "external_id": "incoming-match-1",
                "transaction_date": "2026-06-10",
                "amount": invoice["total"],
                "currency": "CZK",
                "variable_symbol": invoice["variable_symbol"],
                "direction": "incoming",
            }
        ]
    )

    matches = _vygeneruj_matche_bankovni_transakce(imported["imported_transaction_ids"][0])

    assert len(matches) == 1
    assert matches[0]["invoice_id"] == invoice["id"]
    assert matches[0]["match_type"] == "variable_symbol_amount"
    assert matches[0]["confidence"] == 100
    assert matches[0]["status"] == "suggested"


def test_generate_matches_pro_incoming_transakci_nevraci_quote_ani_plne_uhrazenou_fakturu() -> None:
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "bank-match-quote@example.com",
        }
    )
    paid_invoice = _vytvor_fakturu({"customer_email": "bank-match-paid@example.com"})
    _pridej_platbu(paid_invoice["id"], {"amount": paid_invoice["total"], "paid_at": "2026-06-10"})

    quote_tx = _importuj_bankovni_transakce(
        [
            {
                "external_id": "incoming-quote-skip",
                "transaction_date": "2026-06-11",
                "amount": quote["total"],
                "currency": "CZK",
                "variable_symbol": quote["variable_symbol"],
                "direction": "incoming",
            }
        ]
    )
    paid_tx = _importuj_bankovni_transakce(
        [
            {
                "external_id": "incoming-paid-skip",
                "transaction_date": "2026-06-12",
                "amount": paid_invoice["total"],
                "currency": "CZK",
                "variable_symbol": paid_invoice["variable_symbol"],
                "direction": "incoming",
            }
        ]
    )

    quote_matches = _vygeneruj_matche_bankovni_transakce(quote_tx["imported_transaction_ids"][0])
    paid_matches = _vygeneruj_matche_bankovni_transakce(paid_tx["imported_transaction_ids"][0])

    assert quote_matches == []
    assert paid_matches == []


def test_generate_matches_pro_outgoing_transakci_navrhne_vydaj_a_amount_only_jen_kdyz_je_unikatni() -> None:
    expense = _vytvor_vydaj({"supplier_email": "bank-match-expense@example.com"})
    imported_vs = _importuj_bankovni_transakce(
        [
            {
                "external_id": "outgoing-match-vs",
                "transaction_date": "2026-06-13",
                "amount": expense["total"],
                "currency": "CZK",
                "variable_symbol": expense["variable_symbol"],
                "direction": "outgoing",
            }
        ]
    )
    imported_amount = _importuj_bankovni_transakce(
        [
            {
                "external_id": "outgoing-match-amount",
                "transaction_date": "2026-06-14",
                "amount": expense["total"],
                "currency": "CZK",
                "direction": "outgoing",
            }
        ]
    )

    vs_matches = _vygeneruj_matche_bankovni_transakce(imported_vs["imported_transaction_ids"][0])
    amount_matches = _vygeneruj_matche_bankovni_transakce(imported_amount["imported_transaction_ids"][0])

    assert len(vs_matches) == 1
    assert vs_matches[0]["expense_id"] == expense["id"]
    assert vs_matches[0]["match_type"] == "variable_symbol_amount"
    assert len(amount_matches) == 1
    assert amount_matches[0]["expense_id"] == expense["id"]
    assert amount_matches[0]["match_type"] == "amount_only"
    assert amount_matches[0]["confidence"] == 60


def test_opakovana_generace_matchu_nevytvori_duplicitni_suggestions() -> None:
    invoice = _vytvor_fakturu({"customer_email": "bank-duplicate-match@example.com"})
    imported = _importuj_bankovni_transakce(
        [
            {
                "external_id": "incoming-duplicate-match",
                "transaction_date": "2026-06-15",
                "amount": invoice["total"],
                "currency": "CZK",
                "variable_symbol": invoice["variable_symbol"],
                "direction": "incoming",
            }
        ]
    )
    transaction_id = imported["imported_transaction_ids"][0]

    first_matches = _vygeneruj_matche_bankovni_transakce(transaction_id)
    second_matches = _vygeneruj_matche_bankovni_transakce(transaction_id)

    assert len(first_matches) == 1
    assert len(second_matches) == 1
    with SessionLocal() as db:
        match_count = (
            db.query(InvoicePaymentMatch)
            .filter(InvoicePaymentMatch.bank_transaction_id == transaction_id)
            .count()
        )
        assert match_count == 1


def test_aplikace_matche_vytvori_platbu_faktury_a_oznaci_transakci_jako_matched() -> None:
    invoice = _vytvor_fakturu({"customer_email": "bank-apply-invoice@example.com"})
    imported = _importuj_bankovni_transakce(
        [
            {
                "external_id": "incoming-apply-invoice",
                "transaction_date": "2026-06-16",
                "amount": invoice["total"],
                "currency": "CZK",
                "variable_symbol": invoice["variable_symbol"],
                "direction": "incoming",
            }
        ]
    )
    transaction_id = imported["imported_transaction_ids"][0]
    matches = _vygeneruj_matche_bankovni_transakce(transaction_id)

    applied = _aplikuj_match_bankovni_transakce(transaction_id, matches[0]["id"])
    _login_admin()
    transaction_detail = client.get(f"/api/admin/invoices/bank-transactions/{transaction_id}").json()
    invoice_detail = client.get(f"/api/admin/invoices/{invoice['id']}").json()

    assert applied["status"] == "applied"
    assert applied["invoice_payment_id"] is not None
    assert transaction_detail["status"] == "matched"
    assert invoice_detail["payment_status"] == "paid"
    assert invoice_detail["payments"][0]["payment_method"] == "Bankovní převod"


def test_aplikace_matche_vytvori_platbu_vydaje_a_reject_funguje() -> None:
    expense = _vytvor_vydaj({"supplier_email": "bank-apply-expense@example.com"})
    imported = _importuj_bankovni_transakce(
        [
            {
                "external_id": "outgoing-apply-expense",
                "transaction_date": "2026-06-17",
                "amount": expense["total"],
                "currency": "CZK",
                "variable_symbol": expense["variable_symbol"],
                "direction": "outgoing",
            },
            {
                "external_id": "outgoing-reject-expense",
                "transaction_date": "2026-06-18",
                "amount": expense["total"],
                "currency": "CZK",
                "variable_symbol": expense["variable_symbol"],
                "direction": "outgoing",
            },
        ]
    )
    apply_tx_id = imported["imported_transaction_ids"][0]
    reject_tx_id = imported["imported_transaction_ids"][1]

    apply_matches = _vygeneruj_matche_bankovni_transakce(apply_tx_id)
    reject_matches = _vygeneruj_matche_bankovni_transakce(reject_tx_id)

    applied = _aplikuj_match_bankovni_transakce(apply_tx_id, apply_matches[0]["id"])
    _login_admin()
    reject_response = client.post(
        f"/api/admin/invoices/bank-transactions/{reject_tx_id}/matches/{reject_matches[0]['id']}/reject"
    )
    expense_detail = client.get(f"/api/admin/invoices/expenses/{expense['id']}").json()

    assert applied["status"] == "applied"
    assert applied["expense_payment_id"] is not None
    assert reject_response.status_code == 200
    assert reject_response.json()["status"] == "rejected"
    assert expense_detail["payment_status"] == "paid"


def test_aplikace_matche_nepovoli_overpay_ani_opakovanou_aplikaci_stejne_transakce() -> None:
    invoice = _vytvor_fakturu({"customer_email": "bank-overpay-invoice@example.com"})
    overpay_import = _importuj_bankovni_transakce(
        [
            {
                "external_id": "incoming-overpay-invoice",
                "transaction_date": "2026-06-19",
                "amount": 20000,
                "currency": "CZK",
                "variable_symbol": invoice["variable_symbol"],
                "direction": "incoming",
            }
        ]
    )
    overpay_tx_id = overpay_import["imported_transaction_ids"][0]
    overpay_matches = _vygeneruj_matche_bankovni_transakce(overpay_tx_id)
    _login_admin()
    overpay_response = client.post(
        f"/api/admin/invoices/bank-transactions/{overpay_tx_id}/matches/{overpay_matches[0]['id']}/apply"
    )

    assert overpay_response.status_code == 400
    assert overpay_response.json() == {"detail": "Součet plateb nesmí překročit celkovou částku faktury."}

    second_invoice = _vytvor_fakturu({"customer_email": "bank-repeat-invoice@example.com"})
    repeat_import = _importuj_bankovni_transakce(
        [
            {
                "external_id": "incoming-repeat-invoice",
                "transaction_date": "2026-06-20",
                "amount": second_invoice["total"],
                "currency": "CZK",
                "variable_symbol": second_invoice["variable_symbol"],
                "direction": "incoming",
            }
        ]
    )
    repeat_tx_id = repeat_import["imported_transaction_ids"][0]
    repeat_matches = _vygeneruj_matche_bankovni_transakce(repeat_tx_id)
    first_applied = _aplikuj_match_bankovni_transakce(repeat_tx_id, repeat_matches[0]["id"])
    _login_admin()
    second_apply_response = client.post(
        f"/api/admin/invoices/bank-transactions/{repeat_tx_id}/matches/{first_applied['id']}/apply"
    )

    assert second_apply_response.status_code == 400
    assert second_apply_response.json() == {"detail": "Tato bankovní transakce už byla spárována."}


def test_katalog_matche_bankovnich_transakci_vraci_navrzenou_shodu_s_kandidatem_faktury() -> None:
    invoice = _vytvor_fakturu({"customer_email": "catalog-match-invoice@example.com"})
    imported = _importuj_bankovni_transakce(
        [
            {
                "external_id": "catalog-match-incoming-1",
                "transaction_date": "2026-06-10",
                "amount": invoice["total"],
                "currency": "CZK",
                "variable_symbol": invoice["variable_symbol"],
                "direction": "incoming",
            }
        ]
    )
    transaction_id = imported["imported_transaction_ids"][0]
    generated = _vygeneruj_matche_bankovni_transakce(transaction_id)

    catalog = _ziskej_katalog_matche_bankovnich_transakci()

    assert len(catalog) == 1
    assert catalog[0]["id"] == generated[0]["id"]
    assert catalog[0]["status"] == "suggested"
    assert catalog[0]["invoice_id"] == invoice["id"]
    assert catalog[0]["bank_transaction"]["id"] == transaction_id
    assert catalog[0]["bank_transaction"]["status"] == "imported"
    assert catalog[0]["candidate"]["invoice_id"] == invoice["id"]
    assert catalog[0]["candidate"]["document_number"] == invoice["invoice_number"]
    assert catalog[0]["candidate"]["variable_symbol"] == invoice["variable_symbol"]
    assert catalog[0]["candidate"]["remaining_amount"] == invoice["total"]


def test_katalog_matche_bankovnich_transakci_default_nevraci_aplikovane_ani_zamitnute() -> None:
    invoice = _vytvor_fakturu({"customer_email": "catalog-applied-rejected@example.com"})
    applied_import = _importuj_bankovni_transakce(
        [
            {
                "external_id": "catalog-apply-1",
                "transaction_date": "2026-06-11",
                "amount": invoice["total"],
                "currency": "CZK",
                "variable_symbol": invoice["variable_symbol"],
                "direction": "incoming",
            }
        ]
    )
    rejected_import = _importuj_bankovni_transakce(
        [
            {
                "external_id": "catalog-reject-1",
                "transaction_date": "2026-06-12",
                "amount": invoice["total"],
                "currency": "CZK",
                "variable_symbol": invoice["variable_symbol"],
                "direction": "incoming",
            }
        ]
    )
    apply_tx_id = applied_import["imported_transaction_ids"][0]
    reject_tx_id = rejected_import["imported_transaction_ids"][0]
    apply_matches = _vygeneruj_matche_bankovni_transakce(apply_tx_id)
    reject_matches = _vygeneruj_matche_bankovni_transakce(reject_tx_id)
    _aplikuj_match_bankovni_transakce(apply_tx_id, apply_matches[0]["id"])
    _login_admin()
    client.post(
        f"/api/admin/invoices/bank-transactions/{reject_tx_id}/matches/{reject_matches[0]['id']}/reject"
    )

    default_catalog = _ziskej_katalog_matche_bankovnich_transakci()
    applied_catalog = _ziskej_katalog_matche_bankovnich_transakci("status=applied")
    rejected_catalog = _ziskej_katalog_matche_bankovnich_transakci("status=rejected")

    assert default_catalog == []
    assert len(applied_catalog) == 1
    assert applied_catalog[0]["id"] == apply_matches[0]["id"]
    assert len(rejected_catalog) == 1
    assert rejected_catalog[0]["id"] == reject_matches[0]["id"]


def test_katalog_matche_bankovnich_transakci_pagination_ordering_auth_a_matched_transaction() -> None:
    first_invoice = _vytvor_fakturu({"customer_email": "catalog-order-1@example.com"})
    second_invoice = _vytvor_fakturu({"customer_email": "catalog-order-2@example.com"})
    matched_invoice = _vytvor_fakturu({"customer_email": "catalog-order-matched@example.com"})
    first_import = _importuj_bankovni_transakce(
        [
            {
                "external_id": "catalog-order-low",
                "transaction_date": "2026-06-13",
                "amount": first_invoice["total"],
                "currency": "CZK",
                "variable_symbol": first_invoice["variable_symbol"],
                "direction": "incoming",
            }
        ]
    )
    second_import = _importuj_bankovni_transakce(
        [
            {
                "external_id": "catalog-order-high",
                "transaction_date": "2026-06-14",
                "amount": second_invoice["total"],
                "currency": "CZK",
                "variable_symbol": second_invoice["variable_symbol"],
                "direction": "incoming",
                "message": "High confidence candidate",
            }
        ]
    )
    matched_import = _importuj_bankovni_transakce(
        [
            {
                "external_id": "catalog-order-matched",
                "transaction_date": "2026-06-15",
                "amount": matched_invoice["total"],
                "currency": "CZK",
                "variable_symbol": matched_invoice["variable_symbol"],
                "direction": "incoming",
            }
        ]
    )
    first_tx_id = first_import["imported_transaction_ids"][0]
    second_tx_id = second_import["imported_transaction_ids"][0]
    matched_tx_id = matched_import["imported_transaction_ids"][0]
    first_matches = _vygeneruj_matche_bankovni_transakce(first_tx_id)
    second_matches = _vygeneruj_matche_bankovni_transakce(second_tx_id)
    matched_matches = _vygeneruj_matche_bankovni_transakce(matched_tx_id)
    _aplikuj_match_bankovni_transakce(matched_tx_id, matched_matches[0]["id"])

    anonymous_client = TestClient(app)
    unauthorized = anonymous_client.get("/api/admin/invoices/bank-transactions/matches")
    assert unauthorized.status_code == 401
    assert unauthorized.json() == {"detail": "Přihlaste se do adminu"}

    full_catalog = _ziskej_katalog_matche_bankovnich_transakci()
    paged_catalog = _ziskej_katalog_matche_bankovnich_transakci("limit=1&offset=0")
    second_page = _ziskej_katalog_matche_bankovnich_transakci("limit=1&offset=1")

    returned_ids = {item["id"] for item in full_catalog}
    assert first_matches[0]["id"] in returned_ids
    assert second_matches[0]["id"] in returned_ids
    assert matched_matches[0]["id"] not in returned_ids
    assert len(paged_catalog) == 1
    assert len(second_page) == 1
    assert paged_catalog[0]["id"] != second_page[0]["id"]

    confidences = [item["confidence"] for item in full_catalog]
    assert confidences == sorted(confidences, reverse=True)


def test_list_payable_invoices_for_bank_matching_vraci_vystavene_neuhrazene_doklady() -> None:
    unpaid_invoice = _vytvor_fakturu({"customer_email": "payable-list-unpaid@example.com"})
    paid_invoice = _vytvor_fakturu({"customer_email": "payable-list-paid@example.com"})
    _pridej_platbu(paid_invoice["id"], {"amount": paid_invoice["total"]})
    quote = _vytvor_fakturu(
        {
            "customer_email": "payable-list-quote@example.com",
            "document_kind": "quote",
        }
    )
    _login_admin()
    response = client.get("/api/admin/invoices/bank-transactions/payable-invoices")

    assert response.status_code == 200
    body = response.json()
    returned_ids = {item["id"] for item in body}
    assert unpaid_invoice["id"] in returned_ids
    assert paid_invoice["id"] not in returned_ids
    assert quote["id"] not in returned_ids

    unpaid_item = next(item for item in body if item["id"] == unpaid_invoice["id"])
    assert unpaid_item["invoice_number"] == unpaid_invoice["invoice_number"]
    assert unpaid_item["remaining_amount"] == unpaid_invoice["remaining_amount"]
    assert unpaid_item["payment_status"] == "unpaid"


def test_record_invoice_bank_payment_zapise_platbu_podle_id_faktury() -> None:
    invoice = _vytvor_fakturu({"customer_email": "record-payment-invoice@example.com"})
    _login_admin()
    response = client.post(
        "/api/admin/invoices/bank-transactions/record-invoice-payment",
        json={
            "invoice_id": invoice["id"],
            "transaction_date": "2026-06-20",
            "amount": invoice["total"],
            "message": "Ruční zápis platby",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["invoice_id"] == invoice["id"]
    assert body["invoice_number"] == invoice["invoice_number"]
    assert body["transaction_status"] == "matched"
    assert body["payment_status"] == "paid"
    assert body["remaining_amount"] == 0.0

    detail = client.get(f"/api/admin/invoices/bank-transactions/{body['transaction_id']}").json()
    assert detail["status"] == "matched"


def test_assign_bank_transaction_to_invoice_aplikuje_manual_match() -> None:
    invoice = _vytvor_fakturu({"customer_email": "assign-invoice-number@example.com"})
    imported = _importuj_bankovni_transakce(
        [
            {
                "external_id": "assign-invoice-number-tx",
                "transaction_date": "2026-06-21",
                "amount": invoice["total"],
                "currency": "CZK",
                "variable_symbol": "999999",
                "direction": "incoming",
            }
        ]
    )
    transaction_id = imported["imported_transaction_ids"][0]
    _login_admin()
    response = client.post(
        f"/api/admin/invoices/bank-transactions/{transaction_id}/assign-invoice",
        json={"invoice_id": invoice["id"]},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "applied"
    assert response.json()["invoice_id"] == invoice["id"]
    assert response.json()["match_type"] == "manual"

    invoice_detail = client.get(f"/api/admin/invoices/{invoice['id']}").json()
    assert invoice_detail["payment_status"] == "paid"


def test_vytvoreni_recurring_invoice_proforma_a_expense_sablon_funguje() -> None:
    invoice_template = _vytvor_recurring_sablonu({"name": "Recurring invoice"})
    proforma_template = _vytvor_recurring_sablonu(
        {
            "name": "Recurring proforma",
            "document_kind": "proforma",
            "next_run_date": "2099-07-02",
        }
    )
    supplier = _vytvor_dodavatele({"email": "recurring-expense-supplier@example.com"})
    expense_template = _vytvor_recurring_sablonu(
        {
            "template_type": "expense",
            "document_kind": None,
            "subject_id": None,
            "supplier_id": supplier["id"],
            "name": "Recurring expense",
            "business_mode": None,
            "tax_mode": None,
            "payment_method": "Bankovní převod",
            "bank_account_number": "123456789",
            "bank_account_prefix": "19",
            "bank_code": "0800",
            "bank_iban": "CZ6508000000001234567899",
            "next_run_date": "2099-07-03",
        }
    )

    assert invoice_template["template_type"] == "invoice"
    assert invoice_template["document_kind"] == "invoice"
    assert proforma_template["document_kind"] == "proforma"
    assert expense_template["template_type"] == "expense"
    assert expense_template["supplier_id"] == supplier["id"]


def test_list_filter_detail_update_a_stavove_prehody_recurring_sablon_funguji() -> None:
    active_template = _vytvor_recurring_sablonu({"name": "Active recurring"})
    paused_template = _vytvor_recurring_sablonu({"name": "Paused recurring", "status": "paused"})
    _login_admin()

    list_response = client.get("/api/admin/invoices/recurring-templates?template_type=invoice&status=active")
    detail_response = client.get(f"/api/admin/invoices/recurring-templates/{active_template['id']}")
    update_response = client.put(
        f"/api/admin/invoices/recurring-templates/{active_template['id']}",
        json={
            "template_type": "invoice",
            "document_kind": "invoice",
            "subject_id": active_template["subject_id"],
            "supplier_id": None,
            "name": "Updated recurring",
            "status": "active",
            "recurrence_interval": "weekly",
            "recurrence_count": 2,
            "next_run_date": "2099-08-01",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "EUR",
            "vat_rate": 12,
            "note": "Updated note",
            "payment_method": None,
            "bank_account_number": None,
            "bank_account_prefix": None,
            "bank_code": None,
            "bank_iban": None,
            "items": [{"description": "Updated item", "quantity": 3, "unit_price": 100}],
        },
    )
    pause_response = client.post(f"/api/admin/invoices/recurring-templates/{active_template['id']}/pause")
    activate_response = client.post(f"/api/admin/invoices/recurring-templates/{paused_template['id']}/activate")
    cancel_response = client.post(f"/api/admin/invoices/recurring-templates/{paused_template['id']}/cancel")

    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert list_response.json()[0]["id"] == active_template["id"]
    assert detail_response.status_code == 200
    assert detail_response.json()["name"] == "Active recurring"
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Updated recurring"
    assert update_response.json()["currency"] == "EUR"
    assert len(update_response.json()["items"]) == 1
    assert update_response.json()["items"][0]["line_total"] == 300.0
    assert pause_response.status_code == 200
    assert pause_response.json()["status"] == "paused"
    assert activate_response.status_code == 200
    assert activate_response.json()["status"] == "active"
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelled"


def test_delete_recurring_sablony_bez_generaci_funguje_a_s_generacemi_je_blokovano() -> None:
    deletable = _vytvor_recurring_sablonu({"name": "Delete recurring"})
    generated = _vytvor_recurring_sablonu({"name": "Generated recurring"})
    _login_admin()

    delete_response = client.delete(f"/api/admin/invoices/recurring-templates/{deletable['id']}")
    generate_response = client.post(f"/api/admin/invoices/recurring-templates/{generated['id']}/generate")
    blocked_delete_response = client.delete(f"/api/admin/invoices/recurring-templates/{generated['id']}")

    assert delete_response.status_code == 200
    assert delete_response.json() == {"ok": True, "template_id": deletable["id"]}
    assert generate_response.status_code == 200
    assert blocked_delete_response.status_code == 400
    assert blocked_delete_response.json() == {"detail": "Recurring šablonu s historií generování nelze smazat."}


def test_validace_recurring_sablon_odmitne_neplatne_kombinace() -> None:
    subject = _vytvor_subjekt({"email": "recurring-validation-subject@example.com"})
    supplier = _vytvor_dodavatele({"email": "recurring-validation-supplier@example.com"})
    _login_admin()

    unsupported_document_kind = client.post(
        "/api/admin/invoices/recurring-templates",
        json={
            "template_type": "invoice",
            "document_kind": "quote",
            "subject_id": subject["id"],
            "supplier_id": None,
            "name": "Invalid invoice kind",
            "status": "active",
            "recurrence_interval": "monthly",
            "recurrence_count": 1,
            "next_run_date": "2099-07-01",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [{"description": "Item", "quantity": 1, "unit_price": 100}],
        },
    )
    expense_with_document_kind = client.post(
        "/api/admin/invoices/recurring-templates",
        json={
            "template_type": "expense",
            "document_kind": "invoice",
            "subject_id": None,
            "supplier_id": supplier["id"],
            "name": "Invalid expense kind",
            "status": "active",
            "recurrence_interval": "monthly",
            "recurrence_count": 1,
            "next_run_date": "2099-07-01",
            "business_mode": None,
            "tax_mode": None,
            "currency": "CZK",
            "vat_rate": 21,
            "payment_method": "Bankovní převod",
            "bank_account_number": "123456789",
            "bank_code": "0800",
            "items": [{"description": "Item", "quantity": 1, "unit_price": 100}],
        },
    )
    invoice_with_supplier = client.post(
        "/api/admin/invoices/recurring-templates",
        json={
            "template_type": "invoice",
            "document_kind": "invoice",
            "subject_id": subject["id"],
            "supplier_id": supplier["id"],
            "name": "Invalid invoice supplier",
            "status": "active",
            "recurrence_interval": "monthly",
            "recurrence_count": 1,
            "next_run_date": "2099-07-01",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [{"description": "Item", "quantity": 1, "unit_price": 100}],
        },
    )
    expense_with_subject = client.post(
        "/api/admin/invoices/recurring-templates",
        json={
            "template_type": "expense",
            "document_kind": None,
            "subject_id": subject["id"],
            "supplier_id": supplier["id"],
            "name": "Invalid expense subject",
            "status": "active",
            "recurrence_interval": "monthly",
            "recurrence_count": 1,
            "next_run_date": "2099-07-01",
            "business_mode": None,
            "tax_mode": None,
            "currency": "CZK",
            "vat_rate": 21,
            "payment_method": "Bankovní převod",
            "bank_account_number": "123456789",
            "bank_code": "0800",
            "items": [{"description": "Item", "quantity": 1, "unit_price": 100}],
        },
    )

    assert unsupported_document_kind.status_code == 422
    assert expense_with_document_kind.status_code == 422
    assert invoice_with_supplier.status_code == 422
    assert expense_with_subject.status_code == 422


def test_generovani_z_pozastavene_nebo_zrusene_recurring_sablony_je_odmitnuto() -> None:
    paused = _vytvor_recurring_sablonu({"status": "paused", "name": "Paused generate"})
    cancelled = _vytvor_recurring_sablonu({"status": "cancelled", "name": "Cancelled generate"})
    _login_admin()

    paused_response = client.post(f"/api/admin/invoices/recurring-templates/{paused['id']}/generate")
    cancelled_response = client.post(f"/api/admin/invoices/recurring-templates/{cancelled['id']}/generate")

    assert paused_response.status_code == 400
    assert paused_response.json() == {"detail": "Generovat lze pouze z aktivní recurring šablony."}
    assert cancelled_response.status_code == 400
    assert cancelled_response.json() == {"detail": "Generovat lze pouze z aktivní recurring šablony."}


def test_generovani_invoice_a_proformy_z_recurring_sablony_funguje_a_neodesila_email() -> None:
    invoice_template = _vytvor_recurring_sablonu({"name": "Generate invoice recurring", "next_run_date": "2099-01-31"})
    proforma_template = _vytvor_recurring_sablonu(
        {
            "name": "Generate proforma recurring",
            "document_kind": "proforma",
            "next_run_date": "2099-07-05",
        }
    )
    from backend.app.modules.invoices import service as invoice_service

    original_deliver = invoice_service.deliver_invoice_email
    invoice_service.deliver_invoice_email = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("email send should not run"))
    try:
        _login_admin()
        invoice_generation = client.post(f"/api/admin/invoices/recurring-templates/{invoice_template['id']}/generate")
        proforma_generation = client.post(f"/api/admin/invoices/recurring-templates/{proforma_template['id']}/generate")
    finally:
        invoice_service.deliver_invoice_email = original_deliver

    assert invoice_generation.status_code == 200
    assert proforma_generation.status_code == 200
    invoice_generation_id = invoice_generation.json()["generated_invoice_id"]
    proforma_generation_id = proforma_generation.json()["generated_invoice_id"]
    _login_admin()
    invoice_detail = client.get(f"/api/admin/invoices/{invoice_generation_id}").json()
    proforma_detail = client.get(f"/api/admin/invoices/{proforma_generation_id}").json()
    invoice_template_detail = client.get(f"/api/admin/invoices/recurring-templates/{invoice_template['id']}").json()
    generation_list = client.get(f"/api/admin/invoices/recurring-templates/{invoice_template['id']}/generations").json()

    assert invoice_detail["document_kind"] == "invoice"
    assert proforma_detail["document_kind"] == "proforma"
    assert invoice_detail["subject_id"] == invoice_template["subject_id"]
    assert invoice_detail["customer_email"] == "recurring-template-subject@example.com"
    assert len(invoice_detail["items"]) == 2
    assert invoice_detail["subtotal"] == 3500.0
    assert invoice_detail["vat_amount"] == 735.0
    assert invoice_template_detail["last_run_date"] == "2099-01-31"
    assert invoice_template_detail["next_run_date"] == "2099-02-28"
    assert len(generation_list) == 1
    assert generation_list[0]["generated_invoice_id"] == invoice_generation_id


def test_generovani_expense_z_recurring_sablony_funguje_a_loguje_generaci() -> None:
    supplier = _vytvor_dodavatele({"email": "recurring-generate-expense@example.com"})
    template = _vytvor_recurring_sablonu(
        {
            "template_type": "expense",
            "document_kind": None,
            "subject_id": None,
            "supplier_id": supplier["id"],
            "name": "Generate recurring expense",
            "business_mode": None,
            "tax_mode": None,
            "payment_method": "Bankovní převod",
            "bank_account_number": "123456789",
            "bank_account_prefix": "19",
            "bank_code": "0800",
            "bank_iban": "CZ6508000000001234567899",
            "next_run_date": "2099-07-10",
        }
    )
    _login_admin()

    generation_response = client.post(f"/api/admin/invoices/recurring-templates/{template['id']}/generate")
    assert generation_response.status_code == 200
    generated_expense_id = generation_response.json()["generated_expense_id"]
    expense_detail = client.get(f"/api/admin/invoices/expenses/{generated_expense_id}").json()
    template_detail = client.get(f"/api/admin/invoices/recurring-templates/{template['id']}").json()
    generations_response = client.get(f"/api/admin/invoices/recurring-templates/{template['id']}/generations")

    assert expense_detail["supplier_id"] == supplier["id"]
    assert expense_detail["supplier_email"] == "recurring-generate-expense@example.com"
    assert len(expense_detail["items"]) == 2
    assert expense_detail["subtotal"] == 3500.0
    assert expense_detail["vat_amount"] == 735.0
    assert template_detail["last_run_date"] == "2099-07-10"
    assert template_detail["next_run_date"] == "2099-08-10"
    assert generations_response.status_code == 200
    assert generations_response.json()[0]["generated_expense_id"] == generated_expense_id


def test_recurring_generace_se_propise_do_generations_tabulky() -> None:
    template = _vytvor_recurring_sablonu({"name": "Generation log recurring"})
    _login_admin()
    generate_response = client.post(f"/api/admin/invoices/recurring-templates/{template['id']}/generate")
    assert generate_response.status_code == 200

    with SessionLocal() as db:
        generation = (
            db.query(InvoiceRecurringGeneration)
            .filter(InvoiceRecurringGeneration.template_id == template["id"])
            .first()
        )
        template_row = db.query(InvoiceRecurringTemplate).filter(InvoiceRecurringTemplate.id == template["id"]).first()
        assert generation is not None
        assert generation.status == "generated"
        assert template_row is not None
        assert template_row.last_run_date is not None


def test_lookup_ares_podle_ico_vrati_namapovana_data() -> None:
    _login_admin()

    from backend.app.modules.invoices import router as invoices_router

    original_lookup = invoices_router.lookup_ares_company
    invoices_router.lookup_ares_company = lambda ico, provider=None: AresCompanyLookupResponse(
        ico=ico,
        dic="CZ12345678",
        company_name="Testovací firma s.r.o.",
        address_line="Testovací 10",
        city="Praha",
        zip="11000",
        country="Česká republika",
        data_box="abcd123",
        source="ares",
    )
    try:
        response = client.get("/api/admin/invoices/ares/12345679")
    finally:
        invoices_router.lookup_ares_company = original_lookup

    assert response.status_code == 200
    assert response.json() == {
        "ico": "12345679",
        "dic": "CZ12345678",
        "company_name": "Testovací firma s.r.o.",
        "address_line": "Testovací 10",
        "city": "Praha",
        "zip": "11000",
        "country": "Česká republika",
        "data_box": "abcd123",
        "source": "ares",
    }


def test_lookup_ares_odmitne_neplatne_ico() -> None:
    _login_admin()

    response = client.get("/api/admin/invoices/ares/123")

    assert response.status_code == 400
    assert response.json() == {"detail": "IČO musí obsahovat přesně 8 číslic."}


def test_lookup_ares_vrati_404_kdyz_firma_neexistuje() -> None:
    _login_admin()

    from backend.app.modules.invoices import router as invoices_router

    original_lookup = invoices_router.lookup_ares_company

    def raise_not_found(_ico: str, provider=None):
        raise AresCompanyNotFoundError("Firma nebyla v registru ARES nalezena.")

    invoices_router.lookup_ares_company = raise_not_found
    try:
        response = client.get("/api/admin/invoices/ares/12345679")
    finally:
        invoices_router.lookup_ares_company = original_lookup

    assert response.status_code == 404
    assert response.json() == {"detail": "Firma nebyla v registru ARES nalezena."}


def test_search_ares_podle_nazvu_vrati_vysledky() -> None:
    _login_admin()

    from backend.app.modules.invoices import router as invoices_router

    original_search = invoices_router.search_ares_companies
    invoices_router.search_ares_companies = lambda _name, provider=None: [
        AresCompanyLookupResponse(
            ico="00177041",
            dic="CZ00177041",
            company_name="Škoda Auto a.s.",
            address_line="tř. Václava Klementa 869",
            city="Mladá Boleslav",
            zip="29301",
            country="Česká republika",
            data_box="67wchuf",
            source="ares",
        ),
        AresCompanyLookupResponse(
            ico="46900733",
            dic="CZ46900733",
            company_name="ČEZ, a. s.",
            address_line="Duhová 1444/2",
            city="Praha",
            zip="14053",
            country="Česká republika",
            data_box="yqkcds6",
            source="ares",
        ),
    ]
    try:
        response = client.get("/api/admin/invoices/ares/search?name=sk")
    finally:
        invoices_router.search_ares_companies = original_search

    assert response.status_code == 200
    assert response.headers["X-Ares-Provider"] == "real"
    assert response.json()[0]["company_name"] == "Škoda Auto a.s."
    assert response.json()[1]["company_name"] == "ČEZ, a. s."


def test_search_ares_odmitne_prazdny_dotaz() -> None:
    _login_admin()

    response = client.get("/api/admin/invoices/ares/search?name=")

    assert response.status_code == 400
    assert response.json() == {"detail": "Zadejte název firmy."}


def test_search_ares_odmitne_prilis_kratky_dotaz() -> None:
    with pytest.raises(InvalidCompanyNameError):
        ares_service.normalize_company_name("a")


def test_resolver_ares_provideru_rozlisi_real_a_mock(monkeypatch) -> None:
    monkeypatch.setenv("ARES_PROVIDER", "mock")
    resolved_mock = resolve_ares_provider()
    assert isinstance(resolved_mock, ResolvedAresProvider)
    assert resolved_mock.mode == "mock"

    monkeypatch.setenv("ARES_PROVIDER", "real")
    resolved_real = resolve_ares_provider()
    assert isinstance(resolved_real, ResolvedAresProvider)
    assert resolved_real.mode == "real"


def test_mock_search_je_bez_diakritiky() -> None:
    provider = ares_service.MockAresProvider(ares_service.MOCK_ARES_COMPANIES)

    results = provider.search_companies("skoda")

    assert len(results) == 1
    assert results[0].company_name == "Škoda Auto a.s."
    assert results[0].source == "mock_ares"


def test_realny_ares_provider_pouzije_mapovani_vyhledavani() -> None:
    class StubClient:
        def search_companies_payload(self, _name: str):
            return {
                "ekonomickeSubjekty": [
                    {
                        "ico": "00177041",
                        "dic": "CZ00177041",
                        "obchodniJmeno": "Škoda Auto a.s.",
                        "sidlo": {
                            "textovaAdresa": "tř. Václava Klementa 869, 29301 Mladá Boleslav",
                            "nazevObce": "Mladá Boleslav",
                            "psc": "29301",
                            "nazevStatu": "Česká republika",
                        },
                        "idDatoveSchranky": "67wchuf",
                    }
                ]
            }

    provider = ares_service.RealAresProvider(StubClient(), max_results=20)

    results = provider.search_companies("škoda")

    assert len(results) == 1
    assert results[0].company_name == "Škoda Auto a.s."
    assert results[0].source == "ares"
    assert results[0].data_box == "67wchuf"


def test_search_ares_vrati_502_pri_chybe_upstreamu() -> None:
    _login_admin()

    from backend.app.modules.invoices import router as invoices_router

    original_search = invoices_router.search_ares_companies

    def raise_unavailable(_name: str, provider=None):
        raise AresUnavailableError("Služba ARES je dočasně nedostupná.")

    invoices_router.search_ares_companies = raise_unavailable
    try:
        response = client.get("/api/admin/invoices/ares/search?name=skoda")
    finally:
        invoices_router.search_ares_companies = original_search

    assert response.status_code == 502
    assert response.json() == {"detail": "Služba ARES je dočasně nedostupná."}


def test_relace_proformy_a_danoveho_dokladu_jsou_citelne_v_per_invoice_endpointu() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "relations-taxdoc-proforma@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    paid_proforma = _pridej_platbu(proforma["id"], {"amount": 2000, "paid_at": "2099-04-10"})
    payment = paid_proforma["payments"][0]
    tax_document = _vytvor_danovy_doklad_z_platby(proforma["id"], payment["id"])

    proforma_relations = _ziskej_relace_dokladu(proforma["id"])
    tax_document_relations = _ziskej_relace_dokladu(tax_document["id"])

    assert proforma_relations["invoice_id"] == proforma["id"]
    assert len(proforma_relations["outgoing_relations"]) == 1
    outgoing = proforma_relations["outgoing_relations"][0]
    assert outgoing["relation_type"] == RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT
    assert outgoing["source_invoice_id"] == proforma["id"]
    assert outgoing["target_invoice_id"] == tax_document["id"]
    assert outgoing["source_document"]["document_kind"] == "proforma"
    assert outgoing["target_document"]["document_kind"] == "tax_document"
    assert outgoing["source_payment"]["id"] == payment["id"]
    assert outgoing["source_payment"]["amount"] == payment["amount"]

    assert tax_document_relations["invoice_id"] == tax_document["id"]
    assert len(tax_document_relations["incoming_relations"]) == 1
    incoming = tax_document_relations["incoming_relations"][0]
    assert incoming["relation_type"] == RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT
    assert incoming["source_invoice_id"] == proforma["id"]
    assert incoming["target_invoice_id"] == tax_document["id"]
    assert incoming["source_document"]["invoice_number"] == proforma["invoice_number"]
    assert incoming["target_document"]["invoice_number"] == tax_document["invoice_number"]
    assert incoming["source_payment"]["paid_at"] == payment["paid_at"]


def test_relace_proformy_final_invoice_invoice_correction_a_quote_invoice_jsou_citelne() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "relations-final-proforma@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    final_invoice = _vytvor_konecnou_fakturu([proforma["id"]], {"issue_date": "2099-05-01", "due_date": "2099-05-15"})
    invoice = _vytvor_fakturu({"customer_email": "relations-correction-invoice@example.com"})
    correction = _vytvor_opravny_doklad(invoice["id"], {"issue_date": "2099-05-20", "reason": "Storno"})
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "relations-quote@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    converted_invoice = _preved_quote(quote["id"], {"target_document_kind": "invoice", "issue_date": "2099-05-01"})

    proforma_relations = _ziskej_relace_dokladu(proforma["id"])
    final_relations = _ziskej_relace_dokladu(final_invoice["id"])
    invoice_relations = _ziskej_relace_dokladu(invoice["id"])
    correction_relations = _ziskej_relace_dokladu(correction["id"])
    quote_relations = _ziskej_relace_dokladu(quote["id"])
    converted_relations = _ziskej_relace_dokladu(converted_invoice["id"])

    assert proforma_relations["outgoing_relations"][0]["relation_type"] == RELATION_TYPE_FINAL_INVOICE_FOR_PROFORMA
    assert proforma_relations["outgoing_relations"][0]["target_document"]["document_kind"] == "final_invoice"
    assert final_relations["incoming_relations"][0]["relation_type"] == RELATION_TYPE_FINAL_INVOICE_FOR_PROFORMA
    assert final_relations["incoming_relations"][0]["source_document"]["document_kind"] == "proforma"

    assert invoice_relations["outgoing_relations"][0]["relation_type"] == RELATION_TYPE_CORRECTION_FOR_INVOICE
    assert invoice_relations["outgoing_relations"][0]["target_document"]["document_kind"] == "correction"
    assert correction_relations["incoming_relations"][0]["relation_type"] == RELATION_TYPE_CORRECTION_FOR_INVOICE
    assert correction_relations["incoming_relations"][0]["source_document"]["document_kind"] == "invoice"

    assert quote_relations["outgoing_relations"][0]["relation_type"] == RELATION_TYPE_INVOICE_FROM_QUOTE
    assert quote_relations["outgoing_relations"][0]["target_document"]["document_kind"] == "invoice"
    assert converted_relations["incoming_relations"][0]["relation_type"] == RELATION_TYPE_INVOICE_FROM_QUOTE
    assert converted_relations["incoming_relations"][0]["source_document"]["document_kind"] == "quote"


def test_global_relation_endpoint_filtrovani_funguje() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "relations-global-proforma@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    paid_proforma = _pridej_platbu(proforma["id"], {"amount": 2000, "paid_at": "2099-04-10"})
    payment = paid_proforma["payments"][0]
    tax_document = _vytvor_danovy_doklad_z_platby(proforma["id"], payment["id"])
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "relations-global-quote@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    converted_invoice = _preved_quote(quote["id"], {"target_document_kind": "invoice", "issue_date": "2099-05-01"})

    all_relations = _list_relace()
    type_filtered = _list_relace(f"relation_type={RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT}")
    source_filtered = _list_relace(f"source_invoice_id={quote['id']}")
    target_filtered = _list_relace(f"target_invoice_id={converted_invoice['id']}")
    payment_filtered = _list_relace(f"source_payment_id={payment['id']}")

    assert any(
        relation["relation_type"] == RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT
        and relation["target_invoice_id"] == tax_document["id"]
        for relation in all_relations
    )
    assert len(type_filtered) == 1
    assert type_filtered[0]["source_payment"]["id"] == payment["id"]
    assert len(source_filtered) == 1
    assert source_filtered[0]["relation_type"] == RELATION_TYPE_INVOICE_FROM_QUOTE
    assert len(target_filtered) == 1
    assert target_filtered[0]["source_invoice_id"] == quote["id"]
    assert len(payment_filtered) == 1
    assert payment_filtered[0]["target_invoice_id"] == tax_document["id"]


def test_relation_endpoint_vyzaduje_admin_auth_a_missing_invoice_vraci_404() -> None:
    invoice = _vytvor_fakturu({"customer_email": "relations-auth@example.com"})
    anonymous_client = TestClient(app)

    per_invoice_response = anonymous_client.get(f"/api/admin/invoices/{invoice['id']}/relations")
    global_response = anonymous_client.get("/api/admin/invoices/relations")

    _login_admin()
    missing_response = client.get("/api/admin/invoices/999999/relations")

    assert per_invoice_response.status_code == 401
    assert per_invoice_response.json() == {"detail": "Přihlaste se do adminu"}
    assert global_response.status_code == 401
    assert global_response.json() == {"detail": "Přihlaste se do adminu"}
    assert missing_response.status_code == 404
    assert missing_response.json() == {"detail": "Faktura nebyla nalezena."}


def test_relation_endpoint_nepada_kdyz_chybi_target_document_nebo_payment() -> None:
    source_invoice = _vytvor_fakturu({"customer_email": "relations-broken-source@example.com"})

    with SessionLocal() as db:
        db.execute(text("PRAGMA foreign_keys=OFF"))
        try:
            db.execute(
                text(
                    "INSERT INTO invoice_document_relations "
                    "(source_invoice_id, target_invoice_id, source_payment_id, relation_type, created_at) "
                    "VALUES (:source_invoice_id, :target_invoice_id, :source_payment_id, :relation_type, CURRENT_TIMESTAMP)"
                ),
                {
                    "source_invoice_id": source_invoice["id"],
                    "target_invoice_id": 999998,
                    "source_payment_id": 999997,
                    "relation_type": RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT,
                },
            )
            db.commit()
        finally:
            db.execute(text("PRAGMA foreign_keys=ON"))
            db.commit()

    relations = _ziskej_relace_dokladu(source_invoice["id"])

    assert len(relations["outgoing_relations"]) == 1
    relation = relations["outgoing_relations"][0]
    assert relation["target_invoice_id"] == 999998
    assert relation["source_payment_id"] == 999997
    assert relation["source_document"]["id"] == source_invoice["id"]
    assert relation["target_document"] is None
    assert relation["source_payment"] is None


def test_manual_todo_crud_a_filtry_funguji() -> None:
    todo = _vytvor_todo(
        {
            "title": "Prověřit ruční položku",
            "message": "Interní manuální připomínka.",
            "due_date": "2099-06-10",
        }
    )
    _login_admin()

    list_response = client.get("/api/admin/invoices/todos")
    detail_response = client.get(f"/api/admin/invoices/todos/{todo['id']}")
    update_response = client.put(
        f"/api/admin/invoices/todos/{todo['id']}",
        json={
            "title": "Prověřit ruční položku urgentně",
            "message": "Doplněná interní poznámka.",
            "due_date": "2099-06-12",
            "status": "completed",
        },
    )
    completed_filter_response = client.get("/api/admin/invoices/todos?status=completed")
    type_filter_response = client.get("/api/admin/invoices/todos?todo_type=manual")

    assert list_response.status_code == 200
    assert any(item["id"] == todo["id"] for item in list_response.json())
    assert detail_response.status_code == 200
    assert detail_response.json()["title"] == "Prověřit ruční položku"
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["title"] == "Prověřit ruční položku urgentně"
    assert updated["status"] == "completed"
    assert updated["completed_at"] is not None
    assert completed_filter_response.status_code == 200
    assert any(item["id"] == todo["id"] for item in completed_filter_response.json())
    assert type_filter_response.status_code == 200
    assert any(item["id"] == todo["id"] for item in type_filter_response.json())


def test_todo_complete_cancel_a_delete_maji_bezpecne_chovani() -> None:
    open_todo = _vytvor_todo({"title": "Smazatelný todo", "due_date": "2099-06-15"})
    complete_todo = _vytvor_todo({"title": "Dokončit todo", "due_date": "2099-06-16"})
    cancel_todo = _vytvor_todo({"title": "Zrušit todo", "due_date": "2099-06-17"})
    _login_admin()

    complete_response = client.post(f"/api/admin/invoices/todos/{complete_todo['id']}/complete")
    cancel_response = client.post(f"/api/admin/invoices/todos/{cancel_todo['id']}/cancel")
    delete_open_response = client.delete(f"/api/admin/invoices/todos/{open_todo['id']}")
    delete_completed_response = client.delete(f"/api/admin/invoices/todos/{complete_todo['id']}")
    delete_cancelled_response = client.delete(f"/api/admin/invoices/todos/{cancel_todo['id']}")

    assert complete_response.status_code == 200
    assert complete_response.json()["status"] == "completed"
    assert complete_response.json()["completed_at"] is not None
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelled"
    assert cancel_response.json()["completed_at"] is None
    assert delete_open_response.status_code == 200
    assert delete_open_response.json() == {"ok": True, "todo_id": open_todo["id"]}
    assert delete_completed_response.status_code == 400
    assert delete_completed_response.json() == {"detail": "Dokončené nebo zrušené todo nelze smazat."}
    assert delete_cancelled_response.status_code == 400
    assert delete_cancelled_response.json() == {"detail": "Dokončené nebo zrušené todo nelze smazat."}


def test_uplna_uhrada_faktury_automaticky_dokonci_otevrene_todo() -> None:
    invoice = _vytvor_fakturu({"customer_email": "auto-complete-invoice@example.com"})
    other_invoice = _vytvor_fakturu({"customer_email": "auto-complete-other@example.com"})
    todo = _vytvor_todo(
        {
            "invoice_id": invoice["id"],
            "todo_type": "invoice_overdue",
            "title": "Upomínka faktury",
        }
    )
    other_todo = _vytvor_todo(
        {
            "invoice_id": other_invoice["id"],
            "todo_type": "invoice_overdue",
            "title": "Jiná faktura",
        }
    )
    _login_admin()

    partial_response = client.post(
        f"/api/admin/invoices/{invoice['id']}/payments",
        json={
            "amount": 1000,
            "paid_at": "2026-04-10",
            "payment_method": "Bankovní převod",
            "note": "Částečná úhrada",
        },
    )
    assert partial_response.status_code == 200
    partial_todo = client.get(f"/api/admin/invoices/todos/{todo['id']}").json()
    assert partial_todo["status"] == "open"

    full_response = client.post(
        f"/api/admin/invoices/{invoice['id']}/payments",
        json={
            "amount": invoice["total"] - 1000,
            "paid_at": "2026-04-11",
            "payment_method": "Bankovní převod",
            "note": "Doplatek",
        },
    )
    assert full_response.status_code == 200
    completed_todo = client.get(f"/api/admin/invoices/todos/{todo['id']}").json()
    untouched_todo = client.get(f"/api/admin/invoices/todos/{other_todo['id']}").json()

    assert completed_todo["status"] == "completed"
    assert completed_todo["completed_at"] is not None
    assert untouched_todo["status"] == "open"


def test_uplna_uhrada_vydaje_automaticky_dokonci_otevrene_todo() -> None:
    expense = _vytvor_vydaj()
    todo = _vytvor_todo(
        {
            "expense_id": expense["id"],
            "todo_type": "expense_overdue",
            "title": "Upomínka výdaje",
        }
    )
    _login_admin()

    partial_response = client.post(
        f"/api/admin/invoices/expenses/{expense['id']}/payments",
        json={
            "amount": 1000,
            "paid_at": "2026-05-10",
            "payment_method": "Bankovní převod",
            "note": "Částečná úhrada dodavateli",
        },
    )
    assert partial_response.status_code == 200
    partial_todo = client.get(f"/api/admin/invoices/todos/{todo['id']}").json()
    assert partial_todo["status"] == "open"

    full_response = client.post(
        f"/api/admin/invoices/expenses/{expense['id']}/payments",
        json={
            "amount": expense["total"] - 1000,
            "paid_at": "2026-05-11",
            "payment_method": "Bankovní převod",
            "note": "Doplatek",
        },
    )
    assert full_response.status_code == 200
    completed_todo = client.get(f"/api/admin/invoices/todos/{todo['id']}").json()

    assert completed_todo["status"] == "completed"
    assert completed_todo["completed_at"] is not None


def test_generate_todos_vytvori_overdue_invoice_a_proforma_bez_quote_a_bez_duplikatu() -> None:
    today = date.today()
    issue_date = (today - timedelta(days=30)).isoformat()
    due_date = (today - timedelta(days=10)).isoformat()
    invoice = _vytvor_fakturu(
        {
            "customer_email": "todo-overdue-invoice@example.com",
            "issue_date": issue_date,
            "due_date": due_date,
        }
    )
    paid_invoice = _vytvor_fakturu(
        {
            "customer_email": "todo-paid-invoice@example.com",
            "issue_date": issue_date,
            "due_date": due_date,
        }
    )
    _pridej_platbu(
        paid_invoice["id"],
        {"amount": paid_invoice["total"], "paid_at": (today - timedelta(days=5)).isoformat()},
    )
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "todo-quote@example.com",
            "issue_date": issue_date,
            "due_date": due_date,
        }
    )
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "todo-proforma@example.com",
            "issue_date": issue_date,
            "due_date": due_date,
        }
    )

    assert get_document_kind_metadata("proforma").allows_payment_tracking is True

    first_generation = _vygeneruj_toda()
    second_generation = _vygeneruj_toda()

    assert first_generation["generated_count"] >= 2
    assert len(first_generation["generated_ids"]) >= 2
    assert second_generation["generated_count"] == 0
    assert second_generation["skipped_existing_count"] >= 2

    _login_admin()
    invoice_filter_response = client.get(f"/api/admin/invoices/todos?invoice_id={invoice['id']}")
    proforma_filter_response = client.get(f"/api/admin/invoices/todos?invoice_id={proforma['id']}")

    assert invoice_filter_response.status_code == 200
    assert len(invoice_filter_response.json()) == 1
    assert invoice_filter_response.json()[0]["todo_type"] == "invoice_overdue"
    assert proforma_filter_response.status_code == 200
    assert len(proforma_filter_response.json()) == 1
    assert proforma_filter_response.json()[0]["todo_type"] == "invoice_overdue"

    with SessionLocal() as db:
        invoice_todos = db.query(InvoiceTodo).filter(InvoiceTodo.invoice_id == invoice["id"]).all()
        proforma_todos = db.query(InvoiceTodo).filter(InvoiceTodo.invoice_id == proforma["id"]).all()
        paid_invoice_todos = db.query(InvoiceTodo).filter(InvoiceTodo.invoice_id == paid_invoice["id"]).all()
        quote_todos = db.query(InvoiceTodo).filter(InvoiceTodo.invoice_id == quote["id"]).all()

        assert len(invoice_todos) == 1
        assert invoice_todos[0].todo_type == "invoice_overdue"
        assert len(proforma_todos) == 1
        assert proforma_todos[0].todo_type == "invoice_overdue"
        assert paid_invoice_todos == []
        assert quote_todos == []


def test_generate_todos_vytvori_overdue_expense_ale_ne_fully_paid_expense() -> None:
    today = date.today()
    issue_date = (today - timedelta(days=20)).isoformat()
    received_date = (today - timedelta(days=19)).isoformat()
    due_date = (today - timedelta(days=7)).isoformat()
    overdue_expense = _vytvor_vydaj(
        {
            "supplier_email": "todo-expense@example.com",
            "issue_date": issue_date,
            "received_date": received_date,
            "due_date": due_date,
            "taxable_supply_date": issue_date,
        }
    )
    paid_expense = _vytvor_vydaj(
        {
            "supplier_email": "todo-expense-paid@example.com",
            "issue_date": issue_date,
            "received_date": received_date,
            "due_date": due_date,
            "taxable_supply_date": issue_date,
        }
    )
    _pridej_platbu_vydaje(
        paid_expense["id"],
        {"amount": paid_expense["total"], "paid_at": (today - timedelta(days=3)).isoformat()},
    )

    generation = _vygeneruj_toda()

    assert generation["generated_count"] == 1
    assert len(generation["generated_ids"]) == 1

    _login_admin()
    expense_filter_response = client.get(f"/api/admin/invoices/todos?expense_id={overdue_expense['id']}")

    assert expense_filter_response.status_code == 200
    assert len(expense_filter_response.json()) == 1
    assert expense_filter_response.json()[0]["todo_type"] == "expense_overdue"

    with SessionLocal() as db:
        overdue_todos = db.query(InvoiceTodo).filter(InvoiceTodo.expense_id == overdue_expense["id"]).all()
        paid_todos = db.query(InvoiceTodo).filter(InvoiceTodo.expense_id == paid_expense["id"]).all()

        assert len(overdue_todos) == 1
        assert overdue_todos[0].todo_type == "expense_overdue"
        assert paid_todos == []


def test_generate_todos_funguje_i_pro_overdue_expense_se_supplier_id() -> None:
    supplier = _vytvor_dodavatele({"email": "todo-linked-supplier@example.com"})
    today = date.today()
    issue_date = (today - timedelta(days=20)).isoformat()
    received_date = (today - timedelta(days=19)).isoformat()
    due_date = (today - timedelta(days=7)).isoformat()
    overdue_expense = _vytvor_vydaj(
        {
            "supplier_id": supplier["id"],
            "supplier_name": None,
            "supplier_email": None,
            "supplier_phone": None,
            "supplier_address": None,
            "supplier_ico": None,
            "supplier_dic": None,
            "supplier_data_box": None,
            "supplier_country": None,
            "issue_date": issue_date,
            "received_date": received_date,
            "due_date": due_date,
            "taxable_supply_date": issue_date,
        }
    )

    generation = _vygeneruj_toda()

    assert generation["generated_count"] == 1
    _login_admin()
    expense_filter_response = client.get(f"/api/admin/invoices/todos?expense_id={overdue_expense['id']}")
    assert expense_filter_response.status_code == 200
    assert len(expense_filter_response.json()) == 1
    assert expense_filter_response.json()[0]["todo_type"] == "expense_overdue"


def test_preview_upominky_pro_overdue_fakturu_vrati_defaultni_prijemce_predmet_a_text() -> None:
    invoice = _vytvor_fakturu(
        {
            "customer_email": "reminder-preview@example.com",
            "issue_date": "2000-01-01",
            "due_date": "2000-01-15",
        }
    )
    _login_admin()

    response = client.get(f"/api/admin/invoices/{invoice['id']}/reminder-email/preview")

    assert response.status_code == 200
    body = response.json()
    assert body["invoice_id"] == invoice["id"]
    assert body["invoice_number"] == invoice["invoice_number"]
    assert body["todo_id"] is None
    assert body["reminder_type"] == "invoice_overdue"
    assert body["recipient_email"] == "reminder-preview@example.com"
    assert body["subject"] == f"Upomínka po splatnosti: Faktura {invoice['invoice_number']}"
    assert f"doklad {invoice['invoice_number']} je po splatnosti" in body["message"]
    assert "Variabilní symbol" in body["message"]


def test_preview_upominky_odmitne_quote_plne_uhrazenou_a_neexistujici_fakturu() -> None:
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "quote-reminder@example.com",
            "issue_date": "2000-01-01",
            "due_date": "2000-01-15",
        }
    )
    paid_invoice = _vytvor_fakturu(
        {
            "customer_email": "paid-reminder@example.com",
            "issue_date": "2000-02-01",
            "due_date": "2000-02-10",
        }
    )
    _pridej_platbu(paid_invoice["id"], {"amount": paid_invoice["total"], "paid_at": "2000-02-05"})
    _login_admin()

    quote_response = client.get(f"/api/admin/invoices/{quote['id']}/reminder-email/preview")
    paid_response = client.get(f"/api/admin/invoices/{paid_invoice['id']}/reminder-email/preview")
    missing_response = client.get("/api/admin/invoices/999999/reminder-email/preview")

    assert quote_response.status_code == 400
    assert quote_response.json() == {"detail": "Cenové nabídce nelze odeslat platební upomínku."}
    assert paid_response.status_code == 400
    assert paid_response.json() == {"detail": "Doklad nemá žádný zbývající nedoplatek."}
    assert missing_response.status_code == 404
    assert missing_response.json() == {"detail": "Faktura nebyla nalezena."}


def test_odeslani_upominky_ulozi_sent_log_a_prilozi_pdf() -> None:
    _login_admin()
    settings_response = client.put(
        "/api/admin/invoices/settings",
        json={
            "owner_email": "upominky@lakodi.cz",
            "payment_method": "Převodem",
            "bank_account_number": "5997826359",
            "bank_account_prefix": "",
            "bank_code": "0800",
            "bank_iban": "CZ9108000000005997826359",
        },
    )
    assert settings_response.status_code == 200
    invoice = _vytvor_fakturu(
        {
            "customer_email": "reminder-send@example.com",
            "issue_date": "2000-03-01",
            "due_date": "2000-03-10",
        }
    )

    from backend.app.modules.invoices import email_service as invoice_email_service

    original_is_email_configured = invoice_email_service.is_email_configured
    original_send_html_email = invoice_email_service.send_html_email
    original_build_invoice_pdf_document = invoice_email_service.build_invoice_pdf_document
    captured = {}

    invoice_email_service.is_email_configured = lambda: True
    invoice_email_service.build_invoice_pdf_document = lambda _invoice: InvoicePdfDocument(
        filename=f"{invoice['invoice_number']}.pdf",
        content=b"%PDF-test-reminder",
    )

    def fake_send_html_email(to_email: str, subject: str, html: str, attachments=None, bcc=None, cc=None) -> bool:
        captured["to_email"] = to_email
        captured["subject"] = subject
        captured["html"] = html
        captured["attachments"] = attachments
        captured["bcc"] = bcc
        return True

    invoice_email_service.send_html_email = fake_send_html_email
    try:
        response = client.post(f"/api/admin/invoices/{invoice['id']}/reminder-email/send")
    finally:
        invoice_email_service.is_email_configured = original_is_email_configured
        invoice_email_service.send_html_email = original_send_html_email
        invoice_email_service.build_invoice_pdf_document = original_build_invoice_pdf_document

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["invoice_id"] == invoice["id"]
    assert body["invoice_number"] == invoice["invoice_number"]
    assert body["todo_id"] is None
    assert body["reminder_type"] == "invoice_overdue"
    assert body["sent_to"] == "reminder-send@example.com"
    assert body["copied_to"] == ["upominky@lakodi.cz"]
    assert body["status"] == "sent"
    assert captured["to_email"] == "reminder-send@example.com"
    assert captured["subject"] == f"Upomínka po splatnosti: Faktura {invoice['invoice_number']}"
    assert invoice["invoice_number"] in captured["html"]
    assert "Zbývá uhradit" in captured["html"]
    assert captured["bcc"] == ["upominky@lakodi.cz"]
    attachments = captured["attachments"]
    assert attachments is not None
    assert len(attachments) == 1
    assert attachments[0].filename == f"{invoice['invoice_number']}.pdf"
    assert attachments[0].content == b"%PDF-test-reminder"

    with SessionLocal() as db:
        logs = db.query(InvoiceReminderEmail).filter(InvoiceReminderEmail.invoice_id == invoice["id"]).all()
        assert len(logs) == 1
        assert logs[0].status == "sent"
        assert logs[0].recipient_email == "reminder-send@example.com"
        assert logs[0].todo_id is None
        assert logs[0].sent_at is not None
        assert logs[0].error_message is None


def test_odeslani_upominky_s_explicitnim_emailom_a_todo_id_navaze_log() -> None:
    invoice = _vytvor_fakturu(
        {
            "customer_email": "original-reminder@example.com",
            "issue_date": "2000-04-01",
            "due_date": "2000-04-12",
        }
    )
    todo = _vytvor_todo(
        {
            "invoice_id": invoice["id"],
            "todo_type": "invoice_overdue",
            "title": f"Upomínka k faktuře {invoice['invoice_number']}",
            "due_date": "2000-04-12",
        }
    )

    from backend.app.modules.invoices import email_service as invoice_email_service

    original_is_email_configured = invoice_email_service.is_email_configured
    original_send_html_email = invoice_email_service.send_html_email
    original_build_invoice_pdf_document = invoice_email_service.build_invoice_pdf_document

    invoice_email_service.is_email_configured = lambda: True
    invoice_email_service.build_invoice_pdf_document = lambda _invoice: InvoicePdfDocument(
        filename=f"{invoice['invoice_number']}.pdf",
        content=b"%PDF-test-reminder-explicit",
    )
    invoice_email_service.send_html_email = lambda *args, **kwargs: True
    try:
        response = client.post(
            f"/api/admin/invoices/{invoice['id']}/reminder-email/send",
            json={
                "to_email": "explicit-reminder@example.com",
                "todo_id": todo["id"],
            },
        )
    finally:
        invoice_email_service.is_email_configured = original_is_email_configured
        invoice_email_service.send_html_email = original_send_html_email
        invoice_email_service.build_invoice_pdf_document = original_build_invoice_pdf_document

    assert response.status_code == 200
    body = response.json()
    assert body["sent_to"] == "explicit-reminder@example.com"
    assert body["todo_id"] == todo["id"]
    assert body["reminder_type"] == "invoice_overdue"

    with SessionLocal() as db:
        log = (
            db.query(InvoiceReminderEmail)
            .filter(InvoiceReminderEmail.invoice_id == invoice["id"], InvoiceReminderEmail.todo_id == todo["id"])
            .one()
        )
        assert log.recipient_email == "explicit-reminder@example.com"
        assert log.status == "sent"


def test_odeslani_upominky_odmitne_chybejici_prijemce_todo_z_jine_faktury_a_dokoncene_todo() -> None:
    invoice = _vytvor_fakturu(
        {
            "customer_email": "valid-reminder@example.com",
            "issue_date": "2000-05-01",
            "due_date": "2000-05-10",
        }
    )
    other_invoice = _vytvor_fakturu(
        {
            "customer_email": "other-reminder@example.com",
            "issue_date": "2000-05-02",
            "due_date": "2000-05-11",
        }
    )
    foreign_todo = _vytvor_todo(
        {
            "invoice_id": other_invoice["id"],
            "todo_type": "invoice_overdue",
            "title": "Cizí upomínka",
            "due_date": "2000-05-11",
        }
    )
    own_todo = _vytvor_todo(
        {
            "invoice_id": invoice["id"],
            "todo_type": "invoice_overdue",
            "title": "Dokončená upomínka",
            "due_date": "2000-05-10",
        }
    )
    _login_admin()
    complete_response = client.post(f"/api/admin/invoices/todos/{own_todo['id']}/complete")
    assert complete_response.status_code == 200

    with SessionLocal() as db:
        invoice_row = db.execute(
            text("UPDATE invoices SET customer_email = '' WHERE id = :invoice_id"),
            {"invoice_id": invoice["id"]},
        )
        db.commit()
        assert invoice_row is not None

    missing_recipient_response = client.post(f"/api/admin/invoices/{invoice['id']}/reminder-email/send")
    foreign_todo_response = client.post(
        f"/api/admin/invoices/{invoice['id']}/reminder-email/send",
        json={"to_email": "manual@example.com", "todo_id": foreign_todo["id"]},
    )
    completed_todo_response = client.post(
        f"/api/admin/invoices/{invoice['id']}/reminder-email/send",
        json={"to_email": "manual@example.com", "todo_id": own_todo["id"]},
    )

    assert missing_recipient_response.status_code == 400
    assert missing_recipient_response.json() == {"detail": "Chybí e-mailová adresa příjemce upomínky."}
    assert foreign_todo_response.status_code == 400
    assert foreign_todo_response.json() == {"detail": "Todo nepatří k této faktuře."}
    assert completed_todo_response.status_code == 400
    assert completed_todo_response.json() == {"detail": "Dokončené nebo zrušené todo nelze použít pro odeslání upomínky."}


def test_selhani_odeslani_upominky_ulozi_failed_log_a_list_endpoint_jej_vrati() -> None:
    invoice = _vytvor_fakturu(
        {
            "customer_email": "failed-reminder@example.com",
            "issue_date": "2000-06-01",
            "due_date": "2000-06-10",
        }
    )

    from backend.app.modules.invoices import email_service as invoice_email_service

    original_is_email_configured = invoice_email_service.is_email_configured
    original_send_html_email = invoice_email_service.send_html_email
    original_build_invoice_pdf_document = invoice_email_service.build_invoice_pdf_document

    invoice_email_service.is_email_configured = lambda: True
    invoice_email_service.build_invoice_pdf_document = lambda _invoice: InvoicePdfDocument(
        filename=f"{invoice['invoice_number']}.pdf",
        content=b"%PDF-test-reminder-failed",
    )
    invoice_email_service.send_html_email = lambda *args, **kwargs: False
    try:
        response = client.post(f"/api/admin/invoices/{invoice['id']}/reminder-email/send")
    finally:
        invoice_email_service.is_email_configured = original_is_email_configured
        invoice_email_service.send_html_email = original_send_html_email
        invoice_email_service.build_invoice_pdf_document = original_build_invoice_pdf_document

    assert response.status_code == 502
    assert response.json() == {"detail": "Upomínku se nepodařilo odeslat e-mailem."}

    _login_admin()
    list_response = client.get(f"/api/admin/invoices/{invoice['id']}/reminder-emails")

    assert list_response.status_code == 200
    logs = list_response.json()
    assert len(logs) == 1
    assert logs[0]["invoice_id"] == invoice["id"]
    assert logs[0]["recipient_email"] == "failed-reminder@example.com"
    assert logs[0]["status"] == "failed"
    assert logs[0]["reminder_type"] == "invoice_overdue"
    assert logs[0]["sent_at"] is None
    assert logs[0]["error_message"] == "Upomínku se nepodařilo odeslat e-mailem."

    with SessionLocal() as db:
        log = db.query(InvoiceReminderEmail).filter(InvoiceReminderEmail.invoice_id == invoice["id"]).one()
        assert log.status == "failed"
        assert log.error_message == "Upomínku se nepodařilo odeslat e-mailem."


def test_nahrani_nepropojene_prilohy_inbox_list_detail_a_path_traversal_funguji(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _nastav_storage_priloh(monkeypatch, tmp_path)
    _login_admin()

    upload_response = client.post(
        "/api/admin/invoices/attachments",
        files={"file": ("..\\..\\evil.pdf", b"hello attachment", "application/pdf")},
        data={"attachment_type": "other", "note": "Inbox soubor"},
    )

    assert upload_response.status_code == 200
    attachment = upload_response.json()
    assert attachment["invoice_id"] is None
    assert attachment["expense_id"] is None
    assert attachment["todo_id"] is None
    assert attachment["bank_transaction_id"] is None
    assert attachment["attachment_type"] == "other"
    assert attachment["status"] == "uploaded"
    assert attachment["original_filename"] == "evil.pdf"
    assert attachment["content_type"] == "application/pdf"
    assert attachment["size_bytes"] == len(b"hello attachment")
    assert attachment["checksum_sha256"]

    _login_admin()
    list_response = client.get("/api/admin/invoices/attachments")
    unlinked_response = client.get("/api/admin/invoices/attachments?unlinked_only=true")
    detail_response = client.get(f"/api/admin/invoices/attachments/{attachment['id']}")

    assert list_response.status_code == 200
    assert any(item["id"] == attachment["id"] for item in list_response.json())
    assert unlinked_response.status_code == 200
    assert any(item["id"] == attachment["id"] for item in unlinked_response.json())
    assert detail_response.status_code == 200
    assert detail_response.json()["id"] == attachment["id"]

    with SessionLocal() as db:
        stored = db.query(InvoiceAttachment).filter(InvoiceAttachment.id == attachment["id"]).one()
        assert ".." not in stored.stored_filename
        assert "/" not in stored.stored_filename
        assert "\\" not in stored.stored_filename
        assert (attachment_storage.STORAGE_DIR / stored.stored_filename).exists()


def test_nahrani_prazdne_prilohy_je_odmitnuto(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    _nastav_storage_priloh(monkeypatch, tmp_path)
    _login_admin()

    response = client.post(
        "/api/admin/invoices/attachments",
        files={"file": ("empty.txt", b"", "text/plain")},
        data={"attachment_type": "other"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Prázdný soubor nelze nahrát."}


def test_navazani_prilohy_na_invoice_expense_todo_a_bank_transakci_funguje(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _nastav_storage_priloh(monkeypatch, tmp_path)
    invoice = _vytvor_fakturu()
    expense = _vytvor_vydaj()
    todo = _vytvor_todo({"invoice_id": invoice["id"], "todo_type": "invoice_overdue", "title": "Link todo"})
    imported = _importuj_bankovni_transakce(
        [
            {
                "external_id": "attach-bank-1",
                "transaction_date": "2099-06-01",
                "amount": 1500,
                "currency": "CZK",
                "direction": "incoming",
                "variable_symbol": invoice["variable_symbol"],
            }
        ]
    )
    transaction_id = imported["imported_transaction_ids"][0]
    _login_admin()
    upload_response = client.post(
        "/api/admin/invoices/attachments",
        files={"file": ("link.pdf", b"attachment for linking", "application/pdf")},
        data={"attachment_type": "invoice_document"},
    )
    attachment_id = upload_response.json()["id"]

    invoice_link_response = client.post(
        f"/api/admin/invoices/attachments/{attachment_id}/link",
        json={"invoice_id": invoice["id"]},
    )
    expense_link_response = client.post(
        f"/api/admin/invoices/attachments/{attachment_id}/link",
        json={"expense_id": expense["id"]},
    )
    todo_link_response = client.post(
        f"/api/admin/invoices/attachments/{attachment_id}/link",
        json={"todo_id": todo["id"]},
    )
    bank_link_response = client.post(
        f"/api/admin/invoices/attachments/{attachment_id}/link",
        json={"bank_transaction_id": transaction_id},
    )

    assert invoice_link_response.status_code == 200
    assert invoice_link_response.json()["invoice_id"] == invoice["id"]
    assert invoice_link_response.json()["status"] == "linked"
    assert expense_link_response.status_code == 200
    assert expense_link_response.json()["expense_id"] == expense["id"]
    assert todo_link_response.status_code == 200
    assert todo_link_response.json()["todo_id"] == todo["id"]
    assert bank_link_response.status_code == 200
    assert bank_link_response.json()["bank_transaction_id"] == transaction_id


def test_navazani_prilohy_na_neexistujici_cil_vrati_jasnou_chybu(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _nastav_storage_priloh(monkeypatch, tmp_path)
    _login_admin()
    upload_response = client.post(
        "/api/admin/invoices/attachments",
        files={"file": ("missing-target.pdf", b"attachment", "application/pdf")},
        data={"attachment_type": "other"},
    )
    attachment_id = upload_response.json()["id"]

    response = client.post(
        f"/api/admin/invoices/attachments/{attachment_id}/link",
        json={"invoice_id": 999999},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Navázaná faktura nebyla nalezena."}


def test_download_archive_a_delete_prilohy_funguji(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    _nastav_storage_priloh(monkeypatch, tmp_path)
    _login_admin()
    upload_response = client.post(
        "/api/admin/invoices/attachments",
        files={"file": ("download.txt", b"download me", "text/plain")},
        data={"attachment_type": "other"},
    )
    attachment_id = upload_response.json()["id"]

    download_response = client.get(f"/api/admin/invoices/attachments/{attachment_id}/download")
    archive_response = client.post(f"/api/admin/invoices/attachments/{attachment_id}/archive")
    list_archived_response = client.get("/api/admin/invoices/attachments?status=archived")

    assert download_response.status_code == 200
    assert download_response.content == b"download me"
    assert "download.txt" in download_response.headers["content-disposition"]
    assert archive_response.status_code == 200
    assert archive_response.json() == {"ok": True, "attachment_id": attachment_id, "status": "archived"}
    assert list_archived_response.status_code == 200
    assert any(item["id"] == attachment_id and item["status"] == "archived" for item in list_archived_response.json())

    with SessionLocal() as db:
        stored_filename = db.query(InvoiceAttachment).filter(InvoiceAttachment.id == attachment_id).one().stored_filename
        assert (attachment_storage.STORAGE_DIR / stored_filename).exists()

    delete_response = client.delete(f"/api/admin/invoices/attachments/{attachment_id}")

    assert delete_response.status_code == 200
    assert delete_response.json() == {"ok": True, "attachment_id": attachment_id}

    with SessionLocal() as db:
        assert db.query(InvoiceAttachment).filter(InvoiceAttachment.id == attachment_id).first() is None
    assert list(attachment_storage.STORAGE_DIR.iterdir()) == []


def test_outgoing_csv_export_vyzaduje_admin_auth() -> None:
    anonymous_client = TestClient(app)

    response = anonymous_client.get("/api/admin/invoices/exports/outgoing.csv")

    assert response.status_code == 401
    assert response.json() == {"detail": "Přihlaste se do adminu"}


def test_outgoing_csv_export_obsahuje_hlavicku_data_a_filtry() -> None:
    invoice = _vytvor_fakturu(
        {
            "customer_email": "outgoing-export-invoice@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    _pridej_platbu(invoice["id"], {"amount": 2000, "paid_at": "2099-04-10"})
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_name": "Quote Export",
            "customer_email": "quote-export@example.com",
            "issue_date": "2099-04-05",
            "due_date": "2099-04-19",
        }
    )
    _login_admin()

    response = client.get("/api/admin/invoices/exports/outgoing.csv")
    quote_filter_response = client.get("/api/admin/invoices/exports/outgoing.csv?document_kind=quote&customer_query=quote-export")
    status_filter_response = client.get("/api/admin/invoices/exports/outgoing.csv?status=partially_paid")
    date_filter_response = client.get("/api/admin/invoices/exports/outgoing.csv?date_from=2099-04-05&date_to=2099-04-05")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert 'lakodi_outgoing_documents.csv' in response.headers["content-disposition"]
    rows = _parse_csv_export(response.text)
    assert rows
    assert set(rows[0].keys()) == {
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
    }
    invoice_row = next(row for row in rows if row["id"] == str(invoice["id"]))
    quote_row = next(row for row in rows if row["id"] == str(quote["id"]))
    assert invoice_row["document_kind"] == "invoice"
    assert invoice_row["payment_status"] == "partially_paid"
    assert invoice_row["total_paid"] == "2000.00"
    assert quote_row["document_kind"] == "quote"
    assert quote_row["payment_status"] == "not_payable"

    quote_rows = _parse_csv_export(quote_filter_response.text)
    assert quote_filter_response.status_code == 200
    assert len(quote_rows) == 1
    assert quote_rows[0]["id"] == str(quote["id"])

    status_rows = _parse_csv_export(status_filter_response.text)
    assert status_filter_response.status_code == 200
    assert len(status_rows) == 1
    assert status_rows[0]["id"] == str(invoice["id"])

    date_rows = _parse_csv_export(date_filter_response.text)
    assert date_filter_response.status_code == 200
    assert len(date_rows) == 1
    assert date_rows[0]["id"] == str(quote["id"])


def test_expenses_csv_export_vyzaduje_admin_auth() -> None:
    anonymous_client = TestClient(app)

    response = anonymous_client.get("/api/admin/invoices/exports/expenses.csv")

    assert response.status_code == 401
    assert response.json() == {"detail": "Přihlaste se do adminu"}


def test_expenses_csv_export_obsahuje_hlavicku_data_a_filtry() -> None:
    expense = _vytvor_vydaj(
        {
            "supplier_name": "Export Supplier",
            "supplier_email": "expense-export@example.com",
            "issue_date": "2099-05-01",
            "received_date": "2099-05-02",
            "due_date": "2099-05-16",
            "taxable_supply_date": "2099-05-01",
        }
    )
    _pridej_platbu_vydaje(expense["id"], {"amount": 1000, "paid_at": "2099-05-10"})
    _login_admin()

    response = client.get("/api/admin/invoices/exports/expenses.csv")
    supplier_filter_response = client.get("/api/admin/invoices/exports/expenses.csv?supplier_query=export supplier")
    status_filter_response = client.get("/api/admin/invoices/exports/expenses.csv?status=partially_paid")
    date_filter_response = client.get("/api/admin/invoices/exports/expenses.csv?date_from=2099-05-01&date_to=2099-05-01")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert 'lakodi_expenses.csv' in response.headers["content-disposition"]
    rows = _parse_csv_export(response.text)
    assert rows
    assert set(rows[0].keys()) == {
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
    }
    expense_row = next(row for row in rows if row["id"] == str(expense["id"]))
    assert expense_row["supplier_name"] == "Export Supplier"
    assert expense_row["payment_status"] == "partially_paid"
    assert expense_row["status"] == "partially_paid"
    assert expense_row["total_paid"] == "1000.00"

    supplier_rows = _parse_csv_export(supplier_filter_response.text)
    assert supplier_filter_response.status_code == 200
    assert len(supplier_rows) == 1
    assert supplier_rows[0]["id"] == str(expense["id"])

    status_rows = _parse_csv_export(status_filter_response.text)
    assert status_filter_response.status_code == 200
    assert len(status_rows) == 1
    assert status_rows[0]["id"] == str(expense["id"])

    date_rows = _parse_csv_export(date_filter_response.text)
    assert date_filter_response.status_code == 200
    assert len(date_rows) == 1
    assert date_rows[0]["id"] == str(expense["id"])


def test_expenses_csv_export_pouziva_snapshot_i_pro_supplier_registry() -> None:
    supplier = _vytvor_dodavatele(
        {
            "name": "Snapshot Supplier",
            "email": "snapshot-supplier@example.com",
            "address": "Snapshot 1",
        }
    )
    expense = _vytvor_vydaj(
        {
            "supplier_id": supplier["id"],
            "supplier_name": None,
            "supplier_email": None,
            "supplier_phone": None,
            "supplier_address": None,
            "supplier_ico": None,
            "supplier_dic": None,
            "supplier_data_box": None,
            "supplier_country": None,
        }
    )
    _login_admin()
    update_supplier_response = client.put(
        f"/api/admin/invoices/suppliers/{supplier['id']}",
        json={
            "name": "Snapshot Supplier Updated",
            "email": "snapshot-supplier-updated@example.com",
            "phone": "+420111000999",
            "address": "Updated Snapshot 2",
            "ico": "12121212",
            "dic": "CZ12121212",
            "data_box": "snapshot-updated",
            "country": "Polsko",
            "note": "Updated after expense",
        },
    )
    assert update_supplier_response.status_code == 200

    response = client.get("/api/admin/invoices/exports/expenses.csv?supplier_query=snapshot supplier")

    assert response.status_code == 200
    rows = _parse_csv_export(response.text)
    assert len(rows) == 1
    assert rows[0]["id"] == str(expense["id"])
    assert rows[0]["supplier_name"] == "Snapshot Supplier"
    assert rows[0]["supplier_email"] == "snapshot-supplier@example.com"


def test_outgoing_xlsx_export_vrati_sešit() -> None:
    openpyxl = pytest.importorskip("openpyxl")
    invoice = _vytvor_fakturu({"customer_email": "xlsx-outgoing@example.com"})
    _login_admin()

    response = client.get("/api/admin/invoices/exports/outgoing.xlsx")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert 'lakodi_outgoing_documents.xlsx' in response.headers["content-disposition"]
    workbook = openpyxl.load_workbook(BytesIO(response.content))
    sheet = workbook.active
    assert sheet.max_row >= 2
    assert sheet["A1"].value == "id"
    assert any(str(row[0]) == str(invoice["id"]) for row in sheet.iter_rows(min_row=2, values_only=True))


def test_expenses_xlsx_export_vrati_sešit() -> None:
    openpyxl = pytest.importorskip("openpyxl")
    expense = _vytvor_vydaj({"supplier_email": "xlsx-expense@example.com"})
    _login_admin()

    response = client.get("/api/admin/invoices/exports/expenses.xlsx")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert 'lakodi_expenses.xlsx' in response.headers["content-disposition"]
    workbook = openpyxl.load_workbook(BytesIO(response.content))
    sheet = workbook.active
    assert sheet.max_row >= 2
    assert sheet["A1"].value == "id"
    assert any(str(row[0]) == str(expense["id"]) for row in sheet.iter_rows(min_row=2, values_only=True))


def test_realny_provider_nevraci_tise_prazdny_seznam_pri_spatnem_tvaru_odpovedi() -> None:
    class InvalidPayloadClient:
        def search_companies_payload(self, _name: str):
            return {"neocekavanyKlic": []}

    provider = ares_service.RealAresProvider(InvalidPayloadClient(), max_results=20)

    with pytest.raises(AresUnavailableError) as exc_info:
        provider.search_companies("skoda")

    assert str(exc_info.value) == "ARES nevrátil seznam nalezených firem."


def test_pdf_endpoint_vrati_pdf_soubor() -> None:
    invoice = _vytvor_fakturu()

    response = client.get(f"/api/admin/invoices/{invoice['id']}/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert f'{invoice["invoice_number"]}.pdf' in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


def test_pdf_endpoint_funguje_i_pro_proformu() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "proforma-pdf@example.com",
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
        }
    )

    response = client.get(f"/api/admin/invoices/{proforma['id']}/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert f'{proforma["invoice_number"]}.pdf' in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


def test_pdf_endpoint_funguje_i_pro_tax_document() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "taxdoc-pdf-proforma@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    paid_proforma = _pridej_platbu(proforma["id"], {"amount": 2000, "paid_at": "2099-04-10"})
    payment_id = paid_proforma["payments"][0]["id"]
    tax_document = _vytvor_danovy_doklad_z_platby(proforma["id"], payment_id)

    response = client.get(f"/api/admin/invoices/{tax_document['id']}/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert f'{tax_document["invoice_number"]}.pdf' in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


def test_pdf_endpoint_funguje_i_pro_final_invoice() -> None:
    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "final-pdf@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    final_invoice = _vytvor_konecnou_fakturu([proforma["id"]], {"issue_date": "2099-05-01", "due_date": "2099-05-15"})

    response = client.get(f"/api/admin/invoices/{final_invoice['id']}/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert f'{final_invoice["invoice_number"]}.pdf' in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


def test_pdf_endpoint_funguje_i_pro_correction() -> None:
    invoice = _vytvor_fakturu({"customer_email": "correction-pdf@example.com"})
    correction = _vytvor_opravny_doklad(invoice["id"], {"issue_date": "2099-05-05"})

    response = client.get(f"/api/admin/invoices/{correction['id']}/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert f'{correction["invoice_number"]}.pdf' in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


def test_pdf_endpoint_funguje_i_pro_quote() -> None:
    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "quote-pdf@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )

    response = client.get(f"/api/admin/invoices/{quote['id']}/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert f'{quote["invoice_number"]}.pdf' in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


def test_odeslani_faktury_e_mailem_prilozi_pdf() -> None:
    _login_admin()
    settings_response = client.put(
        "/api/admin/invoices/settings",
        json={
            "owner_email": "kopie@lakodi.cz",
            "payment_method": "Převodem",
            "bank_account_number": "5997826359",
            "bank_account_prefix": "",
            "bank_code": "0800",
            "bank_iban": "CZ9108000000005997826359",
        },
    )
    assert settings_response.status_code == 200

    invoice = _vytvor_fakturu()

    from backend.app.modules.invoices import email_service as invoice_email_service

    original_is_email_configured = invoice_email_service.is_email_configured
    original_send_html_email = invoice_email_service.send_html_email
    original_build_invoice_pdf_document = invoice_email_service.build_invoice_pdf_document
    captured = {}

    invoice_email_service.is_email_configured = lambda: True
    invoice_email_service.build_invoice_pdf_document = lambda _invoice: InvoicePdfDocument(
        filename=f"{invoice['invoice_number']}.pdf",
        content=b"%PDF-test-payload",
    )

    def fake_send_html_email(to_email: str, subject: str, html: str, attachments=None, bcc=None, cc=None) -> bool:
        captured["to_email"] = to_email
        captured["subject"] = subject
        captured["html"] = html
        captured["attachments"] = attachments
        captured["bcc"] = bcc
        return True

    invoice_email_service.send_html_email = fake_send_html_email
    try:
        response = client.post(f"/api/admin/invoices/{invoice['id']}/send-email")
    finally:
        invoice_email_service.is_email_configured = original_is_email_configured
        invoice_email_service.send_html_email = original_send_html_email
        invoice_email_service.build_invoice_pdf_document = original_build_invoice_pdf_document

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "invoice_id": invoice["id"],
        "invoice_number": invoice["invoice_number"],
        "sent_to": "jan@example.com",
        "copied_to": ["kopie@lakodi.cz"],
    }
    assert captured["to_email"] == "jan@example.com"
    assert captured["subject"] == f"Faktura {invoice['invoice_number']}"
    assert "Jan Novák" in captured["html"]
    assert "Praha 10" in captured["html"]
    assert "Jaurisova 515/4, Michle, 140 00 Praha" in captured["html"]
    assert "5997826359/0800" in captured["html"]
    assert "001" in captured["html"]
    assert captured["bcc"] == ["kopie@lakodi.cz"]
    attachments = captured["attachments"]
    assert attachments is not None
    assert len(attachments) == 1
    assert attachments[0].filename == f"{invoice['invoice_number']}.pdf"
    assert attachments[0].content_type == "application/pdf"
    assert attachments[0].content == b"%PDF-test-payload"


def test_odeslani_proformy_e_mailem_prilozi_pdf() -> None:
    _login_admin()
    settings_response = client.put(
        "/api/admin/invoices/settings",
        json={
            "owner_email": "kopie@lakodi.cz",
            "payment_method": "Převodem",
            "bank_account_number": "5997826359",
            "bank_account_prefix": "",
            "bank_code": "0800",
            "bank_iban": "CZ9108000000005997826359",
        },
    )
    assert settings_response.status_code == 200

    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "proforma-mail@example.com",
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
        }
    )

    from backend.app.modules.invoices import email_service as invoice_email_service

    original_is_email_configured = invoice_email_service.is_email_configured
    original_send_html_email = invoice_email_service.send_html_email
    original_build_invoice_pdf_document = invoice_email_service.build_invoice_pdf_document
    captured = {}

    invoice_email_service.is_email_configured = lambda: True
    invoice_email_service.build_invoice_pdf_document = lambda _invoice: InvoicePdfDocument(
        filename=f"{proforma['invoice_number']}.pdf",
        content=b"%PDF-test-proforma",
    )

    def fake_send_html_email(to_email: str, subject: str, html: str, attachments=None, bcc=None, cc=None) -> bool:
        captured["to_email"] = to_email
        captured["subject"] = subject
        captured["html"] = html
        captured["attachments"] = attachments
        captured["bcc"] = bcc
        return True

    invoice_email_service.send_html_email = fake_send_html_email
    try:
        response = client.post(f"/api/admin/invoices/{proforma['id']}/send-email")
    finally:
        invoice_email_service.is_email_configured = original_is_email_configured
        invoice_email_service.send_html_email = original_send_html_email
        invoice_email_service.build_invoice_pdf_document = original_build_invoice_pdf_document

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "invoice_id": proforma["id"],
        "invoice_number": proforma["invoice_number"],
        "sent_to": "proforma-mail@example.com",
        "copied_to": ["kopie@lakodi.cz"],
    }
    assert captured["to_email"] == "proforma-mail@example.com"
    assert captured["subject"] == f"Faktura {proforma['invoice_number']}"
    assert "Jan Novák" in captured["html"]
    assert "Praha 10" in captured["html"]
    attachments = captured["attachments"]
    assert attachments is not None
    assert len(attachments) == 1
    assert attachments[0].filename == f"{proforma['invoice_number']}.pdf"
    assert attachments[0].content_type == "application/pdf"
    assert attachments[0].content == b"%PDF-test-proforma"


def test_odeslani_danoveho_dokladu_e_mailem_prilozi_pdf() -> None:
    _login_admin()
    settings_response = client.put(
        "/api/admin/invoices/settings",
        json={
            "owner_email": "kopie@lakodi.cz",
            "payment_method": "Převodem",
            "bank_account_number": "5997826359",
            "bank_account_prefix": "",
            "bank_code": "0800",
            "bank_iban": "CZ9108000000005997826359",
        },
    )
    assert settings_response.status_code == 200

    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "taxdoc-mail-proforma@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    paid_proforma = _pridej_platbu(proforma["id"], {"amount": 2000, "paid_at": "2099-04-10"})
    payment_id = paid_proforma["payments"][0]["id"]
    tax_document = _vytvor_danovy_doklad_z_platby(proforma["id"], payment_id)

    from backend.app.modules.invoices import email_service as invoice_email_service

    original_is_email_configured = invoice_email_service.is_email_configured
    original_send_html_email = invoice_email_service.send_html_email
    original_build_invoice_pdf_document = invoice_email_service.build_invoice_pdf_document
    captured = {}

    invoice_email_service.is_email_configured = lambda: True
    invoice_email_service.build_invoice_pdf_document = lambda _invoice: InvoicePdfDocument(
        filename=f"{tax_document['invoice_number']}.pdf",
        content=b"%PDF-test-tax-document",
    )

    def fake_send_html_email(to_email: str, subject: str, html: str, attachments=None, bcc=None, cc=None) -> bool:
        captured["to_email"] = to_email
        captured["subject"] = subject
        captured["html"] = html
        captured["attachments"] = attachments
        captured["bcc"] = bcc
        return True

    invoice_email_service.send_html_email = fake_send_html_email
    try:
        response = client.post(f"/api/admin/invoices/{tax_document['id']}/send-email")
    finally:
        invoice_email_service.is_email_configured = original_is_email_configured
        invoice_email_service.send_html_email = original_send_html_email
        invoice_email_service.build_invoice_pdf_document = original_build_invoice_pdf_document

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "invoice_id": tax_document["id"],
        "invoice_number": tax_document["invoice_number"],
        "sent_to": "taxdoc-mail-proforma@example.com",
        "copied_to": ["kopie@lakodi.cz"],
    }
    assert captured["to_email"] == "taxdoc-mail-proforma@example.com"
    assert captured["subject"] == f"Faktura {tax_document['invoice_number']}"
    assert "Jan Novák" in captured["html"]
    assert tax_document["invoice_number"] in captured["html"]
    attachments = captured["attachments"]
    assert attachments is not None
    assert len(attachments) == 1
    assert attachments[0].filename == f"{tax_document['invoice_number']}.pdf"
    assert attachments[0].content_type == "application/pdf"
    assert attachments[0].content == b"%PDF-test-tax-document"


def test_odeslani_konecne_faktury_e_mailem_prilozi_pdf() -> None:
    _login_admin()
    settings_response = client.put(
        "/api/admin/invoices/settings",
        json={
            "owner_email": "kopie@lakodi.cz",
            "payment_method": "Převodem",
            "bank_account_number": "5997826359",
            "bank_account_prefix": "",
            "bank_code": "0800",
            "bank_iban": "CZ9108000000005997826359",
        },
    )
    assert settings_response.status_code == 200

    proforma = _vytvor_fakturu(
        {
            "document_kind": "proforma",
            "customer_email": "final-mail@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )
    final_invoice = _vytvor_konecnou_fakturu([proforma["id"]], {"issue_date": "2099-05-01", "due_date": "2099-05-15"})

    from backend.app.modules.invoices import email_service as invoice_email_service

    original_is_email_configured = invoice_email_service.is_email_configured
    original_send_html_email = invoice_email_service.send_html_email
    original_build_invoice_pdf_document = invoice_email_service.build_invoice_pdf_document
    captured = {}

    invoice_email_service.is_email_configured = lambda: True
    invoice_email_service.build_invoice_pdf_document = lambda _invoice: InvoicePdfDocument(
        filename=f"{final_invoice['invoice_number']}.pdf",
        content=b"%PDF-test-final-invoice",
    )

    def fake_send_html_email(to_email: str, subject: str, html: str, attachments=None, bcc=None, cc=None) -> bool:
        captured["to_email"] = to_email
        captured["subject"] = subject
        captured["html"] = html
        captured["attachments"] = attachments
        captured["bcc"] = bcc
        return True

    invoice_email_service.send_html_email = fake_send_html_email
    try:
        response = client.post(f"/api/admin/invoices/{final_invoice['id']}/send-email")
    finally:
        invoice_email_service.is_email_configured = original_is_email_configured
        invoice_email_service.send_html_email = original_send_html_email
        invoice_email_service.build_invoice_pdf_document = original_build_invoice_pdf_document

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "invoice_id": final_invoice["id"],
        "invoice_number": final_invoice["invoice_number"],
        "sent_to": "final-mail@example.com",
        "copied_to": ["kopie@lakodi.cz"],
    }
    assert captured["to_email"] == "final-mail@example.com"
    assert captured["subject"] == f"Faktura {final_invoice['invoice_number']}"
    assert "Jan Novák" in captured["html"]
    assert final_invoice["invoice_number"] in captured["html"]
    attachments = captured["attachments"]
    assert attachments is not None
    assert len(attachments) == 1
    assert attachments[0].filename == f"{final_invoice['invoice_number']}.pdf"
    assert attachments[0].content_type == "application/pdf"
    assert attachments[0].content == b"%PDF-test-final-invoice"


def test_odeslani_opravneho_dokladu_e_mailem_prilozi_pdf() -> None:
    _login_admin()
    settings_response = client.put(
        "/api/admin/invoices/settings",
        json={
            "owner_email": "kopie@lakodi.cz",
            "payment_method": "Převodem",
            "bank_account_number": "5997826359",
            "bank_account_prefix": "",
            "bank_code": "0800",
            "bank_iban": "CZ9108000000005997826359",
        },
    )
    assert settings_response.status_code == 200

    invoice = _vytvor_fakturu({"customer_email": "correction-mail@example.com"})
    correction = _vytvor_opravny_doklad(invoice["id"], {"issue_date": "2099-05-05"})

    from backend.app.modules.invoices import email_service as invoice_email_service

    original_is_email_configured = invoice_email_service.is_email_configured
    original_send_html_email = invoice_email_service.send_html_email
    original_build_invoice_pdf_document = invoice_email_service.build_invoice_pdf_document
    captured = {}

    invoice_email_service.is_email_configured = lambda: True
    invoice_email_service.build_invoice_pdf_document = lambda _invoice: InvoicePdfDocument(
        filename=f"{correction['invoice_number']}.pdf",
        content=b"%PDF-test-correction",
    )

    def fake_send_html_email(to_email: str, subject: str, html: str, attachments=None, bcc=None, cc=None) -> bool:
        captured["to_email"] = to_email
        captured["subject"] = subject
        captured["html"] = html
        captured["attachments"] = attachments
        captured["bcc"] = bcc
        return True

    invoice_email_service.send_html_email = fake_send_html_email
    try:
        response = client.post(f"/api/admin/invoices/{correction['id']}/send-email")
    finally:
        invoice_email_service.is_email_configured = original_is_email_configured
        invoice_email_service.send_html_email = original_send_html_email
        invoice_email_service.build_invoice_pdf_document = original_build_invoice_pdf_document

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "invoice_id": correction["id"],
        "invoice_number": correction["invoice_number"],
        "sent_to": "correction-mail@example.com",
        "copied_to": ["kopie@lakodi.cz"],
    }
    assert captured["to_email"] == "correction-mail@example.com"
    assert captured["subject"] == f"Faktura {correction['invoice_number']}"
    assert "Jan Novák" in captured["html"]
    assert correction["invoice_number"] in captured["html"]
    attachments = captured["attachments"]
    assert attachments is not None
    assert len(attachments) == 1
    assert attachments[0].filename == f"{correction['invoice_number']}.pdf"
    assert attachments[0].content_type == "application/pdf"
    assert attachments[0].content == b"%PDF-test-correction"


def test_odeslani_quote_e_mailem_prilozi_pdf() -> None:
    _login_admin()
    settings_response = client.put(
        "/api/admin/invoices/settings",
        json={
            "owner_email": "kopie@lakodi.cz",
            "payment_method": "Převodem",
            "bank_account_number": "5997826359",
            "bank_account_prefix": "",
            "bank_code": "0800",
            "bank_iban": "CZ9108000000005997826359",
        },
    )
    assert settings_response.status_code == 200

    quote = _vytvor_fakturu(
        {
            "document_kind": "quote",
            "customer_email": "quote-mail@example.com",
            "issue_date": "2099-04-04",
            "due_date": "2099-04-18",
        }
    )

    from backend.app.modules.invoices import email_service as invoice_email_service

    original_is_email_configured = invoice_email_service.is_email_configured
    original_send_html_email = invoice_email_service.send_html_email
    original_build_invoice_pdf_document = invoice_email_service.build_invoice_pdf_document
    captured = {}

    invoice_email_service.is_email_configured = lambda: True
    invoice_email_service.build_invoice_pdf_document = lambda _invoice: InvoicePdfDocument(
        filename=f"{quote['invoice_number']}.pdf",
        content=b"%PDF-test-quote",
    )

    def fake_send_html_email(to_email: str, subject: str, html: str, attachments=None, bcc=None, cc=None) -> bool:
        captured["to_email"] = to_email
        captured["subject"] = subject
        captured["html"] = html
        captured["attachments"] = attachments
        captured["bcc"] = bcc
        return True

    invoice_email_service.send_html_email = fake_send_html_email
    try:
        response = client.post(f"/api/admin/invoices/{quote['id']}/send-email")
    finally:
        invoice_email_service.is_email_configured = original_is_email_configured
        invoice_email_service.send_html_email = original_send_html_email
        invoice_email_service.build_invoice_pdf_document = original_build_invoice_pdf_document

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "invoice_id": quote["id"],
        "invoice_number": quote["invoice_number"],
        "sent_to": "quote-mail@example.com",
        "copied_to": ["kopie@lakodi.cz"],
    }
    assert captured["to_email"] == "quote-mail@example.com"
    assert captured["subject"] == f"Faktura {quote['invoice_number']}"
    attachments = captured["attachments"]
    assert attachments is not None
    assert len(attachments) == 1
    assert attachments[0].filename == f"{quote['invoice_number']}.pdf"
    assert attachments[0].content_type == "application/pdf"
    assert attachments[0].content == b"%PDF-test-quote"


def test_odeslani_faktury_vrati_503_kdyz_neni_email_nakonfigurovany() -> None:
    invoice = _vytvor_fakturu()

    from backend.app.modules.invoices import email_service as invoice_email_service

    original_is_email_configured = invoice_email_service.is_email_configured
    invoice_email_service.is_email_configured = lambda: False
    try:
        response = client.post(f"/api/admin/invoices/{invoice['id']}/send-email")
    finally:
        invoice_email_service.is_email_configured = original_is_email_configured

    assert response.status_code == 503
    assert response.json() == {"detail": "Odesílání e-mailů není nakonfigurované."}


def test_odeslani_faktury_vrati_400_kdyz_chybi_prijemce() -> None:
    invoice = _vytvor_fakturu()

    from backend.app.modules.invoices import service as invoice_service

    original_deliver_invoice_email = invoice_service.deliver_invoice_email

    def raise_missing_recipient(_invoice, to_email=None, owner_email=None):
        raise InvoiceEmailSendError("Chybí e-mailová adresa příjemce faktury.")

    invoice_service.deliver_invoice_email = raise_missing_recipient
    try:
        response = client.post(f"/api/admin/invoices/{invoice['id']}/send-email")
    finally:
        invoice_service.deliver_invoice_email = original_deliver_invoice_email

    assert response.status_code == 400
    assert response.json() == {"detail": "Chybí e-mailová adresa příjemce faktury."}


def _put_invoice(invoice: dict, overrides: dict | None = None) -> object:
    _login_admin()
    payload = {
        "invoice_number": invoice["invoice_number"],
        "issue_date": invoice["issue_date"],
        "due_date": invoice["due_date"],
        "subject_id": invoice.get("subject_id"),
        "customer_name": invoice["customer_name"],
        "customer_email": invoice["customer_email"],
        "customer_phone": invoice.get("customer_phone"),
        "customer_address": invoice["customer_address"],
        "customer_ico": invoice.get("customer_ico"),
        "customer_dic": invoice.get("customer_dic"),
        "note": invoice.get("note"),
        "business_mode": invoice["business_mode"],
        "tax_mode": invoice["tax_mode"],
        "currency": invoice["currency"],
        "vat_rate": invoice.get("vat_rate"),
        "status": invoice["status"],
        "document_kind": invoice.get("document_kind", "invoice"),
        "items": [
            {
                "description": item["description"],
                "quantity": item["quantity"],
                "unit_price": item["unit_price"],
            }
            for item in invoice["items"]
        ],
    }
    if overrides:
        payload.update(overrides)
    return client.put(f"/api/admin/invoices/{invoice['id']}", json=payload)


def test_update_issued_invoice_succeeds() -> None:
    invoice = _vytvor_fakturu({"status": "issued", "note": "before"})
    assert invoice["status"] == "issued"

    response = _put_invoice(invoice, {"note": "after issued edit", "status": "issued"})
    assert response.status_code == 200
    updated = response.json()
    assert updated["status"] == "issued"
    assert updated["note"] == "after issued edit"


def test_update_cancelled_invoice_is_rejected() -> None:
    invoice = _vytvor_fakturu({"status": "issued"})
    cancel_response = _put_invoice(invoice, {"status": "cancelled"})
    assert cancel_response.status_code == 200
    cancelled = cancel_response.json()
    assert cancelled["status"] == "cancelled"

    response = _put_invoice(cancelled, {"note": "should fail", "status": "cancelled"})
    assert response.status_code == 400
    assert "Zrušený doklad nelze upravovat." in response.json()["detail"]


def test_update_issued_invoice_rejects_total_below_payments() -> None:
    invoice = _vytvor_fakturu(
        {
            "status": "issued",
            "items": [{"description": "Diagnostika", "quantity": 1, "unit_price": 5000}],
        }
    )
    paid = _pridej_platbu(invoice["id"], {"amount": 4000})
    assert float(paid["total_paid"]) == 4000.0

    # New total with 21% VAT: 100 * 1.21 = 121, well below 4000 paid.
    response = _put_invoice(
        invoice,
        {
            "status": "issued",
            "items": [{"description": "Diagnostika", "quantity": 1, "unit_price": 100}],
            "vat_rate": 21,
            "tax_mode": "standard",
        },
    )
    assert response.status_code == 400
    assert "Součet plateb nesmí překročit novou celkovou částku dokladu." in response.json()["detail"]
