"""Tests for admin AI BFF (host JWT mint + proxy)."""

from __future__ import annotations

import base64
import json
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.modules.ai_accounting.bff_client import proxy_ai_request
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
    token = create_session(user_id=1, role="admin")
    client.cookies.set("admin_session", token)
    return client


def _json_upstream(status_code: int, payload: dict) -> MagicMock:
    upstream = MagicMock()
    upstream.status_code = status_code
    upstream.headers = {"content-type": "application/json"}
    upstream.json.return_value = payload
    upstream.content = json.dumps(payload).encode("utf-8")
    return upstream


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
    assert payload["roles"] == ["admin"]
    assert "ai.chat" in payload["scopes"]
    assert "lakodi.invoices.read" in payload["scopes"]
    assert payload["jti"] == "fixed-jti"
    assert payload["exp"] == 1_700_000_000 + 300
    assert payload["iat"] == 1_700_000_000
    assert payload["nbf"] == 1_700_000_000


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


def test_chat_bff_requires_authentication(configured_ai_auth) -> None:
    client = TestClient(app)
    response = client.post("/api/admin/ai/chat/messages", json={"text": "Ahoj"})
    assert response.status_code == 401
    assert SIGNING_SECRET not in response.text
    assert "Bearer " not in response.text


def test_chat_bff_rejects_non_admin_role(configured_ai_auth) -> None:
    client = TestClient(app)
    client.cookies.set("admin_session", create_session(user_id=2, role="staff"))
    response = client.post("/api/admin/ai/chat/messages", json={"text": "Ahoj"})
    assert response.status_code == 403


def test_chat_bff_rejects_missing_tenant(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_AUTH_SIGNING_SECRET", SIGNING_SECRET)
    monkeypatch.setenv("AI_AUTH_KEY_ID", KEY_ID)
    monkeypatch.delenv("AI_AUTH_TENANT_ID", raising=False)
    monkeypatch.delenv("AI_ACCOUNTING_EXPECTED_TENANT_ID", raising=False)
    monkeypatch.setenv("AI_AGENT_BASE_URL", "http://ai-agent.test")
    client = TestClient(app)
    client.cookies.set("admin_session", create_session(user_id=1, role="admin"))
    response = client.post("/api/admin/ai/chat/messages", json={"text": "Ahoj"})
    assert response.status_code == 503
    assert "tenant" in response.json()["detail"].lower()


def test_chat_bff_proxies_with_minted_token(admin_client: TestClient) -> None:
    upstream = _json_upstream(
        200,
        {
            "final_text": "Hotovo",
            "conversation_id": "conv-1",
            "detected_intent": "invoice_detail",
        },
    )

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
    body = response.json()
    assert body["final_text"] == "Hotovo"
    assert SIGNING_SECRET not in json.dumps(body)
    assert "Authorization" not in response.headers
    kwargs = mocked.call_args.kwargs
    assert kwargs["method"] == "POST"
    assert kwargs["path"] == "/api/v1/chat/messages"
    assert kwargs["idempotency_key"] == "idem-key-123456"
    assert kwargs["json_body"]["text"] == "Ukaž fakturu 1"
    assert kwargs["json_body"]["language"] == "cs"
    assert kwargs["bearer_token"].count(".") == 2


def test_get_action_bff_proxies(admin_client: TestClient) -> None:
    upstream = _json_upstream(200, {"action_id": "act-1", "status": "pending"})
    with patch(
        "backend.app.modules.ai_accounting.bff_router.proxy_ai_request",
        return_value=upstream,
    ) as mocked:
        response = admin_client.get("/api/admin/ai/actions/act-1")
    assert response.status_code == 200
    assert response.json()["status"] == "pending"
    assert mocked.call_args.kwargs["path"] == "/api/v1/actions/act-1"
    assert mocked.call_args.kwargs.get("json_body") is None


def test_approve_bff_requires_idempotency_key(admin_client: TestClient) -> None:
    response = admin_client.post("/api/admin/ai/actions/act-1/approve")
    assert response.status_code == 400
    assert "Idempotency-Key" in response.json()["detail"]


def test_approve_bff_proxies_without_json_body(admin_client: TestClient) -> None:
    upstream = _json_upstream(202, {"status": "executing", "action_id": "act-1"})
    with patch(
        "backend.app.modules.ai_accounting.bff_router.proxy_ai_request",
        return_value=upstream,
    ) as mocked:
        response = admin_client.post(
            "/api/admin/ai/actions/act-1/approve",
            headers={"Idempotency-Key": "approve-key-12345"},
        )
    assert response.status_code == 202
    assert response.json()["status"] == "executing"
    assert mocked.call_args.kwargs["path"] == "/api/v1/actions/act-1/approve"
    assert mocked.call_args.kwargs["idempotency_key"] == "approve-key-12345"
    assert mocked.call_args.kwargs["json_body"] is None


def test_upstream_timeout_maps_to_504(configured_ai_auth) -> None:
    with patch("backend.app.modules.ai_accounting.bff_client.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        client.request.side_effect = httpx.TimeoutException("timeout")
        with pytest.raises(HTTPException) as exc:
            proxy_ai_request(method="GET", path="/health")
    assert exc.value.status_code == 504


def test_upstream_connection_error_maps_to_502(configured_ai_auth) -> None:
    with patch("backend.app.modules.ai_accounting.bff_client.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        client.request.side_effect = httpx.ConnectError("down")
        with pytest.raises(HTTPException) as exc:
            proxy_ai_request(method="GET", path="/health")
    assert exc.value.status_code == 502


def test_upstream_auth_failure_maps_to_502(admin_client: TestClient) -> None:
    upstream = _json_upstream(401, {"detail": "Authentication failed"})
    with patch(
        "backend.app.modules.ai_accounting.bff_router.proxy_ai_request",
        return_value=upstream,
    ):
        response = admin_client.post(
            "/api/admin/ai/chat/messages",
            json={"text": "Ahoj"},
            headers={"Idempotency-Key": "idem-key-abcdef"},
        )
    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "AI_AUTH" in detail
    assert SIGNING_SECRET not in response.text
    assert "Authentication failed" not in response.text


def test_upstream_service_error_forwarded(admin_client: TestClient) -> None:
    upstream = _json_upstream(503, {"detail": "AI unavailable"})
    with patch(
        "backend.app.modules.ai_accounting.bff_router.proxy_ai_request",
        return_value=upstream,
    ):
        response = admin_client.get("/api/admin/ai/actions/act-9")
    assert response.status_code == 503
    assert response.json()["detail"] == "AI unavailable"
    assert SIGNING_SECRET not in response.text


def test_get_host_ai_auth_config_missing_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AI_AUTH_SIGNING_SECRET", raising=False)
    monkeypatch.setenv("AI_AUTH_KEY_ID", KEY_ID)
    monkeypatch.setenv("AI_AUTH_TENANT_ID", TENANT_ID)
    with pytest.raises(HTTPException) as exc:
        get_host_ai_auth_config()
    assert exc.value.status_code == 503


def test_response_never_exposes_signing_material(admin_client: TestClient) -> None:
    upstream = _json_upstream(200, {"final_text": "ok", "conversation_id": "c1"})
    with patch(
        "backend.app.modules.ai_accounting.bff_router.proxy_ai_request",
        return_value=upstream,
    ):
        response = admin_client.post(
            "/api/admin/ai/chat/messages",
            json={"text": "test"},
            headers={"Idempotency-Key": "idem-secret-check"},
        )
    raw = response.text
    assert SIGNING_SECRET not in raw
    assert "Bearer " not in raw
    assert "AI_AUTH_SIGNING_SECRET" not in raw
