import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.modules.invoices import ares_service
from backend.app.modules.invoices.ares_service import (
    AresCompanyNotFoundError,
    AresCompanyLookupResponse,
    AresUnavailableError,
    InvalidCompanyNameError,
    ResolvedAresProvider,
    resolve_ares_provider,
)
from backend.app.modules.invoices.cache_service import InvoiceCacheService
from backend.app.modules.invoices.email_service import InvoiceEmailSendError
from backend.app.modules.invoices.pdf_service import InvoicePdfDocument

client = TestClient(app)


def _login_admin() -> None:
    response = client.post(
        "/api/admin/login",
        json={"email": "lakodi@seznam.cz", "password": "admin123"},
    )
    assert response.status_code == 200


def _vytvor_fakturu(payload: dict | None = None) -> dict:
    _login_admin()
    invoice_payload = {
        "issue_date": "2026-04-04",
        "due_date": "2026-04-18",
        "customer_name": "Jan Novák",
        "customer_email": "jan@example.com",
        "customer_phone": "+420123456789",
        "customer_address": "Praha 10",
        "customer_ico": "12345678",
        "customer_dic": "CZ12345678",
        "note": "Ruční servisní faktura",
        "business_mode": "autoservice",
        "tax_mode": "standard",
        "currency": "CZK",
        "vat_rate": 21,
        "items": [
            {"description": "Diagnostika", "quantity": 1, "unit_price": 1200},
            {"description": "Oprava převodovky", "quantity": 2, "unit_price": 3500},
        ],
    }
    if payload:
        invoice_payload.update(payload)
    response = client.post("/api/admin/invoices", json=invoice_payload)
    assert response.status_code == 200
    return response.json()


def test_vytvoreni_seznam_a_detail_faktury() -> None:
    _login_admin()

    captured = {"invoice": None, "customer": None}

    class FakeCacheService(InvoiceCacheService):
        def __init__(self):
            super().__init__(client=None)

        def cache_invoice_detail(self, export_dto):
            captured["invoice"] = export_dto
            return True

        def cache_customer_profile(self, export_dto):
            captured["customer"] = export_dto
            return True

    from backend.app.modules.invoices import service as invoice_service

    original_get_cache_service = invoice_service.get_invoice_cache_service
    invoice_service.get_invoice_cache_service = lambda: FakeCacheService()
    try:
        create_response = client.post(
            "/api/admin/invoices",
            json={
                "issue_date": "2026-04-04",
                "due_date": "2026-04-18",
                "customer_name": "Jan Novák",
                "customer_email": "jan@example.com",
                "customer_phone": "+420123456789",
                "customer_address": "Praha 10",
                "customer_ico": "12345678",
                "customer_dic": "CZ12345678",
                "note": "Ruční servisní faktura",
                "business_mode": "autoservice",
                "tax_mode": "standard",
                "currency": "CZK",
                "vat_rate": 21,
                "items": [
                    {"description": "Diagnostika", "quantity": 1, "unit_price": 1200},
                    {"description": "Oprava převodovky", "quantity": 2, "unit_price": 3500},
                ],
            },
        )
    finally:
        invoice_service.get_invoice_cache_service = original_get_cache_service

    assert create_response.status_code == 200
    invoice = create_response.json()
    assert invoice["invoice_number"] == "001"
    assert invoice["variable_symbol"] == "001"
    assert invoice["issuer_name"] == "lakodi s.r.o."
    assert invoice["issuer_ico"] == "09695982"
    assert invoice["currency"] == "CZK"
    assert invoice["status"] == "draft"
    assert invoice["payment_method"] == "Převodem"
    assert invoice["bank_account_number"] == "5997826359"
    assert invoice["bank_code"] == "0800"
    assert invoice["bank_iban"] == "CZ9108000000005997826359"
    assert invoice["subtotal"] == 8200.0
    assert invoice["vat_amount"] == 1722.0
    assert invoice["total"] == 9922.0
    assert invoice["reverse_charge_reason"] is None
    assert len(invoice["items"]) == 2
    assert invoice["items"][1]["line_total"] == 7000.0
    assert captured["invoice"] is not None
    assert captured["customer"] is not None
    assert captured["invoice"].identity.invoice_number == "001"
    assert captured["invoice"].payment.variable_symbol == "001"
    assert captured["customer"].customer.email == "jan@example.com"

    list_response = client.get("/api/admin/invoices")
    assert list_response.status_code == 200
    listed = list_response.json()
    assert len(listed) == 1
    assert listed[0]["id"] == invoice["id"]
    assert listed[0]["invoice_number"] == "001"

    detail_response = client.get(f"/api/admin/invoices/{invoice['id']}")
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["id"] == invoice["id"]
    assert detail["customer_name"] == "Jan Novák"
    assert detail["items"][0]["description"] == "Diagnostika"
    assert detail["variable_symbol"] == "001"


