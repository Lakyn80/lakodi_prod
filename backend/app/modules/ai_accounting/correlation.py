"""Correlation context for Lakodi AI accounting internal routes."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from contextvars import ContextVar, Token
from dataclasses import asdict, dataclass, replace
from typing import Any, Iterator

_context: ContextVar[CorrelationContext | None] = ContextVar(
    "lakodi_ai_accounting_correlation",
    default=None,
)


@dataclass(frozen=True, slots=True)
class CorrelationContext:
    correlation_id: str
    request_id: str
    tenant_id: str | None = None
    trace_id: str | None = None
    execution_id: str | None = None
    service: str = "lakodi"

    def as_log_fields(self) -> dict[str, Any]:
        return {key: value for key, value in asdict(self).items() if value is not None}

    def with_updates(self, **kwargs: Any) -> CorrelationContext:
        return replace(self, **kwargs)


def new_id(prefix: str = "") -> str:
    value = uuid.uuid4().hex
    return f"{prefix}{value}" if prefix else value


def get_correlation_context() -> CorrelationContext | None:
    return _context.get()


def bind_correlation_context(ctx: CorrelationContext) -> Token[CorrelationContext | None]:
    return _context.set(ctx)


def reset_correlation_context(token: Token[CorrelationContext | None] | None = None) -> None:
    if token is not None:
        _context.reset(token)
    else:
        _context.set(None)


def clear_correlation_context() -> None:
    _context.set(None)


@contextmanager
def correlation_scope(ctx: CorrelationContext) -> Iterator[CorrelationContext]:
    token = bind_correlation_context(ctx)
    try:
        yield ctx
    finally:
        reset_correlation_context(token)


def build_context(
    *,
    correlation_id: str | None = None,
    trace_id: str | None = None,
    tenant_id: str | None = None,
    execution_id: str | None = None,
    request_id: str | None = None,
) -> CorrelationContext:
    return CorrelationContext(
        correlation_id=correlation_id or new_id("corr-"),
        request_id=request_id or new_id("req-"),
        tenant_id=tenant_id,
        trace_id=trace_id,
        execution_id=execution_id,
        service="lakodi",
    )
