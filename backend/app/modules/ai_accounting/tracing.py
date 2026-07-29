"""Soft OpenTelemetry / no-op span helper for Lakodi AI accounting."""

from __future__ import annotations

import logging
import os
import sys
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from typing import Any

from backend.app.modules.ai_accounting.logging_util import log_event

logger = logging.getLogger("lakodi.ai_accounting")
_TRACING_CONFIGURED = False
_FASTAPI_INSTRUMENTED = False


def configure_tracing(*, service_name: str = "lakodi") -> bool:
    """Configure OTLP exporter when endpoint env is set. Never raises."""

    global _TRACING_CONFIGURED
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
    if not endpoint:
        _TRACING_CONFIGURED = False
        return False
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        logger.info("opentelemetry packages unavailable for Lakodi")
        _TRACING_CONFIGURED = False
        return False
    try:
        resource = Resource.create({"service.name": service_name})
        provider = TracerProvider(resource=resource)
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
        trace.set_tracer_provider(provider)
        _TRACING_CONFIGURED = True
        logger.info("Lakodi OpenTelemetry configured service=%s", service_name)
        return True
    except Exception:
        logger.warning("Lakodi OpenTelemetry setup failed", exc_info=True)
        _TRACING_CONFIGURED = False
        return False


def instrument_fastapi_app(application: Any) -> bool:
    """Instrument FastAPI so inbound W3C traceparent continues the parent trace."""

    global _FASTAPI_INSTRUMENTED
    if not _TRACING_CONFIGURED or _FASTAPI_INSTRUMENTED:
        return _FASTAPI_INSTRUMENTED
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(application)
        _FASTAPI_INSTRUMENTED = True
        return True
    except Exception:
        logger.warning("Lakodi FastAPI OTEL instrumentation failed", exc_info=True)
        return False


def configure_json_logging_if_requested() -> None:
    """Emit one-line JSON logs when LAKODI_JSON_LOGS=true (local-demo Promtail)."""

    if os.getenv("LAKODI_JSON_LOGS", "").strip().lower() not in {"1", "true", "yes"}:
        return
    import json
    import logging as std_logging

    class JsonFormatter(std_logging.Formatter):
        def format(self, record: std_logging.LogRecord) -> str:
            payload = {
                "severity": record.levelname.lower(),
                "level": record.levelname,
                "message": record.getMessage(),
                "logger": record.name,
                "event_name": getattr(record, "event_name", None),
                "correlation_id": getattr(record, "correlation_id", None),
                "service": "lakodi",
            }
            # Include non-standard extras when present.
            for key in (
                "tenant_id",
                "execution_id",
                "proposal_id",
                "trace_id",
                "span_name",
            ):
                value = getattr(record, key, None)
                if value is not None:
                    payload[key] = value
            return json.dumps(
                {k: v for k, v in payload.items() if v is not None},
                ensure_ascii=False,
                default=str,
            )

    handler = std_logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = std_logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(std_logging.INFO)
    std_logging.getLogger("lakodi.ai_accounting").setLevel(std_logging.INFO)


@contextmanager
def attach_trace_context(carrier: Mapping[str, Any] | None) -> Iterator[None]:
    """Extract W3C context from inbound headers when packages are present."""

    if not _TRACING_CONFIGURED or not carrier:
        yield
        return
    try:
        from opentelemetry import context as otel_context
        from opentelemetry.propagate import extract

        normalized = {
            str(key).lower(): str(value)
            for key, value in carrier.items()
            if value is not None and str(value).strip()
        }
        token = otel_context.attach(extract(normalized))
        try:
            yield
        finally:
            otel_context.detach(token)
    except Exception:
        yield


@contextmanager
def business_span(name: str, **attributes: Any) -> Iterator[None]:
    """OpenTelemetry business span with safe no-op fallback.

    Tracing setup failures are handled before the managed body starts.
    Exceptions raised inside the ``with`` block are never caught here, so
    callers (including FastAPI ``HTTPException``) propagate unchanged.
    Exactly one ``yield`` runs per invocation.
    """

    attrs = dict(attributes)
    try:
        from backend.app.modules.ai_accounting.correlation import (
            get_correlation_context,
        )

        ctx = get_correlation_context()
        if ctx is not None:
            attrs.setdefault("correlation_id", ctx.correlation_id)
            if ctx.trace_id:
                attrs.setdefault("trace_id", ctx.trace_id)
    except Exception:
        pass

    otel_cm: Any | None
    try:
        from opentelemetry import trace  # type: ignore

        tracer = trace.get_tracer("lakodi.ai_accounting")
        otel_cm = tracer.start_as_current_span(name)
    except Exception:
        otel_cm = None

    if otel_cm is None:
        log_event(
            "observability.span.local",
            f"local span {name}",
            span_name=name,
            **{k: v for k, v in attrs.items() if v is not None},
        )
        yield
        return

    try:
        span = otel_cm.__enter__()
    except Exception:
        log_event(
            "observability.span.local",
            f"local span {name}",
            span_name=name,
            **{k: v for k, v in attrs.items() if v is not None},
        )
        yield
        return

    try:
        if span is not None:
            for key, value in attrs.items():
                if value is None:
                    continue
                try:
                    span.set_attribute(key, value)
                except Exception:
                    logger.debug(
                        "business_span attribute set failed name=%s key=%s",
                        name,
                        key,
                        exc_info=True,
                    )
        yield
    except BaseException:
        try:
            otel_cm.__exit__(*sys.exc_info())
        except Exception:
            logger.debug("business_span exit failed name=%s", name, exc_info=True)
        raise
    else:
        try:
            otel_cm.__exit__(None, None, None)
        except Exception:
            logger.debug("business_span exit failed name=%s", name, exc_info=True)
