"""Platební, firemní a výchozí invoice settings + QR Platba/SPAYD generátor."""
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
DEFAULT_ISSUER_NAME = os.getenv("INVOICE_ISSUER_NAME", "lakodi s.r.o.").strip() or "lakodi s.r.o."
DEFAULT_ISSUER_ADDRESS = os.getenv(
    "INVOICE_ISSUER_ADDRESS",
    "Jaurisova 515/4, Michle, 140 00 Praha",
).strip() or "Jaurisova 515/4, Michle, 140 00 Praha"
DEFAULT_ISSUER_CITY = os.getenv("INVOICE_ISSUER_CITY", "Praha").strip() or "Praha"
DEFAULT_ISSUER_ZIP = os.getenv("INVOICE_ISSUER_ZIP", "140 00").strip() or "140 00"
DEFAULT_ISSUER_ICO = os.getenv("INVOICE_ISSUER_ICO", "09695982").strip() or "09695982"
DEFAULT_ISSUER_DIC = os.getenv("INVOICE_ISSUER_DIC", "CZ09695982").strip() or "CZ09695982"
DEFAULT_ISSUER_DATA_BOX = os.getenv("INVOICE_ISSUER_DATA_BOX", "wzzs5bi").strip() or None
DEFAULT_ISSUER_EMAIL = os.getenv("INVOICE_ISSUER_EMAIL", "").strip() or None
DEFAULT_ISSUER_PHONE = os.getenv("INVOICE_ISSUER_PHONE", "").strip() or None
DEFAULT_CURRENCY = os.getenv("INVOICE_DEFAULT_CURRENCY", "CZK").strip() or "CZK"
DEFAULT_DUE_DAYS = int(os.getenv("INVOICE_DEFAULT_DUE_DAYS", "14") or "14")
DEFAULT_NOTE = os.getenv("INVOICE_DEFAULT_NOTE", "").strip() or None
SETTINGS_ROW_ID = 1


class InvoicePaymentError(ValueError):
    """Neplatná fakturační konfigurace."""


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
class IssuerProfile:
    company_name: str
    company_address: str
    company_city: str
    company_zip: str
    company_ico: str
    company_dic: str
    company_data_box: str | None
    company_email: str | None
    company_phone: str | None


@dataclass(frozen=True)
class InvoiceDefaultsProfile:
    default_currency: str
    default_due_days: int
    default_note: str | None


@dataclass(frozen=True)
class InvoicePaymentSettingsProfile:
    owner_email: str
    payment_profile: PaymentProfile
    issuer_profile: IssuerProfile
    invoice_defaults: InvoiceDefaultsProfile


def get_default_payment_profile() -> PaymentProfile:
    return _build_payment_profile(
        payment_method=DEFAULT_PAYMENT_METHOD,
        account_number=DEFAULT_BANK_ACCOUNT_NUMBER,
        account_prefix=DEFAULT_BANK_ACCOUNT_PREFIX,
        bank_code=DEFAULT_BANK_CODE,
        iban=DEFAULT_BANK_IBAN or None,
    )


def get_default_issuer_profile() -> IssuerProfile:
    return _build_issuer_profile(
        issuer_name=DEFAULT_ISSUER_NAME,
        issuer_address=DEFAULT_ISSUER_ADDRESS,
        issuer_city=DEFAULT_ISSUER_CITY,
        issuer_zip=DEFAULT_ISSUER_ZIP,
        issuer_ico=DEFAULT_ISSUER_ICO,
        issuer_dic=DEFAULT_ISSUER_DIC,
        issuer_data_box=DEFAULT_ISSUER_DATA_BOX,
        issuer_email=DEFAULT_ISSUER_EMAIL,
        issuer_phone=DEFAULT_ISSUER_PHONE,
    )


def get_default_invoice_defaults_profile() -> InvoiceDefaultsProfile:
    return InvoiceDefaultsProfile(
        default_currency=_normalize_currency(DEFAULT_CURRENCY),
        default_due_days=_normalize_due_days(DEFAULT_DUE_DAYS),
        default_note=_normalize_optional_text(DEFAULT_NOTE, "Výchozí poznámka", max_length=4000),
    )


