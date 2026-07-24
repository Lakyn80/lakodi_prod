"""Tests for admin AI BFF (host JWT mint + proxy)."""

from __future__ import annotations

import base64
import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.modules.ai_accounting.host_auth import (
    build_hs256_host_token,
    get_host_ai_auth_config,
    mint_host_ai_token,
)
from backend.app.modules.auth.service import create_session


SIGNING_SECRET = "x" * 48
KEY_ID = "lakodi-host-key"
TENANT_ID = "tenant-lakodi-1"


@pytest.fixture
def configured_ai_auth(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AI_AUTH_SIGNING_SECRET", SIGNING_SECRET)
    monkeypatch.setenv("AI_AUTH_KEY_ID", KEY_ID)
    monkeypatch.setenv("AI_AUTH_TENANT_ID", TENANT_ID)
    monkeypatch.setenv("AI_AUTH_TOKEN_ISSUER", "lakodi-host")
    monkeypatch.setenv("AI_AUTH_TOKEN_AUDIENCE", "ai-agent-accounting")
    monkeypatch.setenv("AI_AUTH_TOKEN_TTL_SECONDS", "300")
    monkeypatch.setenv("AI_AGENT_BASE_URL", "http://ai-agent.test")
    return None


@pytest.fixture
def admin_client(configured_ai_auth):
    client = TestClient(app)
    # Seed admin via login is heavy; mint cookie directly for unit tests.
    token = create_session(user_id=1, role="admin")
    client.cookies.set("admin_session", token)
    return client


def test_mint_host_ai_token_claims(configured_ai_auth) -> None:
    token = mint_host_ai_token(user_id=42, jti="fixed-jti", now=1_700_000_000)
    header_b64, payload_b64, _sig = token.split(".")
    header = json.loads(base64.urlsafe_b64decode(header_b64 + "=="))
    payload = json.loads(base64.urlsafe_b64decode(payload_b64 + "=="))
    assert header == {"alg": "HS256", "kid": KEY_ID, "typ": "JWT"}
    assert payload["iss"] == "lakodi-host"
    assert payload["aud"] == "ai-agent-accounting"
    assert payload["tenant_id"] == TENANT_ID
    assert payload["user_id"] == "42"
    assert payload["sub"] == "42"
    assert "ai.chat" in payload["scopes"]
    assert payload["jti"] == "fixed-jti"
    assert payload["exp"] == 1_700_000_000 + 300


def test_build_hs256_host_token_signature_stable(configured_ai_auth) -> None:
    claims = {
        "iss": "lakodi-host",
        "aud": "ai-agent-accounting",
        "sub": "1",
        "user_id": "1",
        "tenant_id": TENANT_ID,
        "roles": ["admin"],
        "scopes": ["ai.chat"],
        "iat": 10,
        "nbf": 10,
        "exp": 310,
        "jti": "abc",
    }
    first = build_hs256_host_token(claims=claims, key_id=KEY_ID, signing_secret=SIGNING_SECRET)
    second = build_hs256_host_token(claims=claims, key_id=KEY_ID, signing_secret=SIGNING_SECRET)
    assert first == second


def test_chat_bff_requires_admin(configured_ai_auth) -> None:
    client = TestClient(app)
    response = client.post("/api/admin/ai/chat/messages", json={"text": "Ahoj"})
    assert response.status_code == 401


def test_chat_bff_proxies_with_minted_token(admin_client: TestClient) -> None:
    upstream = MagicMock()
    upstream.status_code = 200
    upstream.headers = {"content-type": "application/json"}
    upstream.json.return_value = {
        "final_text": "Hotovo",
        "conversation_id": "conv-1",
        "detected_intent": "invoice_detail",
    }

    with patch(
        "backend.app.modules.ai_accounting.bff_router.proxy_ai_request",
        return_value=upstream,
    ) as mocked:
        response = admin_client.post(
            "/api/admin/ai/chat/messages",
            json={"text": "Ukaž fakturu 1", "language": "cs"},
            headers={"Idempotency-Key": "idem-key-123456"},
        )

    assert response.status_code == 200
    assert response.json()["final_text"] == "Hotovo"
    kwargs = mocked.call_args.kwargs
    assert kwargs["method"] == "POST"
    assert kwargs["path"] == "/api/v1/chat/messages"
    assert kwargs["idempotency_key"] == "idem-key-123456"
    assert kwargs["json_body"]["text"] == "Ukaž fakturu 1"
    assert kwargs["bearer_token"].count(".") == 2


def test_approve_bff_requires_idempotency_key(admin_client: TestClient) -> None:
    response = admin_client.post("/api/admin/ai/actions/act-1/approve", json={})
    assert response.status_code == 400
    assert "Idempotency-Key" in response.json()["detail"]


def test_approve_bff_proxies(admin_client: TestClient) -> None:
    upstream = MagicMock()
    upstream.status_code = 202
    upstream.headers = {"content-type": "application/json"}
    upstream.json.return_value = {"status": "executing", "action_id": "act-1"}

    with patch(
        "backend.app.modules.ai_accounting.bff_router.proxy_ai_request",
        return_value=upstream,
    ) as mocked:
        response = admin_client.post(
            "/api/admin/ai/actions/act-1/approve",
            json={"reason": "ok"},
            headers={"Idempotency-Key": "approve-key-12345"},
        )

    assert response.status_code == 202
    assert response.json()["status"] == "executing"
    assert mocked.call_args.kwargs["path"] == "/api/v1/actions/act-1/approve"
    assert mocked.call_args.kwargs["idempotency_key"] == "approve-key-12345"


def test_get_host_ai_auth_config_missing_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AI_AUTH_SIGNING_SECRET", raising=False)
    monkeypatch.setenv("AI_AUTH_KEY_ID", KEY_ID)
    monkeypatch.setenv("AI_AUTH_TENANT_ID", TENANT_ID)
    with pytest.raises(Exception) as exc:
        get_host_ai_auth_config()
    assert getattr(exc.value, "status_code", None) == 503
