"""Integrace ARES pro předvyplnění fakturačních údajů."""
from __future__ import annotations

import json
import os
import logging
from dataclasses import dataclass
from typing import Any, Literal, Protocol
from unicodedata import normalize
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.app.modules.invoices.schemas import AresCompanyLookupResponse

DEFAULT_ARES_BASE_URL = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty"
DEFAULT_ARES_SEARCH_URL = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/vyhledat"
DEFAULT_ARES_PROVIDER = "real"
DEFAULT_SEARCH_MIN_LENGTH = 2
DEFAULT_SEARCH_MAX_RESULTS = 20
VALID_PROVIDER_MODES = {"real", "mock"}
LOGGER = logging.getLogger(__name__)

MOCK_ARES_COMPANIES: dict[str, AresCompanyLookupResponse] = {
    "09695982": AresCompanyLookupResponse(
        ico="09695982",
        dic="CZ09695982",
        company_name="lakodi s.r.o.",
        address_line="Jaurisova 515/4, Michle, 14000 Praha 4",
        city="Praha",
        zip="14000",
        country="Česká republika",
        data_box="wzzs5bi",
        source="mock_ares",
    ),
    "00177041": AresCompanyLookupResponse(
        ico="00177041",
        dic="CZ00177041",
        company_name="Škoda Auto a.s.",
        address_line="tř. Václava Klementa 869, Mladá Boleslav II, 29301 Mladá Boleslav",
        city="Mladá Boleslav",
        zip="29301",
        country="Česká republika",
        data_box=None,
        source="mock_ares",
    ),
    "46900733": AresCompanyLookupResponse(
        ico="46900733",
        dic="CZ46900733",
        company_name="ČEZ, a. s.",
        address_line="Duhová 1444/2, Michle, 14053 Praha 4",
        city="Praha",
        zip="14053",
        country="Česká republika",
        data_box=None,
        source="mock_ares",
    ),
}


class AresLookupError(Exception):
    """Základní chyba pro integraci ARES."""


class InvalidIcoError(AresLookupError):
    """Neplatné IČO."""


class InvalidCompanyNameError(AresLookupError):
    """Neplatný dotaz podle názvu firmy."""


class UnsupportedAresProviderError(AresLookupError):
    """Neznámý režim ARES provideru."""


class AresCompanyNotFoundError(AresLookupError):
    """Firma nebyla v ARES nalezena."""


class AresUnavailableError(AresLookupError):
    """ARES je nedostupný nebo vrátil nevalidní odpověď."""


class AresProvider(Protocol):
    def lookup_company(self, ico: str) -> AresCompanyLookupResponse:
        ...

    def search_companies(self, company_name: str) -> list[AresCompanyLookupResponse]:
        ...


@dataclass(frozen=True)
class ResolvedAresProvider:
    mode: Literal["real", "mock"]
    provider: AresProvider