def get_default_payment_settings_profile() -> InvoicePaymentSettingsProfile:
    return InvoicePaymentSettingsProfile(
        owner_email=_normalize_email(DEFAULT_OWNER_EMAIL, "E-mail majitele"),
        payment_profile=get_default_payment_profile(),
        issuer_profile=get_default_issuer_profile(),
        invoice_defaults=get_default_invoice_defaults_profile(),
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
    issuer_name: str | None = None,
    issuer_address: str | None = None,
    issuer_city: str | None = None,
    issuer_zip: str | None = None,
    issuer_ico: str | None = None,
    issuer_dic: str | None = None,
    issuer_data_box: str | None = None,
    issuer_email: str | None = None,
    issuer_phone: str | None = None,
    default_currency: str | None = None,
    default_due_days: int | None = None,
    default_note: str | None = None,
) -> InvoicePaymentSettingsProfile:
    settings_row = _get_settings_row(db)
    current_profile = _map_settings_row(settings_row) if settings_row is not None else get_default_payment_settings_profile()
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
        issuer_profile=_build_issuer_profile(
            issuer_name=issuer_name or current_profile.issuer_profile.company_name,
            issuer_address=issuer_address or current_profile.issuer_profile.company_address,
            issuer_city=issuer_city or current_profile.issuer_profile.company_city,
            issuer_zip=issuer_zip or current_profile.issuer_profile.company_zip,
            issuer_ico=issuer_ico or current_profile.issuer_profile.company_ico,
            issuer_dic=issuer_dic or current_profile.issuer_profile.company_dic,
            issuer_data_box=issuer_data_box if issuer_data_box is not None else current_profile.issuer_profile.company_data_box,
            issuer_email=issuer_email if issuer_email is not None else current_profile.issuer_profile.company_email,
            issuer_phone=issuer_phone if issuer_phone is not None else current_profile.issuer_profile.company_phone,
        ),
        invoice_defaults=InvoiceDefaultsProfile(
            default_currency=_normalize_currency(default_currency or current_profile.invoice_defaults.default_currency),
            default_due_days=_normalize_due_days(
                default_due_days if default_due_days is not None else current_profile.invoice_defaults.default_due_days
            ),
            default_note=(
                _normalize_optional_text(default_note, "Výchozí poznámka", max_length=4000)
                if default_note is not None
                else current_profile.invoice_defaults.default_note
            ),
        ),
    )
    settings_row.owner_email = normalized_profile.owner_email
    settings_row.issuer_name = normalized_profile.issuer_profile.company_name
    settings_row.issuer_address = normalized_profile.issuer_profile.company_address
    settings_row.issuer_city = normalized_profile.issuer_profile.company_city
    settings_row.issuer_zip = normalized_profile.issuer_profile.company_zip
    settings_row.issuer_ico = normalized_profile.issuer_profile.company_ico
    settings_row.issuer_dic = normalized_profile.issuer_profile.company_dic
    settings_row.issuer_data_box = normalized_profile.issuer_profile.company_data_box
    settings_row.issuer_email = normalized_profile.issuer_profile.company_email
    settings_row.issuer_phone = normalized_profile.issuer_profile.company_phone
    settings_row.default_currency = normalized_profile.invoice_defaults.default_currency
    settings_row.default_due_days = normalized_profile.invoice_defaults.default_due_days
    settings_row.default_note = normalized_profile.invoice_defaults.default_note
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
    defaults = get_default_payment_settings_profile()
    return InvoicePaymentSettingsProfile(
        owner_email=_normalize_email(settings_row.owner_email or defaults.owner_email, "E-mail majitele"),
        payment_profile=_build_payment_profile(
            payment_method=settings_row.payment_method or defaults.payment_profile.payment_method,
            account_number=settings_row.bank_account_number or defaults.payment_profile.account_number,
            account_prefix=(
                settings_row.bank_account_prefix
                if settings_row.bank_account_prefix is not None
                else defaults.payment_profile.account_prefix
            ),
            bank_code=settings_row.bank_code or defaults.payment_profile.bank_code,
            iban=settings_row.bank_iban or defaults.payment_profile.iban,
        ),
        issuer_profile=_build_issuer_profile(
            issuer_name=settings_row.issuer_name or defaults.issuer_profile.company_name,
            issuer_address=settings_row.issuer_address or defaults.issuer_profile.company_address,
            issuer_city=settings_row.issuer_city or defaults.issuer_profile.company_city,
            issuer_zip=settings_row.issuer_zip or defaults.issuer_profile.company_zip,
            issuer_ico=settings_row.issuer_ico or defaults.issuer_profile.company_ico,
            issuer_dic=settings_row.issuer_dic or defaults.issuer_profile.company_dic,
            issuer_data_box=(
                settings_row.issuer_data_box
                if settings_row.issuer_data_box is not None
                else defaults.issuer_profile.company_data_box
            ),
            issuer_email=(
                settings_row.issuer_email
                if settings_row.issuer_email is not None
                else defaults.issuer_profile.company_email
            ),
            issuer_phone=(
                settings_row.issuer_phone
                if settings_row.issuer_phone is not None
                else defaults.issuer_profile.company_phone
            ),
        ),
        invoice_defaults=InvoiceDefaultsProfile(
            default_currency=_normalize_currency(settings_row.default_currency or defaults.invoice_defaults.default_currency),
            default_due_days=_normalize_due_days(
                settings_row.default_due_days
                if settings_row.default_due_days is not None
                else defaults.invoice_defaults.default_due_days
            ),
            default_note=(
                _normalize_optional_text(settings_row.default_note, "Výchozí poznámka", max_length=4000)
                if settings_row.default_note is not None
                else defaults.invoice_defaults.default_note
            ),
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


def _build_issuer_profile(
    *,
    issuer_name: str,
    issuer_address: str,
    issuer_city: str,
    issuer_zip: str,
    issuer_ico: str,
    issuer_dic: str,
    issuer_data_box: str | None,
    issuer_email: str | None,
    issuer_phone: str | None,
) -> IssuerProfile:
    return IssuerProfile(
        company_name=_normalize_required_text(issuer_name, "Název dodavatele", max_length=256),
        company_address=_normalize_required_text(issuer_address, "Adresa dodavatele", max_length=256),
        company_city=_normalize_required_text(issuer_city, "Město dodavatele", max_length=128),
        company_zip=_normalize_required_text(issuer_zip, "PSČ dodavatele", max_length=32),
        company_ico=_normalize_required_text(issuer_ico, "IČO dodavatele", max_length=32),
        company_dic=_normalize_required_text(issuer_dic, "DIČ dodavatele", max_length=32),
        company_data_box=_normalize_optional_text(issuer_data_box, "Datová schránka dodavatele", max_length=64),
        company_email=_normalize_optional_email(issuer_email, "E-mail dodavatele"),
        company_phone=_normalize_optional_text(issuer_phone, "Telefon dodavatele", max_length=64),
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


def _normalize_optional_email(value: str | None, label: str) -> str | None:
    if value is None:
        return None
    cleaned = value.strip().lower()
    if not cleaned:
        return None
    return _normalize_email(cleaned, label)


def _normalize_required_text(value: str, label: str, *, max_length: int) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise InvoicePaymentError(f"{label} chybí.")
    if len(cleaned) > max_length:
        raise InvoicePaymentError(f"{label} může mít maximálně {max_length} znaků.")
    return cleaned


def _normalize_optional_text(value: str | None, label: str, *, max_length: int) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if len(cleaned) > max_length:
        raise InvoicePaymentError(f"{label} může mít maximálně {max_length} znaků.")
    return cleaned


def _normalize_currency(value: str) -> str:
    cleaned = (value or "").strip().upper()
    if not cleaned:
        raise InvoicePaymentError("Výchozí měna chybí.")
    if len(cleaned) < 3 or len(cleaned) > 8:
        raise InvoicePaymentError("Výchozí měna musí mít 3 až 8 znaků.")
    return cleaned


def _normalize_due_days(value: int) -> int:
    normalized = int(value)
    if normalized <= 0:
        raise InvoicePaymentError("Výchozí splatnost musí být větší než nula.")
    if normalized > 365:
        raise InvoicePaymentError("Výchozí splatnost může být maximálně 365 dnů.")
    return normalized


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
