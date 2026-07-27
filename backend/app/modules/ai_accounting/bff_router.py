"""Admin BFF for AI Agent Accounting (mint host JWT + proxy chat/actions)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend.app.modules.ai_accounting.bff_client import proxy_ai_request
from backend.app.modules.ai_accounting.host_auth import mint_host_ai_token, require_admin_user_id

router = APIRouter()


class ChatMessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    language: str | None = Field(default="cs", max_length=16)
    conversation_id: str | None = Field(default=None, max_length=128)


class ActionDecisionRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


def _forward_response(upstream) -> Response:
    content_type = upstream.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            payload = upstream.json()
        except ValueError:
            raise HTTPException(status_code=502, detail="AI agent returned invalid JSON.") from None
        return JSONResponse(content=payload, status_code=upstream.status_code)
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=content_type or "application/octet-stream",
    )


def _require_idempotency_key(value: str | None, *, generate_if_missing: bool = False) -> str:
    cleaned = (value or "").strip()
    if cleaned:
        if len(cleaned) < 8 or len(cleaned) > 160:
            raise HTTPException(
                status_code=400,
                detail="Idempotency-Key must be between 8 and 160 characters.",
            )
        return cleaned
    if generate_if_missing:
        return f"lakodi-{uuid.uuid4().hex}"
    raise HTTPException(status_code=400, detail="Idempotency-Key header is required.")


@router.post("/chat/messages")
def admin_ai_chat_message(
    body: ChatMessageRequest,
    user_id: int = Depends(require_admin_user_id),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> Response:
    token = mint_host_ai_token(user_id=user_id)
    key = _require_idempotency_key(idempotency_key, generate_if_missing=True)
    payload: dict[str, Any] = {"text": body.text.strip()}
    if body.language:
        payload["language"] = body.language.strip()
    if body.conversation_id:
        payload["conversation_id"] = body.conversation_id.strip()
    upstream = proxy_ai_request(
        method="POST",
        path="/api/v1/chat/messages",
        bearer_token=token,
        json_body=payload,
        idempotency_key=key,
    )
    return _forward_response(upstream)


@router.get("/conversations/{conversation_id}")
def admin_ai_get_conversation(
    conversation_id: str,
    user_id: int = Depends(require_admin_user_id),
) -> Response:
    token = mint_host_ai_token(user_id=user_id)
    upstream = proxy_ai_request(
        method="GET",
        path=f"/api/v1/conversations/{conversation_id}",
        bearer_token=token,
    )
    return _forward_response(upstream)


@router.get("/conversations/{conversation_id}/messages")
def admin_ai_list_conversation_messages(
    conversation_id: str,
    user_id: int = Depends(require_admin_user_id),
) -> Response:
    token = mint_host_ai_token(user_id=user_id)
    upstream = proxy_ai_request(
        method="GET",
        path=f"/api/v1/conversations/{conversation_id}/messages",
        bearer_token=token,
    )
    return _forward_response(upstream)


@router.get("/actions/{action_id}")
def admin_ai_get_action(
    action_id: str,
    user_id: int = Depends(require_admin_user_id),
) -> Response:
    token = mint_host_ai_token(user_id=user_id)
    upstream = proxy_ai_request(
        method="GET",
        path=f"/api/v1/actions/{action_id}",
        bearer_token=token,
    )
    return _forward_response(upstream)


@router.post("/actions/{action_id}/approve")
def admin_ai_approve_action(
    action_id: str,
    body: ActionDecisionRequest | None = None,
    user_id: int = Depends(require_admin_user_id),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> Response:
    token = mint_host_ai_token(user_id=user_id)
    key = _require_idempotency_key(idempotency_key, generate_if_missing=False)
    payload = {"reason": body.reason} if body and body.reason else None
    upstream = proxy_ai_request(
        method="POST",
        path=f"/api/v1/actions/{action_id}/approve",
        bearer_token=token,
        json_body=payload or {},
        idempotency_key=key,
    )
    return _forward_response(upstream)


@router.post("/actions/{action_id}/reject")
def admin_ai_reject_action(
    action_id: str,
    body: ActionDecisionRequest | None = None,
    user_id: int = Depends(require_admin_user_id),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> Response:
    token = mint_host_ai_token(user_id=user_id)
    key = _require_idempotency_key(idempotency_key, generate_if_missing=True)
    payload = {"reason": body.reason} if body and body.reason else {}
    upstream = proxy_ai_request(
        method="POST",
        path=f"/api/v1/actions/{action_id}/reject",
        bearer_token=token,
        json_body=payload,
        idempotency_key=key,
    )
    return _forward_response(upstream)


@router.get("/health")
def admin_ai_platform_health(user_id: int = Depends(require_admin_user_id)) -> Response:
    # Health is public on the AI platform; still require Lakodi admin session.
    _ = user_id
    upstream = proxy_ai_request(method="GET", path="/health")
    return _forward_response(upstream)
