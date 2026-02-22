from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_convertor_accepts_files():
    png_1x1 = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc````\x00\x00"
        b"\x00\x05\x00\x01\xa5\xf6E@\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    files = {
        "files": ("test.png", png_1x1, "image/png"),
    }

    response = client.post("/api/convertor", files=files)

    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "received"
    assert data["count"] == 1
    assert "test.png" in data["files"]