def test_faktura_v_rezimu_prenesene_danove_povinnosti() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices",
        json={
            "issue_date": "2026-04-04",
            "due_date": "2026-04-20",
            "customer_name": "Stavby Partner",
            "customer_email": "stavby@example.com",
            "business_mode": "construction",
            "tax_mode": "reverse_charge",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [
                {"description": "Odvoz železa", "quantity": 3, "unit_price": 5000},
            ],
        },
    )

    assert response.status_code == 200
    invoice = response.json()
    assert invoice["business_mode"] == "construction"
    assert invoice["tax_mode"] == "reverse_charge"
    assert invoice["subtotal"] == 15000.0
    assert invoice["vat_amount"] == 0.0
    assert invoice["total"] == 15000.0
    assert invoice["items"][0]["description"] == "Odvoz železa"
    assert invoice["reverse_charge_reason"] == "construction_services_reverse_charge"
    assert "Daň odvede zákazník" in invoice["reverse_charge_text"]


def test_defaults_vraci_navrzene_cislo_faktury_a_variabilni_symbol() -> None:
    _login_admin()

    response = client.get("/api/admin/invoices/defaults")

    assert response.status_code == 200
    assert response.json() == {
        "suggested_invoice_number": "001",
        "suggested_variable_symbol": "001",
    }


def test_nastaveni_fakturace_vraci_defaultni_hodnoty() -> None:
    _login_admin()

    response = client.get("/api/admin/invoices/settings")

    assert response.status_code == 200
    assert response.json() == {
        "owner_email": "lakodi@seznam.cz",
        "payment_method": "Převodem",
        "bank_account_number": "5997826359",
        "bank_account_prefix": None,
        "bank_code": "0800",
        "bank_iban": "CZ9108000000005997826359",
        "account_label": "5997826359/0800",
    }


def test_ulozeni_nastaveni_fakturace_se_propise_do_novych_faktur() -> None:
    _login_admin()

    save_response = client.put(
        "/api/admin/invoices/settings",
        json={
            "owner_email": "ucetni@lakodi.cz",
            "payment_method": "Bankovním převodem",
            "bank_account_number": "1234567890",
            "bank_account_prefix": "19",
            "bank_code": "0800",
            "bank_iban": "",
        },
    )

    assert save_response.status_code == 200
    saved = save_response.json()
    assert saved["owner_email"] == "ucetni@lakodi.cz"
    assert saved["payment_method"] == "Bankovním převodem"
    assert saved["bank_account_number"] == "1234567890"
    assert saved["bank_account_prefix"] == "19"
    assert saved["bank_code"] == "0800"
    assert saved["account_label"] == "19-1234567890/0800"
    assert saved["bank_iban"].startswith("CZ")

    invoice = _vytvor_fakturu()
    assert invoice["payment_method"] == "Bankovním převodem"
    assert invoice["bank_account_number"] == "1234567890"
    assert invoice["bank_account_prefix"] == "19"
    assert invoice["bank_code"] == "0800"
    assert invoice["bank_iban"] == saved["bank_iban"]


def test_rucne_nastavene_cislo_faktury_posune_dalsi_automatickou_radu() -> None:
    prvni = _vytvor_fakturu({"invoice_number": "024"})
    druha = _vytvor_fakturu({"customer_email": "druhy@example.com"})

    assert prvni["invoice_number"] == "024"
    assert prvni["variable_symbol"] == "024"
    assert druha["invoice_number"] == "025"
    assert druha["variable_symbol"] == "025"

    _login_admin()
    defaults_response = client.get("/api/admin/invoices/defaults")
    assert defaults_response.status_code == 200
    assert defaults_response.json() == {
        "suggested_invoice_number": "026",
        "suggested_variable_symbol": "026",
    }


def test_standardni_faktura_bez_sazby_dph_je_odmitnuta() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices",
        json={
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
            "customer_name": "Jan Novák",
            "customer_email": "jan@example.com",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "items": [
                {"description": "Diagnostika", "quantity": 1, "unit_price": 1200},
            ],
        },
    )

    assert response.status_code == 422
    assert "Pro běžný režim DPH musíte vyplnit sazbu DPH." in response.text


