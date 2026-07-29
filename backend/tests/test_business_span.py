"""Focused unit tests for business_span context-manager semantics."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from backend.app.modules.ai_accounting.tracing import business_span


def test_business_span_normal_body_completes() -> None:
    seen: list[str] = []
    with business_span("test.ok", accounting_action="read"):
        seen.append("body")
    assert seen == ["body"]


def test_business_span_http_409_propagates_unchanged() -> None:
    with pytest.raises(HTTPException) as exc_info:
        with business_span("test.conflict"):
            raise HTTPException(status_code=409, detail="Idempotency conflict.")
    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Idempotency conflict."


def test_business_span_http_422_propagates_unchanged() -> None:
    with pytest.raises(HTTPException) as exc_info:
        with business_span("test.unprocessable"):
            raise HTTPException(
                status_code=422,
                detail="This endpoint accepts only status=draft.",
            )
    assert exc_info.value.status_code == 422
    assert "status=draft" in str(exc_info.value.detail)


def test_business_span_arbitrary_exception_propagates() -> None:
    with pytest.raises(RuntimeError, match="boom"):
        with business_span("test.arbitrary"):
            raise RuntimeError("boom")


def test_business_span_missing_otel_still_runs_body(monkeypatch: pytest.MonkeyPatch) -> None:
    import builtins

    real_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "opentelemetry" or name.startswith("opentelemetry."):
            raise ImportError("otel unavailable for test")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    seen: list[str] = []
    with business_span("test.no_otel"):
        seen.append("ran")
    assert seen == ["ran"]


def test_business_span_tracer_init_failure_still_runs_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import opentelemetry.trace as otel_trace

    monkeypatch.setattr(
        otel_trace,
        "get_tracer",
        MagicMock(side_effect=RuntimeError("tracer broken")),
    )
    seen: list[str] = []
    with business_span("test.tracer_fail"):
        seen.append("ran")
    assert seen == ["ran"]


def test_business_span_attribute_failure_does_not_double_yield(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import opentelemetry.trace as otel_trace

    span = MagicMock()
    span.set_attribute.side_effect = RuntimeError("attr failed")
    span_cm = MagicMock()
    span_cm.__enter__.return_value = span
    span_cm.__exit__.return_value = None
    monkeypatch.setattr(
        otel_trace,
        "get_tracer",
        MagicMock(
            return_value=SimpleNamespace(
                start_as_current_span=MagicMock(return_value=span_cm)
            )
        ),
    )

    runs: list[int] = []
    with business_span("test.attr_fail", foo="bar"):
        runs.append(1)
    assert runs == [1]
    span_cm.__enter__.assert_called_once()
    span_cm.__exit__.assert_called_once()


def test_business_span_body_runs_exactly_once_on_http_exception() -> None:
    runs: list[int] = []
    with pytest.raises(HTTPException) as exc_info:
        with business_span("test.once"):
            runs.append(1)
            raise HTTPException(status_code=409, detail="Idempotency conflict.")
    assert runs == [1]
    assert exc_info.value.status_code == 409


def test_business_span_never_raises_generator_protocol_error() -> None:
    with pytest.raises(HTTPException) as exc_info:
        with business_span("test.protocol"):
            raise HTTPException(status_code=422, detail="draft only")
    assert "generator didn't stop" not in repr(exc_info.value)
    assert exc_info.value.__cause__ is None or "generator didn't stop" not in str(
        exc_info.value.__cause__
    )
    assert exc_info.value.status_code == 422
