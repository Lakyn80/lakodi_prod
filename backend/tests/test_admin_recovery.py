import time

import pytest
from fastapi.testclient import TestClient

from backend.app.db import init_db
from backend.app.main import app
from backend.app.modules.admin import router as admin_router


@pytest.fixture(autouse=True)
def setup_db():
    init_db()


client = TestClient(app)


def test_recovery_reset_changes_password_and_allows_login():
    email = admin_router.ADMIN_EMAIL.strip().lower()
    original_password = admin_router.ADMIN_PASSWORD
    new_password = "NovaZkouska123!"
    if new_password == original_password:
        new_password = "NovaZkouska456!"

    token = f"test-recovery-{time.time_ns()}"
    admin_router._pending_recovery[token] = (email, time.time() + 3600)

    reset_resp = client.post(
        "/api/admin/recover/reset",
        json={"token": token, "password": new_password},
    )
    assert reset_resp.status_code == 200
    assert reset_resp.json()["ok"] is True

    old_login = client.post(
        "/api/admin/login",
        json={"email": email, "password": original_password},
    )
    assert old_login.status_code == 401

    new_login = client.post(
        "/api/admin/login",
        json={"email": email, "password": new_password},
    )
    assert new_login.status_code == 200

    reused_token = client.post(
        "/api/admin/recover/reset",
        json={"token": token, "password": "JineHeslo123!"},
    )
    assert reused_token.status_code == 401

    cleanup_token = f"test-recovery-cleanup-{time.time_ns()}"
    admin_router._pending_recovery[cleanup_token] = (email, time.time() + 3600)
    cleanup_resp = client.post(
        "/api/admin/recover/reset",
        json={"token": cleanup_token, "password": original_password},
    )
    assert cleanup_resp.status_code == 200

    restored_login = client.post(
        "/api/admin/login",
        json={"email": email, "password": original_password},
    )
    assert restored_login.status_code == 200