def test_prenesena_danova_povinnost_mimo_stavebni_rezim_je_odmitnuta() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices",
        json={
            "issue_date": "2026-04-04",
            "due_date": "2026-04-20",
            "customer_name": "Klient",
            "customer_email": "klient@example.com",
            "business_mode": "autoservice",
            "tax_mode": "reverse_charge",
            "currency": "CZK",
            "items": [
                {"description": "Servis", "quantity": 1, "unit_price": 5000},
            ],
        },
    )

    assert response.status_code == 422
    assert "Režim přenesené daňové povinnosti lze použít jen" in response.text


def test_faktura_bez_polozek_je_odmitnuta() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices",
        json={
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
            "customer_name": "Jan Novák",
            "customer_email": "jan@example.com",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [],
        },
    )

    assert response.status_code == 422
    assert "Faktura musí obsahovat alespoň jednu položku." in response.text


def test_faktura_s_nekladnym_mnozstvim_je_odmitnuta() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices",
        json={
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
            "customer_name": "Jan Novák",
            "customer_email": "jan@example.com",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [
                {"description": "Diagnostika", "quantity": 0, "unit_price": 1200},
            ],
        },
    )

    assert response.status_code == 422
    assert "Množství položky musí být větší než nula." in response.text


def test_faktura_se_zapornou_cenou_je_odmitnuta() -> None:
    _login_admin()

    response = client.post(
        "/api/admin/invoices",
        json={
            "issue_date": "2026-04-04",
            "due_date": "2026-04-18",
            "customer_name": "Jan Novák",
            "customer_email": "jan@example.com",
            "business_mode": "autoservice",
            "tax_mode": "standard",
            "currency": "CZK",
            "vat_rate": 21,
            "items": [
                {"description": "Diagnostika", "quantity": 1, "unit_price": -1},
            ],
        },
    )

    assert response.status_code == 422
    assert "Jednotková cena nemůže být záporná." in response.text


def test_detail_neexistujici_faktury_vrati_404() -> None:
    _login_admin()

    response = client.get("/api/admin/invoices/999999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Faktura nebyla nalezena."}


def test_lookup_ares_podle_ico_vrati_namapovana_data() -> None:
    _login_admin()

    from backend.app.modules.invoices import router as invoices_router

    original_lookup = invoices_router.lookup_ares_company
    invoices_router.lookup_ares_company = lambda ico, provider=None: AresCompanyLookupResponse(
        ico=ico,
        dic="CZ12345678",
        company_name="Testovací firma s.r.o.",
        address_line="Testovací 10",
        city="Praha",
        zip="11000",
        country="Česká republika",
        data_box="abcd123",
        source="ares",
    )
    try:
        response = client.get("/api/admin/invoices/ares/12345679")
    finally:
        invoices_router.lookup_ares_company = original_lookup

    assert response.status_code == 200
    assert response.json() == {
        "ico": "12345679",
        "dic": "CZ12345678",
        "company_name": "Testovací firma s.r.o.",
        "address_line": "Testovací 10",
        "city": "Praha",
        "zip": "11000",
        "country": "Česká republika",
        "data_box": "abcd123",
        "source": "ares",
    }


def test_lookup_ares_odmitne_neplatne_ico() -> None:
    _login_admin()

    response = client.get("/api/admin/invoices/ares/123")

    assert response.status_code == 400
    assert response.json() == {"detail": "IČO musí obsahovat přesně 8 číslic."}


def test_lookup_ares_vrati_404_kdyz_firma_neexistuje() -> None:
    _login_admin()

    from backend.app.modules.invoices import router as invoices_router

    original_lookup = invoices_router.lookup_ares_company

    def raise_not_found(_ico: str, provider=None):
        raise AresCompanyNotFoundError("Firma nebyla v registru ARES nalezena.")

    invoices_router.lookup_ares_company = raise_not_found
    try:
        response = client.get("/api/admin/invoices/ares/12345679")
    finally:
        invoices_router.lookup_ares_company = original_lookup

    assert response.status_code == 404
    assert response.json() == {"detail": "Firma nebyla v registru ARES nalezena."}


