"""Soft OpenTelemetry / no-op span helper for Lakodi AI accounting."""

from __future__ import annotations

import logging
import os
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from backend.app.modules.ai_accounting.logging_util import log_event

logger = logging.getLogger("lakodi.ai_accounting")
_TRACING_CONFIGURED = False


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
