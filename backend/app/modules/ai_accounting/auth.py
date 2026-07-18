"""Isolated service-to-service authentication for AI accounting endpoints."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from fastapi import Header, HTTPException, status

ALLOWED_ALGORITHM = "HS256"
DEFAULT_ISSUER = "ai-agent-accounting"
DEFAULT_AUDIENCE = "lakodi-internal-accounting"
DEFAULT_MAX_TOKEN_TTL_SECONDS = 300
MAX_ALLOWED_TOKEN_TTL_SECONDS = 900
DEFAULT_CLOCK_SKEW_SECONDS = 30


@dataclass(frozen=True)
class ServiceAuthConfig:
    issuer: str
    audience: str
    expected_tenant_id: str
    key_id: str
    signing_secret: str
    max_token_ttl_seconds: int = DEFAULT_MAX_TOKEN_TTL_SECONDS
    clock_skew_seconds: int = DEFAULT_CLOCK_SKEW_SECONDS


@dataclass(frozen=True)
class ServiceTokenClaims:
    issuer: str
    audience: str
    subject: str
    tenant_id: str
    scopes: tuple[str, ...]
    jti: str
    issued_at: int
    expires_at: int
    not_before: int
    user_id: str | None = None
    trace_id: str | None = None
    correlation_id: str | None = None


def require_ai_accounting_scope(required_scope: str) -> Callable[[str | None], ServiceTokenClaims]:
    def dependency(authorization: str | None = Header(default=None)) -> ServiceTokenClaims:
        claims = verify_authorization_header(authorization)
        if required_scope not in claims.scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Service token does not have the required scope.",
            )
        return claims

    return dependency


def require_ai_accounting_scopes(
    required_scopes: tuple[str, ...],
) -> Callable[[str | None], ServiceTokenClaims]:
    def dependency(authorization: str | None = Header(default=None)) -> ServiceTokenClaims:
        claims = verify_authorization_header(authorization)
        if not set(required_scopes).issubset(set(claims.scopes)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Service token does not have the required scopes.",
            )
        return claims

    return dependency


def verify_authorization_header(authorization: str | None) -> ServiceTokenClaims:
    if not authorization:
        raise _invalid_token_error()
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _invalid_token_error()
    return verify_service_token(token.strip(), config=get_service_auth_config(), now=int(time.time()))


def get_service_auth_config() -> ServiceAuthConfig:
    signing_secret = (os.getenv("AI_ACCOUNTING_SERVICE_TOKEN_SECRET") or "").strip()
    expected_tenant_id = (os.getenv("AI_ACCOUNTING_EXPECTED_TENANT_ID") or "").strip()
    key_id = (os.getenv("AI_ACCOUNTING_ALLOWED_KEY_ID") or "").strip()
    if not signing_secret or not expected_tenant_id or not key_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI accounting service authentication is not configured.",
        )
    if len(signing_secret) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI accounting service authentication is not configured safely.",
        )
    return ServiceAuthConfig(
        issuer=(os.getenv("AI_ACCOUNTING_TOKEN_ISSUER") or DEFAULT_ISSUER).strip(),
        audience=(os.getenv("AI_ACCOUNTING_TOKEN_AUDIENCE") or DEFAULT_AUDIENCE).strip(),
        expected_tenant_id=expected_tenant_id,
        key_id=key_id,
        signing_secret=signing_secret,
        max_token_ttl_seconds=_bounded_int_env(
            "AI_ACCOUNTING_MAX_TOKEN_TTL_SECONDS",
            default=DEFAULT_MAX_TOKEN_TTL_SECONDS,
            minimum=30,
            maximum=MAX_ALLOWED_TOKEN_TTL_SECONDS,
        ),
        clock_skew_seconds=_bounded_int_env(
            "AI_ACCOUNTING_CLOCK_SKEW_SECONDS",
            default=DEFAULT_CLOCK_SKEW_SECONDS,
            minimum=0,
            maximum=120,
        ),
    )


def verify_service_token(
    token: str,
    *,
    config: ServiceAuthConfig,
    now: int,
) -> ServiceTokenClaims:
    header, payload, signature = _split_token(token)
    header_data = _decode_json_part(header)
    payload_data = _decode_json_part(payload)

    if header_data.get("alg") != ALLOWED_ALGORITHM or header_data.get("typ") != "JWT":
        raise _invalid_token_error()
    if header_data.get("kid") != config.key_id:
        raise _invalid_token_error()

    expected_signature = _sign(f"{header}.{payload}", config.signing_secret)
    if not hmac.compare_digest(signature, expected_signature):
        raise _invalid_token_error()

    claims = _parse_claims(payload_data)
    _validate_claims(claims, config=config, now=now)
    return claims


def build_service_token(
    *,
    issuer: str,
    audience: str,
    subject: str,
    tenant_id: str,
    scopes: tuple[str, ...],
    key_id: str,
    signing_secret: str,
    issued_at: int,
    ttl_seconds: int = DEFAULT_MAX_TOKEN_TTL_SECONDS,
    jti: str = "test-jti",
) -> str:
    payload = {
        "iss": issuer,
        "aud": audience,
        "sub": subject,
        "iat": issued_at,
        "nbf": issued_at,
        "exp": issued_at + ttl_seconds,
        "jti": jti,
        "tenant_id": tenant_id,
        "scopes": list(scopes),
    }
    header = {
        "typ": "JWT",
        "alg": ALLOWED_ALGORITHM,
        "kid": key_id,
    }
    signing_input = f"{_base64url_json(header)}.{_base64url_json(payload)}"
    return f"{signing_input}.{_sign(signing_input, signing_secret)}"


def _validate_claims(claims: ServiceTokenClaims, *, config: ServiceAuthConfig, now: int) -> None:
    if claims.issuer != config.issuer or claims.audience != config.audience:
        raise _invalid_token_error()
    if claims.tenant_id != config.expected_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Service token tenant is not allowed.",
        )
    if claims.issued_at > now + config.clock_skew_seconds:
        raise _invalid_token_error()
    if claims.not_before > now + config.clock_skew_seconds:
        raise _invalid_token_error()
    if claims.expires_at < now - config.clock_skew_seconds:
        raise _invalid_token_error()
    if claims.expires_at - claims.issued_at > config.max_token_ttl_seconds:
        raise _invalid_token_error()


def _parse_claims(payload: dict[str, Any]) -> ServiceTokenClaims:
    required_string_claims = ("iss", "aud", "sub", "tenant_id", "jti")
    for claim_name in required_string_claims:
        if not isinstance(payload.get(claim_name), str) or not payload[claim_name].strip():
            raise _invalid_token_error()
    for claim_name in ("iat", "nbf", "exp"):
        if not isinstance(payload.get(claim_name), int):
            raise _invalid_token_error()
    scopes = payload.get("scopes")
    if not isinstance(scopes, list) or not all(isinstance(item, str) for item in scopes):
        raise _invalid_token_error()
    normalized_scopes = tuple(dict.fromkeys(scope.strip() for scope in scopes if scope.strip()))
    if not normalized_scopes:
        raise _invalid_token_error()
    return ServiceTokenClaims(
        issuer=payload["iss"].strip(),
        audience=payload["aud"].strip(),
        subject=payload["sub"].strip(),
        tenant_id=payload["tenant_id"].strip(),
        scopes=normalized_scopes,
        jti=payload["jti"].strip(),
        issued_at=payload["iat"],
        expires_at=payload["exp"],
        not_before=payload["nbf"],
        user_id=payload.get("user_id") if isinstance(payload.get("user_id"), str) else None,
        trace_id=payload.get("trace_id") if isinstance(payload.get("trace_id"), str) else None,
        correlation_id=(
            payload.get("correlation_id") if isinstance(payload.get("correlation_id"), str) else None
        ),
    )


def _split_token(token: str) -> tuple[str, str, str]:
    parts = token.split(".")
    if len(parts) != 3 or not all(parts):
        raise _invalid_token_error()
    return parts[0], parts[1], parts[2]


def _decode_json_part(value: str) -> dict[str, Any]:
    try:
        decoded = base64.urlsafe_b64decode(value + ("=" * (-len(value) % 4)))
        parsed = json.loads(decoded)
    except (ValueError, TypeError):
        raise _invalid_token_error() from None
    if not isinstance(parsed, dict):
        raise _invalid_token_error()
    return parsed


def _sign(signing_input: str, signing_secret: str) -> str:
    signature = hmac.new(
        signing_secret.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")


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


def _invalid_token_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid service token.",
        headers={"WWW-Authenticate": "Bearer"},
    )