def test_search_ares_podle_nazvu_vrati_vysledky() -> None:
    _login_admin()

    from backend.app.modules.invoices import router as invoices_router

    original_search = invoices_router.search_ares_companies
    invoices_router.search_ares_companies = lambda _name, provider=None: [
        AresCompanyLookupResponse(
            ico="00177041",
            dic="CZ00177041",
            company_name="Škoda Auto a.s.",
            address_line="tř. Václava Klementa 869",
            city="Mladá Boleslav",
            zip="29301",
            country="Česká republika",
            data_box="67wchuf",
            source="ares",
        ),
        AresCompanyLookupResponse(
            ico="46900733",
            dic="CZ46900733",
            company_name="ČEZ, a. s.",
            address_line="Duhová 1444/2",
            city="Praha",
            zip="14053",
            country="Česká republika",
            data_box="yqkcds6",
            source="ares",
        ),
    ]
    try:
        response = client.get("/api/admin/invoices/ares/search?name=sk")
    finally:
        invoices_router.search_ares_companies = original_search

    assert response.status_code == 200
    assert response.headers["X-Ares-Provider"] == "real"
    assert response.json()[0]["company_name"] == "Škoda Auto a.s."
    assert response.json()[1]["company_name"] == "ČEZ, a. s."


def test_search_ares_odmitne_prazdny_dotaz() -> None:
    _login_admin()

    response = client.get("/api/admin/invoices/ares/search?name=")

    assert response.status_code == 400
    assert response.json() == {"detail": "Zadejte název firmy."}


def test_search_ares_odmitne_prilis_kratky_dotaz() -> None:
    with pytest.raises(InvalidCompanyNameError):
        ares_service.normalize_company_name("a")


def test_resolver_ares_provideru_rozlisi_real_a_mock(monkeypatch) -> None:
    monkeypatch.setenv("ARES_PROVIDER", "mock")
    resolved_mock = resolve_ares_provider()
    assert isinstance(resolved_mock, ResolvedAresProvider)
    assert resolved_mock.mode == "mock"

    monkeypatch.setenv("ARES_PROVIDER", "real")
    resolved_real = resolve_ares_provider()
    assert isinstance(resolved_real, ResolvedAresProvider)
    assert resolved_real.mode == "real"


def test_mock_search_je_bez_diakritiky() -> None:
    provider = ares_service.MockAresProvider(ares_service.MOCK_ARES_COMPANIES)

    results = provider.search_companies("skoda")

    assert len(results) == 1
    assert results[0].company_name == "Škoda Auto a.s."
    assert results[0].source == "mock_ares"


def test_realny_ares_provider_pouzije_mapovani_vyhledavani() -> None:
    class StubClient:
        def search_companies_payload(self, _name: str):
            return {
                "ekonomickeSubjekty": [
                    {
                        "ico": "00177041",
                        "dic": "CZ00177041",
                        "obchodniJmeno": "Škoda Auto a.s.",
                        "sidlo": {
                            "textovaAdresa": "tř. Václava Klementa 869, 29301 Mladá Boleslav",
                            "nazevObce": "Mladá Boleslav",
                            "psc": "29301",
                            "nazevStatu": "Česká republika",
                        },
                        "idDatoveSchranky": "67wchuf",
                    }
                ]
            }

    provider = ares_service.RealAresProvider(StubClient(), max_results=20)

    results = provider.search_companies("škoda")

    assert len(results) == 1
    assert results[0].company_name == "Škoda Auto a.s."
    assert results[0].source == "ares"
    assert results[0].data_box == "67wchuf"


def test_search_ares_vrati_502_pri_chybe_upstreamu() -> None:
    _login_admin()

    from backend.app.modules.invoices import router as invoices_router

    original_search = invoices_router.search_ares_companies

    def raise_unavailable(_name: str, provider=None):
        raise AresUnavailableError("Služba ARES je dočasně nedostupná.")

    invoices_router.search_ares_companies = raise_unavailable
    try:
        response = client.get("/api/admin/invoices/ares/search?name=skoda")
    finally:
        invoices_router.search_ares_companies = original_search

    assert response.status_code == 502
    assert response.json() == {"detail": "Služba ARES je dočasně nedostupná."}


def test_realny_provider_nevraci_tise_prazdny_seznam_pri_spatnem_tvaru_odpovedi() -> None:
    class InvalidPayloadClient:
        def search_companies_payload(self, _name: str):
            return {"neocekavanyKlic": []}

    provider = ares_service.RealAresProvider(InvalidPayloadClient(), max_results=20)

    with pytest.raises(AresUnavailableError) as exc_info:
        provider.search_companies("skoda")

    assert str(exc_info.value) == "ARES nevrátil seznam nalezených firem."


