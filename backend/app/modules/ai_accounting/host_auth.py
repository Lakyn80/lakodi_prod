"""Mint short-lived host JWTs for the AI Agent Accounting platform."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import Cookie, HTTPException, status

from backend.app.modules.auth.service import decode_session

DEFAULT_ISSUER = "lakodi-host"
DEFAULT_AUDIENCE = "ai-agent-accounting"
DEFAULT_TTL_SECONDS = 300
MAX_TTL_SECONDS = 900
MIN_TTL_SECONDS = 30
DEFAULT_CHAT_SCOPES = (
    "ai.chat",
    "lakodi.invoices.read",
    "lakodi.payments.read",
    "lakodi.customers.read",
)


@dataclass(frozen=True)
class HostAiAuthConfig:
    issuer: str
    audience: str
    key_id: str
    signing_secret: str
    tenant_id: str
    ttl_seconds: int
    scopes: tuple[str, ...]


def require_admin_user_id(admin_session: str | None = Cookie(None)) -> int:
    """Admin cookie gate that also returns the authenticated user id."""
    user_id, role = decode_session(admin_session)
    if user_id is None or role != "admin":
        raise HTTPException(status_code=401, detail="Přihlaste se do adminu")
    return user_id


def get_host_ai_auth_config() -> HostAiAuthConfig:
    signing_secret = (os.getenv("AI_AUTH_SIGNING_SECRET") or "").strip()
    key_id = (os.getenv("AI_AUTH_KEY_ID") or "").strip()
    tenant_id = (
        (os.getenv("AI_AUTH_TENANT_ID") or "").strip()
        or (os.getenv("AI_ACCOUNTING_EXPECTED_TENANT_ID") or "").strip()
    )
    if not signing_secret or not key_id or not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI chat authentication is not configured.",
        )
    if len(signing_secret) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI chat authentication is not configured safely.",
        )
    scopes_raw = (os.getenv("AI_AUTH_DEFAULT_SCOPES") or "").strip()
    if scopes_raw:
        scopes = tuple(dict.fromkeys(item.strip() for item in scopes_raw.split(",") if item.strip()))
    else:
        scopes = DEFAULT_CHAT_SCOPES
    if "ai.chat" not in scopes:
        scopes = ("ai.chat",) + scopes
    return HostAiAuthConfig(
        issuer=(os.getenv("AI_AUTH_TOKEN_ISSUER") or DEFAULT_ISSUER).strip(),
        audience=(os.getenv("AI_AUTH_TOKEN_AUDIENCE") or DEFAULT_AUDIENCE).strip(),
        key_id=key_id,
        signing_secret=signing_secret,
        tenant_id=tenant_id,
        ttl_seconds=_bounded_int_env(
            "AI_AUTH_TOKEN_TTL_SECONDS",
            default=DEFAULT_TTL_SECONDS,
            minimum=MIN_TTL_SECONDS,
            maximum=MAX_TTL_SECONDS,
        ),
        scopes=scopes,
    )


def mint_host_ai_token(
    *,
    user_id: int | str,
    config: HostAiAuthConfig | None = None,
    now: int | None = None,
    jti: str | None = None,
    roles: tuple[str, ...] = ("admin",),
) -> str:
    auth = config or get_host_ai_auth_config()
    issued_at = int(time.time()) if now is None else now
    subject = str(user_id)
    claims: dict[str, Any] = {
        "iss": auth.issuer,
        "aud": auth.audience,
        "sub": subject,
        "user_id": subject,
        "tenant_id": auth.tenant_id,
        "roles": list(roles),
        "scopes": list(auth.scopes),
        "iat": issued_at,
        "nbf": issued_at,
        "exp": issued_at + auth.ttl_seconds,
        "jti": jti or f"lakodi-ai-{uuid.uuid4().hex}",
    }
    return build_hs256_host_token(
        claims=claims,
        key_id=auth.key_id,
        signing_secret=auth.signing_secret,
    )


def build_hs256_host_token(
    *,
    claims: dict[str, Any],
    key_id: str,
    signing_secret: str,
) -> str:
    header = {"typ": "JWT", "alg": "HS256", "kid": key_id}
    signing_input = f"{_base64url_json(header)}.{_base64url_json(claims)}"
    signature = hmac.new(
        signing_secret.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{signing_input}.{base64.urlsafe_b64encode(signature).decode('ascii').rstrip('=')}"


def _base64url_json(value: dict[str, Any]) -> str:
    payload = json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def _bounded_int_env(name: str, *, default: int, minimum: int, maximum: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None or not raw_value.strip():
        return default
    try:
        value = int(raw_value)
    except ValueError:
        return default
    return max(minimum, min(maximum, value))
