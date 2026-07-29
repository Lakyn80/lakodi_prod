"""Canonical normalized search keys for hybrid Phase 1 exact matching.

These keys are deterministic, LLM-independent, and must stay aligned with
`accounting_connector.normalization` search-key helpers in AI Agent Accounting.
Display / accounting source values are never mutated by these functions.
"""

from __future__ import annotations

import os
import re
import unicodedata

_WHITESPACE_RE = re.compile(r"\s+")
_NON_DIGIT_RE = re.compile(r"\D+")
_INVOICE_NUMBER_SPACE_RE = re.compile(r"\s+")
_EMAIL_WHITESPACE_RE = re.compile(r"\s+")

# Company legal suffixes → canonical token kept in the name search key.
_COMPANY_SUFFIX_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    # Czech / Slovak
    (re.compile(r"(?i)\bspol\.?\s*s\.?\s*r\.?\s*o\.?"), "s.r.o."),
    (re.compile(r"(?i)\bs\.?\s*r\.?\s*o\.?"), "s.r.o."),
    (re.compile(r"(?i)\bsro\b"), "s.r.o."),
    (re.compile(r"(?i)\bv\.?\s*o\.?\s*s\.?"), "v.o.s."),
    (re.compile(r"(?i)\ba\.?\s*s\.?"), "a.s."),
    (re.compile(r"(?i)\bk\.?\s*s\.?"), "k.s."),
    # English / DE-ish
    (re.compile(r"(?i)\bltd\.?\b"), "ltd"),
    (re.compile(r"(?i)\bllc\.?\b"), "llc"),
    (re.compile(r"(?i)\bgmbh\b"), "gmbh"),
    (re.compile(r"(?i)\binc\.?\b"), "inc"),
    # Russian / Ukrainian (Cyrillic)
    (re.compile(r"(?i)\bооо\b"), "ооо"),
    (re.compile(r"(?i)\bтов\b"), "тов"),
    (re.compile(r"(?i)\bзао\b"), "зао"),
    (re.compile(r"(?i)\bао\b"), "ао"),
)

_LEADING_TRAILING_PUNCT_RE = re.compile(r"^[\s,;:|/\\-]+|[\s,;:|/\\-]+$")
_INTERNAL_COMMA_RE = re.compile(r"\s*,\s*")


def is_hybrid_search_enabled() -> bool:
    """Feature flag: exact/normalized lookup before legacy ILIKE.

    Default is off so existing substring search remains the production path until
    Phase 1 is explicitly enabled per environment.
    """

    raw = os.getenv("HYBRID_SEARCH_ENABLED", "false").strip().casefold()
    return raw in {"1", "true", "yes", "on"}


def normalize_customer_name_search_key(value: str | None) -> str | None:
    """Build a diacritic-folded customer/company lookup key.

    Latin diacritics are stripped; Cyrillic letters are preserved (ё→е only).
    Misspellings such as ``Novakk`` stay distinct from ``Novák``.
    Inflected forms such as ``Novákovi`` stay distinct from ``Novák``.
    """

    cleaned = _collapse_whitespace(value)
    if not cleaned:
        return None
    cleaned = _INTERNAL_COMMA_RE.sub(" ", cleaned)
    cleaned = _LEADING_TRAILING_PUNCT_RE.sub("", cleaned)
    cleaned = _collapse_whitespace(cleaned)
    if not cleaned:
        return None

    with_suffixes = cleaned
    for pattern, replacement in _COMPANY_SUFFIX_PATTERNS:
        with_suffixes = pattern.sub(replacement, with_suffixes)
    with_suffixes = _collapse_whitespace(with_suffixes)
    with_suffixes = _LEADING_TRAILING_PUNCT_RE.sub("", with_suffixes)
    with_suffixes = _collapse_whitespace(with_suffixes)
    if not with_suffixes:
        return None

    return _fold_search_key(with_suffixes)


def normalize_invoice_number_search_key(value: str | None) -> str | None:
    """Normalize invoice numbers for exact lookup without merging distinct numbers.

    Removes whitespace only; keeps hyphens and other separators so ``2026-001``
    and ``2026001`` remain different keys.
    """

    cleaned = _collapse_whitespace(value)
    if not cleaned:
        return None
    compact = _INVOICE_NUMBER_SPACE_RE.sub("", cleaned)
    if not compact:
        return None
    return compact.casefold()


def normalize_variable_symbol_search_key(value: str | None) -> str | None:
    """Normalize variable symbols to digits-only canonical form."""

    cleaned = _collapse_whitespace(value)
    if not cleaned:
        return None
    digits = _NON_DIGIT_RE.sub("", cleaned)
    return digits or None


def normalize_ico_search_key(value: str | None) -> str | None:
    """Normalize IČO to digits only."""

    cleaned = _collapse_whitespace(value)
    if not cleaned:
        return None
    digits = _NON_DIGIT_RE.sub("", cleaned)
    return digits or None


def normalize_dic_search_key(value: str | None) -> str | None:
    """Normalize DIČ: uppercase, strip spaces/punctuation, keep country prefix."""

    cleaned = _collapse_whitespace(value)
    if not cleaned:
        return None
    compact = re.sub(r"[\s.\-_/]+", "", cleaned)
    if not compact:
        return None
    return compact.upper()


def normalize_email_search_key(value: str | None) -> str | None:
    """Case-insensitive email lookup key."""

    cleaned = _collapse_whitespace(value)
    if not cleaned:
        return None
    compact = _EMAIL_WHITESPACE_RE.sub("", cleaned)
    if not compact:
        return None
    return compact.casefold()


def apply_subject_search_norms(subject) -> None:
    """Populate normalized search columns on an InvoiceSubject instance."""

    subject.name_search_norm = normalize_customer_name_search_key(getattr(subject, "name", None))
    subject.ico_norm = normalize_ico_search_key(getattr(subject, "ico", None))
    subject.dic_norm = normalize_dic_search_key(getattr(subject, "dic", None))
    subject.email_norm = normalize_email_search_key(getattr(subject, "email", None))


def apply_invoice_search_norms(invoice) -> None:
    """Populate normalized search columns on an Invoice instance."""

    invoice.customer_name_search_norm = normalize_customer_name_search_key(
        getattr(invoice, "customer_name", None)
    )
    invoice.invoice_number_norm = normalize_invoice_number_search_key(
        getattr(invoice, "invoice_number", None)
    )
    invoice.variable_symbol_norm = normalize_variable_symbol_search_key(
        getattr(invoice, "variable_symbol", None)
    )
    invoice.customer_ico_norm = normalize_ico_search_key(getattr(invoice, "customer_ico", None))
    invoice.customer_dic_norm = normalize_dic_search_key(getattr(invoice, "customer_dic", None))


def _collapse_whitespace(value: str | None) -> str:
    if value is None:
        return ""
    return _WHITESPACE_RE.sub(" ", str(value).replace("\x00", "").strip())


def _fold_search_key(value: str) -> str:
    """Casefold + strip Latin combining marks; preserve non-Latin letters."""

    replaced = value.replace("ё", "е").replace("Ё", "Е")
    casefolded = replaced.casefold()
    decomposed = unicodedata.normalize("NFKD", casefolded)
    chars: list[str] = []
    for char in decomposed:
        if unicodedata.combining(char):
            # Drop Latin diacritics only (combining marks). Cyrillic base letters remain.
            continue
        chars.append(char)
    folded = "".join(chars)
    folded = _WHITESPACE_RE.sub(" ", folded).strip()
    return folded