@dataclass(frozen=True)
class AresHttpClient:
    base_url: str = os.getenv("ARES_BASE_URL", DEFAULT_ARES_BASE_URL)
    search_url: str = os.getenv("ARES_SEARCH_URL", DEFAULT_ARES_SEARCH_URL)
    timeout_seconds: float = float(os.getenv("ARES_TIMEOUT_SECONDS", "10"))
    user_agent: str = "LakodiInvoices/1.0 (+admin; contact=admin@lakodi.local)"

    def fetch_company_payload(self, ico: str) -> dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/{ico}"
        request = Request(
            url,
            headers={
                "User-Agent": self.user_agent,
                "Accept": "application/json",
            },
        )
        return self._perform_json_request(request, failure_label="vyhledání firmy podle IČO")

    def search_companies_payload(self, company_name: str) -> dict[str, Any]:
        request = Request(
            self.search_url,
            data=json.dumps({"obchodniJmeno": company_name}).encode("utf-8"),
            method="POST",
            headers={
                "User-Agent": self.user_agent,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )
        return self._perform_json_request(request, failure_label="vyhledání firmy podle názvu")

    def _perform_json_request(self, request: Request, *, failure_label: str) -> dict[str, Any]:
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                payload = json.load(response)
        except HTTPError as exc:
            if exc.code == 404:
                raise AresCompanyNotFoundError("Firma nebyla v registru ARES nalezena.") from exc
            raise AresUnavailableError(
                f"Služba ARES vrátila chybu při operaci: {failure_label}."
            ) from exc
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise AresUnavailableError("Služba ARES je dočasně nedostupná.") from exc

        if not isinstance(payload, dict):
            raise AresUnavailableError("Služba ARES vrátila neplatnou odpověď.")
        return payload


@dataclass(frozen=True)
class RealAresProvider:
    client: AresHttpClient
    max_results: int = DEFAULT_SEARCH_MAX_RESULTS

    def lookup_company(self, ico: str) -> AresCompanyLookupResponse:
        payload = self.client.fetch_company_payload(ico)
        return _map_company_payload(payload, source="ares")

    def search_companies(self, company_name: str) -> list[AresCompanyLookupResponse]:
        payload = self.client.search_companies_payload(company_name)
        companies = payload.get("ekonomickeSubjekty")
        if companies is None:
            raise AresUnavailableError("ARES nevrátil seznam nalezených firem.")
        if not isinstance(companies, list):
            raise AresUnavailableError("ARES vrátil neplatný seznam nalezených firem.")
        return [
            _map_company_payload(company, source="ares")
            for company in companies[: self.max_results]
            if isinstance(company, dict)
        ]


@dataclass(frozen=True)
class MockAresProvider:
    companies: dict[str, AresCompanyLookupResponse]

    def lookup_company(self, ico: str) -> AresCompanyLookupResponse:
        company = self.companies.get(ico)
        if not company:
            raise AresCompanyNotFoundError("Firma nebyla v testovacím ARES nalezena.")
        return company

    def search_companies(self, company_name: str) -> list[AresCompanyLookupResponse]:
        needle = _normalize_search_text(company_name)
        return [
            company
            for company in self.companies.values()
            if needle in _normalize_search_text(company.company_name)
        ]


def lookup_ares_company(ico: str, provider: AresProvider | None = None) -> AresCompanyLookupResponse:
    normalized_ico = normalize_ico(ico)
    active_provider = provider or resolve_ares_provider().provider
    return active_provider.lookup_company(normalized_ico)


def search_ares_companies(
    company_name: str,
    provider: AresProvider | None = None,
) -> list[AresCompanyLookupResponse]:
    normalized_name = normalize_company_name(company_name)
    active_provider = provider or resolve_ares_provider().provider
    return active_provider.search_companies(normalized_name)


def resolve_ares_provider() -> ResolvedAresProvider:
    provider_mode = os.getenv("ARES_PROVIDER", DEFAULT_ARES_PROVIDER).strip().lower() or DEFAULT_ARES_PROVIDER
    if provider_mode not in VALID_PROVIDER_MODES:
        raise UnsupportedAresProviderError(
            "Neplatná konfigurace ARES provideru. Povolené hodnoty jsou 'real' nebo 'mock'."
        )
    if provider_mode == "mock":
        LOGGER.warning("ARES provider běží v mock režimu.")
        return ResolvedAresProvider(mode="mock", provider=MockAresProvider(MOCK_ARES_COMPANIES))
    max_results = int(os.getenv("ARES_SEARCH_MAX_RESULTS", str(DEFAULT_SEARCH_MAX_RESULTS)))
    return ResolvedAresProvider(mode="real", provider=RealAresProvider(AresHttpClient(), max_results=max_results))


def normalize_ico(ico: str) -> str:
    normalized = (ico or "").strip()
    if not normalized:
        raise InvalidIcoError("Zadejte IČO.")
    if not normalized.isdigit() or len(normalized) != 8:
        raise InvalidIcoError("IČO musí obsahovat přesně 8 číslic.")
    if not _is_valid_ico_checksum(normalized):
        raise InvalidIcoError("IČO není platné.")
    return normalized


def normalize_company_name(company_name: str) -> str:
    normalized = " ".join((company_name or "").strip().split())
    if not normalized:
        raise InvalidCompanyNameError("Zadejte název firmy.")
    min_length = int(os.getenv("ARES_SEARCH_MIN_LENGTH", str(DEFAULT_SEARCH_MIN_LENGTH)))
    if len(normalized) < min_length:
        raise InvalidCompanyNameError(f"Zadejte alespoň {min_length} znaky názvu firmy.")
    return normalized


def _is_valid_ico_checksum(ico: str) -> bool:
    digits = [int(char) for char in ico]
    total = sum(digits[index] * (8 - index) for index in range(7))
    mod = total % 11
    expected = 11 - mod
    if expected == 10:
        expected = 0
    elif expected == 11:
        expected = 1
    return digits[-1] == expected


def _map_company_payload(payload: dict[str, Any], *, source: Literal["ares", "mock_ares"]) -> AresCompanyLookupResponse:
    ico = _normalize_optional_text(payload.get("ico")) or _normalize_optional_text(payload.get("icoId"))
    company_name = _normalize_optional_text(payload.get("obchodniJmeno"))
    sidlo = payload.get("sidlo") if isinstance(payload.get("sidlo"), dict) else {}
    mailing_address = payload.get("adresaDorucovaci") if isinstance(payload.get("adresaDorucovaci"), dict) else {}

    if not ico or not company_name:
        raise AresUnavailableError("ARES vrátil neúplná data o firmě.")

    return AresCompanyLookupResponse(
        ico=ico,
        dic=_normalize_optional_text(payload.get("dic")),
        company_name=company_name,
        address_line=_resolve_address_line(sidlo, mailing_address),
        city=_normalize_optional_text(sidlo.get("nazevObce")) or "",
        zip=_normalize_psc(sidlo.get("psc")),
        country=_normalize_optional_text(sidlo.get("nazevStatu"))
        or _normalize_optional_text(sidlo.get("kodStatu"))
        or "",
        data_box=_extract_data_box(payload),
        source=source,
    )


def _resolve_address_line(sidlo: dict[str, Any], mailing_address: dict[str, Any]) -> str:
    mailing_parts = [
        _normalize_optional_text(mailing_address.get("radekAdresy1")),
        _normalize_optional_text(mailing_address.get("radekAdresy2")),
        _normalize_optional_text(mailing_address.get("radekAdresy3")),
    ]
    mailing_line = ", ".join(part for part in mailing_parts if part)
    if mailing_line:
        return mailing_line

    text_address = _normalize_optional_text(sidlo.get("textovaAdresa"))
    if text_address:
        return text_address

    street = _normalize_optional_text(sidlo.get("nazevUlice"))
    house_number = _normalize_house_number(sidlo)
    district = _normalize_optional_text(sidlo.get("nazevCastiObce"))
    parts = [part for part in (street, house_number, district) if part]
    return ", ".join(parts)


def _normalize_house_number(address: dict[str, Any]) -> str | None:
    cislo_domovni = address.get("cisloDomovni")
    cislo_orientacni = address.get("cisloOrientacni")
    if cislo_domovni is None:
        return None
    if cislo_orientacni is None:
        return str(cislo_domovni)
    return f"{cislo_domovni}/{cislo_orientacni}"


def _normalize_psc(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normalize_optional_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_search_text(value: str) -> str:
    ascii_text = normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return " ".join(ascii_text.lower().split())


def _extract_data_box(payload: dict[str, Any]) -> str | None:
    for key in (
        "datovaSchranka",
        "idDatoveSchranky",
        "identifikatorDatoveSchranky",
        "datovaSchrankaId",
        "kodDatoveSchranky",
    ):
        value = _find_first_key(payload, key)
        normalized = _normalize_optional_text(value)
        if normalized:
            return normalized
    return None


def _find_first_key(node: Any, target_key: str) -> Any:
    if isinstance(node, dict):
        if target_key in node:
            return node[target_key]
        for value in node.values():
            found = _find_first_key(value, target_key)
            if found is not None:
                return found
    elif isinstance(node, list):
        for item in node:
            found = _find_first_key(item, target_key)
            if found is not None:
                return found
    return None
