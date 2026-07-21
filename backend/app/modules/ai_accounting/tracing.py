"""Soft OpenTelemetry / no-op span helper for Lakodi AI accounting."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

from backend.app.modules.ai_accounting.logging_util import log_event


@contextmanager
def business_span(name: str, **attributes: Any) -> Iterator[None]:
    try:
        from opentelemetry import trace  # type: ignore

        tracer = trace.get_tracer("lakodi.ai_accounting")
        with tracer.start_as_current_span(name) as span:
            for key, value in attributes.items():
                if value is None:
                    continue
                span.set_attribute(key, value)
            yield
        return
    except Exception:
        log_event(
            "observability.span.local",
            f"local span {name}",
            span_name=name,
            **{k: v for k, v in attributes.items() if v is not None},
        )
        yield
