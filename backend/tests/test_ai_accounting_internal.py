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


def test_internal_ai_can_read_invoice_with_valid_scope(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)
    invoice = _create_invoice()

    response = client.get(
        f"/internal/ai/v1/accounting/invoices/{invoice['id']}",
        headers=_auth_headers(scopes=("lakodi.invoices.read",)),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["document_id"] == invoice["id"]
    assert payload["document_number"] == invoice["invoice_number"]
    assert payload["subject_name"] == "Jan Novak"
    assert payload["total_with_vat"] == 1210.0
    assert "customer_email" not in payload


def test_internal_ai_can_read_invoice_payments_with_valid_scope(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)
    invoice = _create_invoice()
    payment = _add_payment(invoice["id"])

    response = client.get(
        f"/internal/ai/v1/accounting/invoices/{invoice['id']}/payments",
        headers=_auth_headers(scopes=("lakodi.payments.read",)),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == [
        {
            "payment_id": payment["payments"][0]["id"],
            "amount": 250.0,
            "paid_at": "2026-04-10",
            "payment_method": "Bankovni prevod",
            "note": "Castecna uhrada",
        }
    ]


def test_internal_ai_can_read_document_defaults_with_valid_scope(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)

    response = client.get(
        "/internal/ai/v1/accounting/document-defaults",
        params={"document_kind": "invoice"},
        headers=_auth_headers(scopes=("lakodi.invoices.read",)),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["document_kind"] == "invoice"
    assert payload["document_number"]
    assert payload["variable_symbol"]


def test_internal_ai_searches_outgoing_documents(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)
    invoice = _create_invoice(customer_name="LOCAL DEMO CUSTOMER ALPHA")

    response = client.get(
        "/internal/ai/v1/accounting/invoices/search",
        params={"query": "ALPHA", "limit": 10},
        headers=_auth_headers(scopes=("lakodi.invoices.read",)),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] >= 1
    assert any(item["document_id"] == invoice["id"] for item in payload["items"])
    assert "customer_email" not in payload["items"][0]


def test_internal_ai_lists_unpaid_outgoing_documents(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)
    invoice = _create_invoice(customer_name="LOCAL DEMO CUSTOMER UNPAID")

    response = client.get(
        "/internal/ai/v1/accounting/invoices",
        params={"payment_status": "unpaid", "sort": "invoice_number_asc"},
        headers=_auth_headers(scopes=("lakodi.invoices.read",)),
    )

    assert response.status_code == 200
    payload = response.json()
    assert any(item["document_id"] == invoice["id"] for item in payload["items"])
    assert payload["limit"] == 25


def test_internal_ai_invoice_summary_is_grouped_by_currency(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)
    invoice = _create_invoice(customer_name="LOCAL DEMO CUSTOMER SUMMARY")
    _add_payment(invoice["id"])

    response = client.get(
        "/internal/ai/v1/accounting/invoices/summary",
        params={"customer_query": "LOCAL DEMO CUSTOMER SUMMARY"},
        headers=_auth_headers(scopes=("lakodi.invoices.read", "lakodi.payments.read")),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["document_count"] >= 1
    czk = next(item for item in payload["currencies"] if item["currency"] == "CZK")
    assert czk["invoiced_with_vat"] >= 1210.0
    assert czk["received_payments"] >= 250.0


def test_internal_ai_customer_summary_marks_ambiguous_customer(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)
    _create_invoice(customer_name="LOCAL DEMO CUSTOMER AMBIGUOUS ONE")
    _create_invoice(customer_name="LOCAL DEMO CUSTOMER AMBIGUOUS TWO")

    response = client.get(
        "/internal/ai/v1/accounting/customers/summary",
        params={"customer_query": "LOCAL DEMO CUSTOMER AMBIGUOUS"},
        headers=_auth_headers(scopes=("lakodi.invoices.read", "lakodi.payments.read")),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ambiguous"] is True
    assert payload["summary"] is None


def test_internal_ai_monthly_summary_validates_month(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)

    invalid = client.get(
        "/internal/ai/v1/accounting/monthly-summary",
        params={"year": 2026, "month": 13},
        headers=_auth_headers(scopes=("lakodi.invoices.read", "lakodi.payments.read")),
    )
    valid = client.get(
        "/internal/ai/v1/accounting/monthly-summary",
        params={"year": 2099, "month": 4},
        headers=_auth_headers(scopes=("lakodi.invoices.read", "lakodi.payments.read")),
    )

    assert invalid.status_code == 422
    assert valid.status_code == 200


def test_internal_ai_summary_requires_payment_scope(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)

    response = client.get(
        "/internal/ai/v1/accounting/invoices/summary",
        headers=_auth_headers(scopes=("lakodi.invoices.read",)),
    )

    assert response.status_code == 403


def test_internal_ai_rejects_missing_token(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)
    invoice = _create_invoice()

    response = client.get(f"/internal/ai/v1/accounting/invoices/{invoice['id']}")

    assert response.status_code == 401


def test_internal_ai_rejects_invalid_signature(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)
    invoice = _create_invoice()
    token = _make_token(scopes=("lakodi.invoices.read",), signing_secret="y" * 32)

    response = client.get(
        f"/internal/ai/v1/accounting/invoices/{invoice['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_internal_ai_rejects_expired_token(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)
    invoice = _create_invoice()
    token = _make_token(scopes=("lakodi.invoices.read",), issued_at=int(time.time()) - 1000, ttl=60)

    response = client.get(
        f"/internal/ai/v1/accounting/invoices/{invoice['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_internal_ai_rejects_wrong_tenant(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)
    invoice = _create_invoice()

    response = client.get(
        f"/internal/ai/v1/accounting/invoices/{invoice['id']}",
        headers=_auth_headers(scopes=("lakodi.invoices.read",), tenant_id="tenant-2"),
    )

    assert response.status_code == 403


def test_internal_ai_rejects_missing_scope(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)
    invoice = _create_invoice()

    response = client.get(
        f"/internal/ai/v1/accounting/invoices/{invoice['id']}",
        headers=_auth_headers(scopes=("lakodi.payments.read",)),
    )

    assert response.status_code == 403


def test_internal_ai_rejects_alg_none(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)
    invoice = _create_invoice()
    token = "eyJhbGciOiJub25lIiwia2lkIjoidGVzdC1rZXkiLCJ0eXAiOiJKV1QifQ.e30.signature"

    response = client.get(
        f"/internal/ai/v1/accounting/invoices/{invoice['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_service_token_does_not_authenticate_admin_endpoint(monkeypatch) -> None:
    _configure_service_auth(monkeypatch)
    client.cookies.clear()

    response = client.get(
        "/api/admin/invoices/settings",
        headers=_auth_headers(scopes=("lakodi.invoices.read",)),
    )

    assert response.status_code == 401


def _configure_service_auth(monkeypatch) -> None:
    monkeypatch.setenv("AI_ACCOUNTING_SERVICE_TOKEN_SECRET", SIGNING_SECRET)
    monkeypatch.setenv("AI_ACCOUNTING_EXPECTED_TENANT_ID", TENANT_ID)
    monkeypatch.setenv("AI_ACCOUNTING_ALLOWED_KEY_ID", KEY_ID)
    monkeypatch.setenv("AI_ACCOUNTING_TOKEN_ISSUER", ISSUER)
    monkeypatch.setenv("AI_ACCOUNTING_TOKEN_AUDIENCE", AUDIENCE)
    monkeypatch.setenv("AI_ACCOUNTING_MAX_TOKEN_TTL_SECONDS", "300")


def _auth_headers(*, scopes: tuple[str, ...], tenant_id: str = TENANT_ID) -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(scopes=scopes, tenant_id=tenant_id)}"}


def _make_token(
    *,
    scopes: tuple[str, ...],
    tenant_id: str = TENANT_ID,
    signing_secret: str = SIGNING_SECRET,
    issued_at: int | None = None,
    ttl: int = 300,
) -> str:
    return build_service_token(
        issuer=ISSUER,
        audience=AUDIENCE,
        subject="ai-agent-accounting",
        tenant_id=tenant_id,
        scopes=scopes,
        key_id=KEY_ID,
        signing_secret=signing_secret,
        issued_at=issued_at or int(time.time()),
        ttl_seconds=ttl,
        jti="test-jti",
    )


def _login_admin() -> None:
    response = client.post(
        "/api/admin/login",
        json={"email": "lakodi@seznam.cz", "password": "admin123"},
    )
    assert response.status_code == 200


def _create_invoice(
    *,
    customer_name: str = "Jan Novak",
    issue_date: str = "2099-04-04",
    due_date: str = "2099-04-18",
    currency: str = "CZK",
) -> dict:
    _login_admin()
    response = client.post(
        "/api/admin/invoices",
        json={
            "issue_date": issue_date,
            "due_date": due_date,
            "customer_name": customer_name,
            "customer_email": "jan@example.com",
            "customer_phone": "+420123456789",
            "customer_address": "Praha 10",
            "customer_ico": "12345678",
            "customer_dic": "CZ12345678",
            "note": "Rucni servisni faktura",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": currency,
            "vat_rate": 21,
            "items": [{"description": "Diagnostika", "quantity": 1, "unit_price": 1000}],
        },
    )
    assert response.status_code == 200
    return response.json()


def _add_payment(invoice_id: int) -> dict:
    _login_admin()
    response = client.post(
        f"/api/admin/invoices/{invoice_id}/payments",
        json={
            "amount": 250,
            "paid_at": "2026-04-10",
            "payment_method": "Bankovni prevod",
            "note": "Castecna uhrada",
        },
    )
    assert response.status_code == 200
    return response.json()
