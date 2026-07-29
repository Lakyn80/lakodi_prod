"""Internal AI change-feed endpoints for retrieval sync."""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.modules.ai_accounting.auth import build_service_token

client = TestClient(app)

ISSUER = "ai-agent-accounting"
AUDIENCE = "lakodi-internal-accounting"
TENANT_ID = "tenant-1"
KEY_ID = "test-key"
SIGNING_SECRET = "x" * 32


def _configure_service_auth(monkeypatch) -> None:
    monkeypatch.setenv("AI_ACCOUNTING_SERVICE_TOKEN_SECRET", SIGNING_SECRET)
    monkeypatch.setenv("AI_ACCOUNTING_EXPECTED_TENANT_ID", TENANT_ID)
    monkeypatch.setenv("AI_ACCOUNTING_ALLOWED_KEY_ID", KEY_ID)
    monkeypatch.setenv("AI_ACCOUNTING_TOKEN_ISSUER", ISSUER)
    monkeypatch.setenv("AI_ACCOUNTING_TOKEN_AUDIENCE", AUDIENCE)
    monkeypatch.setenv("AI_ACCOUNTING_MAX_TOKEN_TTL_SECONDS", "300")


def _auth_headers(*, scopes: tuple[str, ...]) -> dict[str, str]:
    token = build_service_token(
        issuer=ISSUER,
        audience=AUDIENCE,
        subject="ai-agent-accounting",
        tenant_id=TENANT_ID,
        scopes=scopes,
        key_id=KEY_ID,
        signing_secret=SIGNING_SECRET,
        issued_at=int(time.time()),
        ttl_seconds=300,
        jti="sync-feed-jti",
    )
    return {"Authorization": f"Bearer {token}"}


def _login_admin() -> None:
    response = client.post(
        "/api/admin/login",
        json={"email": "lakodi@seznam.cz", "password": "admin123"},
    )
    assert response.status_code == 200


def _create_invoice(*, customer_name: str = "Sync Customer") -> dict:
    _login_admin()
    response = client.post(
        "/api/admin/invoices",
        json={
            "issue_date": "2099-05-01",
            "due_date": "2099-05-15",
            "customer_name": customer_name,
            "customer_email": "sync@example.com",
            "customer_phone": "+420123456789",
            "customer_address": "Praha 1",
            "customer_ico": "87654321",
            "customer_dic": "CZ87654321",
            "note": "Sync feed invoice",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [{"description": "Servis", "quantity": 1, "unit_price": 100}],
            "payment_method": "Převodem",
            "bank_account_number": "5997826359",
            "bank_code": "0800",
            "bank_iban": "CZ9108000000005997826359",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_document_changes_empty_then_upsert(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)
    empty = client.get(
        "/internal/ai/v1/accounting/documents/changes",
        params={"limit": 10},
        headers=_auth_headers(scopes=("lakodi.invoices.read",)),
    )
    assert empty.status_code == 200
    assert isinstance(empty.json()["items"], list)

    invoice = _create_invoice()
    page = client.get(
        "/internal/ai/v1/accounting/documents/changes",
        params={"limit": 1},
        headers=_auth_headers(scopes=("lakodi.invoices.read",)),
    )
    assert page.status_code == 200
    payload = page.json()
    assert payload["items"]
    assert payload["next_cursor"]
    first = payload["items"][0]
    assert first["operation"] == "upsert"
    assert first["external_id"] == str(invoice["id"])
    assert first["content_hash"]
    assert first["document_number"] == invoice["invoice_number"]

    page2 = client.get(
        "/internal/ai/v1/accounting/documents/changes",
        params={"cursor": payload["next_cursor"], "limit": 10},
        headers=_auth_headers(scopes=("lakodi.invoices.read",)),
    )
    assert page2.status_code == 200
    assert all(item["external_id"] != str(invoice["id"]) for item in page2.json()["items"])


def test_cancelled_invoice_is_delete_operation(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)
    invoice = _create_invoice(customer_name="Cancel Me")

    from backend.app.db import SessionLocal
    from backend.app.modules.invoices.models import Invoice

    db = SessionLocal()
    try:
        row = db.get(Invoice, invoice["id"])
        assert row is not None
        row.status = "cancelled"
        from datetime import UTC, datetime

        row.updated_at = datetime.now(tz=UTC)
        db.commit()
    finally:
        db.close()

    page = client.get(
        "/internal/ai/v1/accounting/documents/changes",
        params={"limit": 500},
        headers=_auth_headers(scopes=("lakodi.invoices.read",)),
    )
    assert page.status_code == 200
    match = [item for item in page.json()["items"] if item["external_id"] == str(invoice["id"])]
    assert match
    assert match[-1]["operation"] == "delete"
    assert match[-1]["deleted_at"] is not None


def test_customer_changes_and_ids(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)
    _login_admin()
    subject = client.post(
        "/api/admin/invoices/subjects",
        json={
            "name": "Export Subject Co",
            "email": "export@example.com",
            "address": "Praha 1",
            "ico": "11223344",
            "dic": "CZ11223344",
            "country": "CZ",
        },
    )
    assert subject.status_code in {200, 201}, subject.text

    changes = client.get(
        "/internal/ai/v1/accounting/customers/changes",
        params={"limit": 50},
        headers=_auth_headers(scopes=("lakodi.customers.read",)),
    )
    assert changes.status_code == 200
    assert changes.json()["items"]

    ids = client.get(
        "/internal/ai/v1/accounting/customers/ids",
        params={"limit": 50},
        headers=_auth_headers(scopes=("lakodi.customers.read",)),
    )
    assert ids.status_code == 200
    body = ids.json()
    assert body["external_ids"]
    assert body["content_hashes"]


def test_document_ids_inventory(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)
    invoice = _create_invoice(customer_name="Id Inventory")
    response = client.get(
        "/internal/ai/v1/accounting/documents/ids",
        params={"limit": 500},
        headers=_auth_headers(scopes=("lakodi.invoices.read",)),
    )
    assert response.status_code == 200
    body = response.json()
    assert str(invoice["id"]) in body["external_ids"]
    assert str(invoice["id"]) in body["content_hashes"]
