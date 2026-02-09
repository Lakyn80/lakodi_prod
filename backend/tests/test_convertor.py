from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_convertor_accepts_files():
    files = {
        "files": ("test.png", b"fake-image-bytes", "image/png")
    }

    response = client.post("/api/convertor", files=files)

    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "received"
    assert data["count"] == 1
    assert "test.png" in data["files"]
