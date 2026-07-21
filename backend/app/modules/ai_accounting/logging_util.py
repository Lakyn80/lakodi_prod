"""Structured logging helpers for Lakodi AI accounting (secret-safe)."""

from __future__ import annotations

import logging
import re
from typing import Any

from backend.app.modules.ai_accounting.correlation import get_correlation_context

logger = logging.getLogger("lakodi.ai_accounting")

_SENSITIVE_RE = re.compile(
    r"(secret|password|token|authorization|api[_-]?key|bearer|signing)",
    re.IGNORECASE,
)
REDACTED = "[REDACTED]"


def _redact_mapping(payload: dict[str, Any]) -> dict[str, Any]:
    safe: dict[str, Any] = {}
    for key, value in payload.items():
        if _SENSITIVE_RE.search(str(key)):
            safe[key] = REDACTED
        elif isinstance(value, dict):
            safe[key] = _redact_mapping(value)
        elif isinstance(value, str) and value.lower().startswith("bearer "):
            safe[key] = f"Bearer {REDACTED}"
        else:
            safe[key] = value
    return safe


def log_event(event_name: str, message: str, **fields: Any) -> None:
    payload: dict[str, Any] = {"event_name": event_name, **fields}
    ctx = get_correlation_context()
    if ctx is not None:
        payload.update(ctx.as_log_fields())
    logger.info(message, extra=_redact_mapping(payload))
