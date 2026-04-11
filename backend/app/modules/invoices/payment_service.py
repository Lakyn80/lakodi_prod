"""Platební nastavení, snapshoty a QR Platba/SPAYD generátor pro faktury."""
from __future__ import annotations

import os
import re
import unicodedata
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib.units import mm
from sqlalchemy.orm import Session

from backend.app.modules.invoices.models import InvoiceSettings

DEFAULT_OWNER_EMAIL = os.getenv("INVOICE_OWNER_EMAIL", os.getenv("ADMIN_EMAIL", "lakodi@seznam.cz")).strip()
DEFAULT_PAYMENT_METHOD = os.getenv("INVOICE_PAYMENT_METHOD", "Převodem").strip() or "Převodem"
DEFAULT_BANK_ACCOUNT_NUMBER = os.getenv("INVOICE_BANK_ACCOUNT_NUMBER", "5997826359").strip() or "5997826359"
DEFAULT_BANK_ACCOUNT_PREFIX = os.getenv("INVOICE_BANK_ACCOUNT_PREFIX", "").strip() or None
DEFAULT_BANK_CODE = os.getenv("INVOICE_BANK_CODE", "0800").strip() or "0800"
DEFAULT_BANK_IBAN = os.getenv("INVOICE_BANK_IBAN", "").strip()
SETTINGS_ROW_ID = 1


class InvoicePaymentError(ValueError):
    """Neplatná platební konfigurace pro fakturu."""


@dataclass(frozen=True)
class PaymentProfile:
    payment_method: str
    account_number: str
    account_prefix: str | None
    bank_code: str
    iban: str

    @property
    def account_label(self) -> str:
        if self.account_prefix:
            return f"{self.account_prefix}-{self.account_number}/{self.bank_code}"
        return f"{self.account_number}/{self.bank_code}"


@dataclass(frozen=True)
class InvoicePaymentSettingsProfile:
    owner_email: str
    payment_profile: PaymentProfile


def get_default_payment_profile() -> PaymentProfile:
    return _build_payment_profile(
        payment_method=DEFAULT_PAYMENT_METHOD,
        account_number=DEFAULT_BANK_ACCOUNT_NUMBER,
        account_prefix=DEFAULT_BANK_ACCOUNT_PREFIX,
        bank_code=DEFAULT_BANK_CODE,
        iban=DEFAULT_BANK_IBAN or None,
    )


def get_default_payment_settings_profile() -> InvoicePaymentSettingsProfile:
    return InvoicePaymentSettingsProfile(
        owner_email=_normalize_email(DEFAULT_OWNER_EMAIL, "E-mail majitele"),
        payment_profile=get_default_payment_profile(),
    )


def get_invoice_settings_profile(db: Session) -> InvoicePaymentSettingsProfile:
    settings_row = _get_settings_row(db)
    if settings_row is None:
        return get_default_payment_settings_profile()
    return _map_settings_row(settings_row)


def update_invoice_settings_profile(
    db: Session,
    *,
    owner_email: str,
    payment_method: str,
    account_number: str,
    account_prefix: str | None,
    bank_code: str,
    iban: str | None,
) -> InvoicePaymentSettingsProfile:
    settings_row = _get_settings_row(db)
    if settings_row is None:
        settings_row = InvoiceSettings(id=SETTINGS_ROW_ID)
        db.add(settings_row)

    normalized_profile = InvoicePaymentSettingsProfile(
        owner_email=_normalize_email(owner_email, "E-mail majitele"),
        payment_profile=_build_payment_profile(
            payment_method=payment_method,
            account_number=account_number,
            account_prefix=account_prefix,
            bank_code=bank_code,
            iban=iban,
        ),
    )
    settings_row.owner_email = normalized_profile.owner_email
    settings_row.payment_method = normalized_profile.payment_profile.payment_method
    settings_row.bank_account_number = normalized_profile.payment_profile.account_number
    settings_row.bank_account_prefix = normalized_profile.payment_profile.account_prefix
    settings_row.bank_code = normalized_profile.payment_profile.bank_code
    settings_row.bank_iban = normalized_profile.payment_profile.iban
    db.commit()
    db.refresh(settings_row)
    return _map_settings_row(settings_row)


def build_czech_iban(*, account_number: str, bank_code: str, account_prefix: str | None = None) -> str:
    normalized_account = _require_digits(account_number, "Číslo účtu").zfill(10)
    normalized_prefix = (account_prefix or "").zfill(6)
    normalized_bank_code = _require_digits(bank_code, "Kód banky").zfill(4)
    bban = f"{normalized_bank_code}{normalized_prefix}{normalized_account}"
    check_digits = _compute_iban_check_digits(country_code="CZ", bban=bban)
    return f"CZ{check_digits}{bban}"


