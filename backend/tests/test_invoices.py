from datetime import date

import pytest
from fastapi.testclient import TestClient

from backend.app.db import SessionLocal
from backend.app.main import app
from backend.app.modules.invoices import ares_service
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
    RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT,
    InvoiceExpense,
    InvoiceDocumentRelation,
    InvoiceSequenceState,
)
from backend.app.modules.invoices.numbering_service import (
    get_document_sequence_preview,
    reserve_document_sequence,
)
from backend.app.modules.invoices.pdf_service import InvoicePdfDocument

client = TestClient(app)


def _login_admin() -> None:
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


def test_proforma_metadata_povoluje_platby_pdf_email_a_neimplementuje_navazne_workflow() -> None:
    proforma_metadata = get_document_kind_metadata("proforma")
    tax_document_metadata = get_document_kind_metadata("tax_document")
    final_invoice_metadata = get_document_kind_metadata("final_invoice")
    correction_metadata = get_document_kind_metadata("correction")

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
