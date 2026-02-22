import pytest
from fastapi.testclient import TestClient

from backend.app.db import init_db
from backend.app.main import app


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