def test_pdf_endpoint_vrati_pdf_soubor() -> None:
    invoice = _vytvor_fakturu()

    response = client.get(f"/api/admin/invoices/{invoice['id']}/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert f'{invoice["invoice_number"]}.pdf' in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


def test_odeslani_faktury_e_mailem_prilozi_pdf() -> None:
    _login_admin()
    settings_response = client.put(
        "/api/admin/invoices/settings",
        json={
            "owner_email": "kopie@lakodi.cz",
            "payment_method": "Převodem",
            "bank_account_number": "5997826359",
            "bank_account_prefix": "",
            "bank_code": "0800",
            "bank_iban": "CZ9108000000005997826359",
        },
    )
    assert settings_response.status_code == 200

    invoice = _vytvor_fakturu()

    from backend.app.modules.invoices import email_service as invoice_email_service

    original_is_email_configured = invoice_email_service.is_email_configured
    original_send_html_email = invoice_email_service.send_html_email
    original_build_invoice_pdf_document = invoice_email_service.build_invoice_pdf_document
    captured = {}

    invoice_email_service.is_email_configured = lambda: True
    invoice_email_service.build_invoice_pdf_document = lambda _invoice: InvoicePdfDocument(
        filename=f"{invoice['invoice_number']}.pdf",
        content=b"%PDF-test-payload",
    )

    def fake_send_html_email(to_email: str, subject: str, html: str, attachments=None, bcc=None, cc=None) -> bool:
        captured["to_email"] = to_email
        captured["subject"] = subject
        captured["html"] = html
        captured["attachments"] = attachments
        captured["bcc"] = bcc
        return True

    invoice_email_service.send_html_email = fake_send_html_email
    try:
        response = client.post(f"/api/admin/invoices/{invoice['id']}/send-email")
    finally:
        invoice_email_service.is_email_configured = original_is_email_configured
        invoice_email_service.send_html_email = original_send_html_email
        invoice_email_service.build_invoice_pdf_document = original_build_invoice_pdf_document

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "invoice_id": invoice["id"],
        "invoice_number": invoice["invoice_number"],
        "sent_to": "jan@example.com",
        "copied_to": ["kopie@lakodi.cz"],
    }
    assert captured["to_email"] == "jan@example.com"
    assert captured["subject"] == f"Faktura {invoice['invoice_number']}"
    assert "Jan Novák" in captured["html"]
    assert "5997826359/0800" in captured["html"]
    assert "001" in captured["html"]
    assert captured["bcc"] == ["kopie@lakodi.cz"]
    attachments = captured["attachments"]
    assert attachments is not None
    assert len(attachments) == 1
    assert attachments[0].filename == f"{invoice['invoice_number']}.pdf"
    assert attachments[0].content_type == "application/pdf"
    assert attachments[0].content == b"%PDF-test-payload"


def test_odeslani_faktury_vrati_503_kdyz_neni_email_nakonfigurovany() -> None:
    invoice = _vytvor_fakturu()

    from backend.app.modules.invoices import email_service as invoice_email_service

    original_is_email_configured = invoice_email_service.is_email_configured
    invoice_email_service.is_email_configured = lambda: False
    try:
        response = client.post(f"/api/admin/invoices/{invoice['id']}/send-email")
    finally:
        invoice_email_service.is_email_configured = original_is_email_configured

    assert response.status_code == 503
    assert response.json() == {"detail": "Odesílání e-mailů není nakonfigurované."}


def test_odeslani_faktury_vrati_400_kdyz_chybi_prijemce() -> None:
    invoice = _vytvor_fakturu()

    from backend.app.modules.invoices import service as invoice_service

    original_deliver_invoice_email = invoice_service.deliver_invoice_email

    def raise_missing_recipient(_invoice, to_email=None, owner_email=None):
        raise InvoiceEmailSendError("Chybí e-mailová adresa příjemce faktury.")

    invoice_service.deliver_invoice_email = raise_missing_recipient
    try:
        response = client.post(f"/api/admin/invoices/{invoice['id']}/send-email")
    finally:
        invoice_service.deliver_invoice_email = original_deliver_invoice_email

    assert response.status_code == 400
    assert response.json() == {"detail": "Chybí e-mailová adresa příjemce faktury."}
