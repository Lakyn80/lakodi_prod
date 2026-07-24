"""HTTP client that proxies admin BFF calls to the AI Agent Accounting API."""

from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import HTTPException, status


def get_ai_agent_base_url() -> str:
    base_url = (os.getenv("AI_AGENT_BASE_URL") or "").strip().rstrip("/")
    if not base_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI agent platform URL is not configured.",
        )
    return base_url


def get_ai_agent_timeout_seconds() -> float:
    raw = (os.getenv("AI_AGENT_TIMEOUT_SECONDS") or "60").strip()
    try:
        value = float(raw)
    except ValueError:
        return 60.0
    return max(5.0, min(120.0, value))


def proxy_ai_request(
    *,
    method: str,
    path: str,
    bearer_token: str | None = None,
    json_body: dict[str, Any] | None = None,
    idempotency_key: str | None = None,
    params: dict[str, Any] | None = None,
) -> httpx.Response:
    """Forward a request to the AI platform. Caller maps the response to FastAPI."""
    url = f"{get_ai_agent_base_url()}{path}"
    headers = {"Accept": "application/json"}
    if bearer_token:
        headers["Authorization"] = f"Bearer {bearer_token}"
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    timeout = get_ai_agent_timeout_seconds()
    try:
        with httpx.Client(timeout=timeout) as client:
            return client.request(
                method=method.upper(),
                url=url,
                headers=headers,
                json=json_body,
                params=params,
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="AI agent platform timed out.",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI agent platform is unreachable.",
        ) from exc