def build_qr_payment_payload(
    *,
    iban: str,
    amount: Decimal,
    currency: str,
    variable_symbol: str,
    invoice_number: str,
    due_date: date | None,
) -> str:
    normalized_currency = (currency or "CZK").strip().upper()
    if not normalized_currency:
        raise InvoicePaymentError("Měna pro QR platbu chybí.")
    payload_parts = [
        "SPD*1.0",
        f"ACC:{_normalize_iban(iban)}",
        f"AM:{Decimal(amount):.2f}",
        f"CC:{normalized_currency}",
        f"X-VS:{_require_digits(variable_symbol, 'Variabilní symbol')}",
    ]
    if due_date is not None:
        payload_parts.append(f"DT:{due_date.strftime('%Y%m%d')}")
    message = _normalize_qr_message(f"FA {invoice_number}")
    if message:
        payload_parts.append(f"MSG:{message}")
    return "*".join(payload_parts)


def build_qr_code_drawing(payload: str, *, size_mm: float = 32.0) -> Drawing:
    qr_code = qr.QrCodeWidget(payload, barLevel="M", barBorder=0)
    min_x, min_y, max_x, max_y = qr_code.getBounds()
    qr_width = max_x - min_x
    qr_height = max_y - min_y
    drawing = Drawing(
        size_mm * mm,
        size_mm * mm,
        transform=[size_mm * mm / qr_width, 0, 0, size_mm * mm / qr_height, 0, 0],
    )
    drawing.add(qr_code)
    return drawing


def _get_settings_row(db: Session) -> InvoiceSettings | None:
    return db.query(InvoiceSettings).filter(InvoiceSettings.id == SETTINGS_ROW_ID).first()


def _map_settings_row(settings_row: InvoiceSettings) -> InvoicePaymentSettingsProfile:
    return InvoicePaymentSettingsProfile(
        owner_email=_normalize_email(settings_row.owner_email, "E-mail majitele"),
        payment_profile=_build_payment_profile(
            payment_method=settings_row.payment_method,
            account_number=settings_row.bank_account_number,
            account_prefix=settings_row.bank_account_prefix,
            bank_code=settings_row.bank_code,
            iban=settings_row.bank_iban,
        ),
    )


def _build_payment_profile(
    *,
    payment_method: str,
    account_number: str,
    account_prefix: str | None,
    bank_code: str,
    iban: str | None,
) -> PaymentProfile:
    normalized_payment_method = _normalize_required_text(payment_method, "Způsob platby", max_length=64)
    normalized_account_number = _require_digits(account_number, "Číslo účtu")
    normalized_account_prefix = _normalize_optional_digits(account_prefix, "Předčíslí účtu")
    normalized_bank_code = _require_digits(bank_code, "Kód banky")
    normalized_iban = _normalize_iban(iban) if iban else build_czech_iban(
        account_number=normalized_account_number,
        bank_code=normalized_bank_code,
        account_prefix=normalized_account_prefix,
    )
    return PaymentProfile(
        payment_method=normalized_payment_method,
        account_number=normalized_account_number,
        account_prefix=normalized_account_prefix,
        bank_code=normalized_bank_code,
        iban=normalized_iban,
    )


def _compute_iban_check_digits(*, country_code: str, bban: str) -> str:
    rearranged = f"{bban}{country_code}00"
    converted = "".join(
        str(ord(char) - 55) if char.isalpha() else char
        for char in rearranged.upper()
    )
    check_value = 98 - (int(converted) % 97)
    return f"{check_value:02d}"


def _normalize_qr_message(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    sanitized = re.sub(r"[^A-Z0-9 ./,:()+?-]", " ", ascii_text.upper())
    sanitized = re.sub(r"\s+", " ", sanitized).strip()
    return sanitized[:60]


def _normalize_email(value: str, label: str) -> str:
    cleaned = (value or "").strip().lower()
    if not cleaned:
        raise InvoicePaymentError(f"{label} chybí.")
    if "@" not in cleaned or "." not in cleaned.split("@")[-1]:
        raise InvoicePaymentError(f"{label} není platný.")
    return cleaned


def _normalize_required_text(value: str, label: str, *, max_length: int) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise InvoicePaymentError(f"{label} chybí.")
    if len(cleaned) > max_length:
        raise InvoicePaymentError(f"{label} může mít maximálně {max_length} znaků.")
    return cleaned


def _normalize_iban(value: str | None) -> str:
    cleaned = re.sub(r"\s+", "", str(value or "").upper())
    if not cleaned:
        raise InvoicePaymentError("IBAN chybí.")
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{1,30}", cleaned):
        raise InvoicePaymentError("IBAN není platný.")
    if len(cleaned) > 34:
        raise InvoicePaymentError("IBAN může mít maximálně 34 znaků.")
    return cleaned


def _require_digits(value: str, label: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise InvoicePaymentError(f"{label} chybí.")
    if not cleaned.isdigit():
        raise InvoicePaymentError(f"{label} může obsahovat pouze číslice.")
    return cleaned


def _normalize_optional_digits(value: str | None, label: str) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    return _require_digits(cleaned, label)
