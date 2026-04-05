"""Redis-backed cache helpers for invoices."""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel

from backend.app.modules.invoices.exporters import InvoiceExportDTO

try:
    import redis
except ImportError:  # pragma: no cover - optional dependency in local test env
    redis = None


LOGGER = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "").strip()
INVOICE_CACHE_TTL_SECONDS = int(os.getenv("INVOICE_CACHE_TTL_SECONDS", str(60 * 60 * 24 * 30)))
INVOICE_CUSTOMER_CACHE_TTL_SECONDS = int(
    os.getenv("INVOICE_CUSTOMER_CACHE_TTL_SECONDS", str(60 * 60 * 24 * 90))
)
INVOICE_CACHE_PREFIX = "invoice"
INVOICE_CUSTOMER_CACHE_PREFIX = "invoice_customer"


class InvoiceCustomerCacheProfile(BaseModel):
    customer_name: str
    customer_email: str
    customer_phone: str | None
    customer_address: str | None
    customer_ico: str | None
    customer_dic: str | None
    last_invoice_id: int
    updated_at: datetime


class InvoiceCacheService:
    def __init__(self, client: Any | None = None):
        self._client = client

    def cache_invoice_detail(self, export_dto: InvoiceExportDTO) -> bool:
        return self._write_json(
            key=self._invoice_key(export_dto.id),
            payload=export_dto.model_dump(mode="json"),
            ttl_seconds=INVOICE_CACHE_TTL_SECONDS,
        )

    def cache_customer_profile(self, export_dto: InvoiceExportDTO) -> bool:
        profile = InvoiceCustomerCacheProfile(
            customer_name=export_dto.customer.name,
            customer_email=export_dto.customer.email,
            customer_phone=export_dto.customer.phone,
            customer_address=export_dto.customer.address,
            customer_ico=export_dto.customer.ico,
            customer_dic=export_dto.customer.dic,
            last_invoice_id=export_dto.id,
            updated_at=export_dto.created_at or datetime.now(timezone.utc),
        )
        return self._write_json(
            key=self._customer_key(profile),
            payload=profile.model_dump(mode="json"),
            ttl_seconds=INVOICE_CUSTOMER_CACHE_TTL_SECONDS,
        )

    def _write_json(self, *, key: str, payload: dict[str, Any], ttl_seconds: int) -> bool:
        client = self._get_client()
        if client is None:
            return False
        try:
            client.setex(key, ttl_seconds, json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
            return True
        except Exception:
            LOGGER.warning("Invoice cache write failed for key %s.", key, exc_info=True)
            return False

    def _get_client(self):
        if self._client is not None:
            return self._client
        if not REDIS_URL or redis is None:
            return None
        try:
            self._client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        except Exception:
            LOGGER.warning("Invoice cache client initialization failed.", exc_info=True)
            return None
        return self._client

    @staticmethod
    def _invoice_key(invoice_id: int) -> str:
        return f"{INVOICE_CACHE_PREFIX}:{invoice_id}"

    @staticmethod
    def _customer_key(profile: InvoiceCustomerCacheProfile) -> str:
        normalized_key = normalize_customer_cache_key(
            customer_name=profile.customer_name,
            customer_email=profile.customer_email,
            customer_ico=profile.customer_ico,
        )
        return f"{INVOICE_CUSTOMER_CACHE_PREFIX}:{normalized_key}"


def get_invoice_cache_service() -> InvoiceCacheService:
    return InvoiceCacheService()


def normalize_customer_cache_key(*, customer_name: str, customer_email: str, customer_ico: str | None) -> str:
    if customer_ico:
        return f"ico:{_slug(customer_ico)}"
    if customer_email:
        return f"email:{_slug(customer_email.lower())}"
    return f"name:{_slug(customer_name.lower())}"


def _slug(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return normalized or "unknown"
