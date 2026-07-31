import pytest
from fastapi.testclient import TestClient

from backend.app.db import init_db
from backend.app.main import app
from backend.app.modules.admin import email_service
from backend.app.modules.zakazky import router as zakazky_router


@pytest.fixture(autouse=True)
def setup_db():
    init_db()


client = TestClient(app)


def test_create_and_list_zakazka():
    response = client.post(
        "/api/zakazky",
        data={
            "category": "motor",
            "name": "Test User",
            "email": "test@example.com",
            "phone": "+420 123 456 789",
            "description": "Test problém",
            "answers": '{"značka": "Škoda", "model": "Octavia"}',
            "callback_requested": "false",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "saved"
    assert "id" in data
    assert "whatsapp_message" in data
    assert "Motor" in data["whatsapp_message"] or "motor" in data["whatsapp_message"]
    assert "owner_notification_email_sent" in data

    login_resp = client.post(
        "/api/admin/login",
        json={"email": "lakodi@seznam.cz", "password": "admin123"},
    )
    assert login_resp.status_code == 200

    list_resp = client.get("/api/zakazky")
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert len(items) >= 1
    found = next((z for z in items if z["id"] == data["id"]), None)
    assert found is not None
    assert found["name"] == "Test User"
    assert found["category"] == "motor"
    assert found["email"] == "test@example.com"


def test_create_zakazka_sends_owner_notification_email(monkeypatch):
    sent: dict[str, object] = {}

    def fake_confirmation_email(to_email: str, name: str, zakazka_id: int) -> bool:
        sent["confirmation"] = {
            "to_email": to_email,
            "name": name,
            "zakazka_id": zakazka_id,
        }
        return True

    def fake_owner_notification_email(**kwargs) -> bool:
        sent["owner"] = kwargs
        return True

    monkeypatch.setattr(zakazky_router, "send_booking_confirmation_email", fake_confirmation_email)
    monkeypatch.setattr(zakazky_router, "send_booking_owner_notification_email", fake_owner_notification_email)

    response = client.post(
        "/api/zakazky",
        data={
            "category": "motor",
            "name": "Test User",
            "email": "test@example.com",
            "phone": "+420 123 456 789",
            "description": "Test problém",
            "answers": '{"značka": "Škoda", "model": "Octavia"}',
            "callback_requested": "true",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["confirmation_email_sent"] is True
    assert data["owner_notification_email_sent"] is True

    confirmation = sent["confirmation"]
    assert isinstance(confirmation, dict)
    assert confirmation["to_email"] == "test@example.com"

    owner = sent["owner"]
    assert isinstance(owner, dict)
    assert owner["name"] == "Test User"
    assert owner["email"] == "test@example.com"
    assert owner["callback_requested"] is True
    assert owner["answers"] == {"značka": "Škoda", "model": "Octavia"}
    assert owner["created_at"] is not None


def test_booking_owner_notification_defaults_to_lakodi_email(monkeypatch):
    captured: dict[str, object] = {}

    def fake_send_html_email(to_email: str, subject: str, html: str, *args, **kwargs) -> bool:
        captured["to_email"] = to_email
        captured["subject"] = subject
        captured["html"] = html
        return True

    monkeypatch.delenv("BOOKING_NOTIFICATION_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_EMAIL", raising=False)
    monkeypatch.setattr(email_service, "send_html_email", fake_send_html_email)

    sent = email_service.send_booking_owner_notification_email(
        zakazka_id=123,
        category="motor",
        name="Test User",
        email="test@example.com",
        phone="+420 123 456 789",
        description="Test problém",
        answers={"značka": "Škoda"},
        callback_requested=True,
    )

    assert sent is True
    assert captured["to_email"] == "lakodi@seznam.cz"
    assert "Nová poptávka #123" in str(captured["subject"])


def _login_admin() -> None:
    login_resp = client.post(
        "/api/admin/login",
        json={"email": "lakodi@seznam.cz", "password": "admin123"},
    )
    assert login_resp.status_code == 200


def test_download_blank_zakazkovy_list_pdf():
    _login_admin()
    response = client.get("/api/zakazky/zakazkovy-list/pdf")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.content[:4] == b"%PDF"
    assert "zakazkovy-list.pdf" in response.headers.get("content-disposition", "")

    from backend.app.modules.zakazky.pdf_service import ASSET_PATH

    assert ASSET_PATH.is_file()
    assert response.content == ASSET_PATH.read_bytes()


def test_download_zakazkovy_list_pdf_for_zakazka_prefills_customer():
    create = client.post(
        "/api/zakazky",
        data={
            "category": "motor",
            "name": "Jan Novák",
            "email": "jan@example.com",
            "phone": "+420111222333",
            "description": "Nefunguje startér",
            "answers": '{"značka": "Škoda", "model": "Octavia", "RZ": "1AB2345"}',
            "callback_requested": "false",
        },
    )
    assert create.status_code == 200
    zakazka_id = create.json()["id"]

    _login_admin()
    response = client.get(f"/api/zakazky/{zakazka_id}/zakazkovy-list/pdf")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.content[:4] == b"%PDF"
    assert f"zakazkovy-list-{zakazka_id}.pdf" in response.headers.get("content-disposition", "")

    from backend.app.modules.zakazky.pdf_service import ASSET_PATH

    # Exact original printable form (no AcroForm overlay).
    assert response.content == ASSET_PATH.read_bytes()


def test_download_zakazkovy_list_pdf_requires_admin():
    anonymous = TestClient(app)
    response = anonymous.get("/api/zakazky/zakazkovy-list/pdf")
    assert response.status_code in {401, 403}
