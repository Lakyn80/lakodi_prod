"""Generování PDF zakázkového listu (A4 tiskopis)."""
from __future__ import annotations

import json
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.graphics.shapes import Drawing, Line, Polygon, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from backend.app.modules.zakazky.models import Zakazka

REGULAR_FONT_NAME = "Helvetica"
BOLD_FONT_NAME = "Helvetica-Bold"
LOGO_CANDIDATES = (
    Path("frontend/public/logo/lakodi_logo_crena_pozadi.png"),
    Path("frontend/public/logo/lakodi_logo.png"),
    Path("frontend/public/lakodi_logo.png"),
)

LEGAL_TEXT = (
    "8. Servis neodpovídá za věci a cennosti ponechané ve vozidle. Pokud zákazník "
    "nepřevezme vozidlo do 3 dnů po výzvě, účtuje se parkovné 200 Kč/den. "
    "Vozidlo je parkováno na nezabezpečeném parkovišti na riziko majitele."
)

EXTERIOR_ROWS = (
    "Okna / čelní sklo",
    "Světla / blinkry",
    "Karoserie / lak",
    "Stěrače",
)

SERVICE_ROWS = (
    "Servisní prohlídka",
    "STK",
    "Emise benzín",
    "Emise diesel",
    "Servis klimatizace",
)

MANDATORY_EQUIPMENT = (
    "Lékárnička",
    "Trojúhelník",
    "Rezerva",
    "Reflexní vesta",
    "Žárovky",
)

OTHER_EQUIPMENT = (
    "Rádio",
    "Navigace",
    "Handsfree",
    "Poklice",
)


class ZakazkovyListPdfError(RuntimeError):
    """PDF zakázkového listu se nepodařilo vytvořit."""


@dataclass(frozen=True)
class ZakazkovyListPdfDocument:
    filename: str
    content: bytes
    content_type: str = "application/pdf"


@dataclass(frozen=True)
class ZakazkovyListPrefill:
    customer_name: str = ""
    street: str = ""
    city: str = ""
    phone: str = ""
    email: str = ""
    ico: str = ""
    dic: str = ""
    plate: str = ""
    brand: str = ""
    year: str = ""
    model: str = ""
    engine_code: str = ""
    vin: str = ""
    notes: str = ""
    estimated_price: str = ""


def build_zakazkovy_list_pdf(*, zakazka: Zakazka | None = None) -> ZakazkovyListPdfDocument:
    prefill = _prefill_from_zakazka(zakazka) if zakazka is not None else ZakazkovyListPrefill()
    buffer = BytesIO()

    try:
        regular_font, bold_font = _ensure_pdf_fonts()
        styles = _build_styles(regular_font, bold_font)
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=10 * mm,
            rightMargin=10 * mm,
            topMargin=8 * mm,
            bottomMargin=8 * mm,
        )
        story: list = []

        story.append(_build_header(styles, bold_font, regular_font))
        story.append(Spacer(1, 3 * mm))
        story.append(_build_customer_vehicle_table(prefill, styles, bold_font, regular_font))
        story.append(Spacer(1, 2.5 * mm))
        story.append(_build_checklists_row(styles, bold_font, regular_font))
        story.append(Spacer(1, 2 * mm))
        story.append(_section_title("Poškození karoserie – popis", styles))
        story.append(_lined_block(3, styles))
        story.append(Spacer(1, 1.5 * mm))
        story.append(_section_title("Poznámky", styles))
        notes_seed = prefill.notes.strip()
        story.append(_lined_block(3, styles, first_line=notes_seed or None))
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(_safe_markup(LEGAL_TEXT), styles["legal"]))
        story.append(Spacer(1, 2 * mm))
        story.append(_build_admin_payment_block(prefill, styles, bold_font, regular_font))
        story.append(Spacer(1, 2.5 * mm))
        story.append(
            _build_signature_block(
                "Převzetí vozidla do servisu / souhlas s opravou",
                styles,
                bold_font,
                regular_font,
            )
        )
        story.append(Spacer(1, 2 * mm))
        story.append(
            _build_signature_block(
                "Předání vozidla zákazníkovi",
                styles,
                bold_font,
                regular_font,
            )
        )

        doc.build(story)
    except Exception as exc:  # noqa: BLE001 - surface as PDF error
        raise ZakazkovyListPdfError("Zakázkový list se nepodařilo vygenerovat.") from exc

    filename = (
        f"zakazkovy-list-{zakazka.id}.pdf" if zakazka is not None else "zakazkovy-list.pdf"
    )
    return ZakazkovyListPdfDocument(filename=filename, content=buffer.getvalue())


def _prefill_from_zakazka(zakazka: Zakazka) -> ZakazkovyListPrefill:
    answers = _load_answers(zakazka.answers)
    brand = _answer(answers, "značka", "znacka", "brand", "make")
    model = _answer(answers, "model")
    plate = _answer(answers, "RZ", "rz", "SPZ", "spz", "registrace", "plate")
    vin = _answer(answers, "VIN", "vin")
    year = _answer(answers, "r.v.", "rv", "rok", "year")
    engine = _answer(answers, "kód motoru", "kod motoru", "engine", "motor")
    notes_parts = [
        part
        for part in (
            (zakazka.description or "").strip(),
            (zakazka.repair_description or "").strip(),
        )
        if part
    ]
    estimated = ""
    if zakazka.estimated_price is not None:
        estimated = str(zakazka.estimated_price)

    return ZakazkovyListPrefill(
        customer_name=(zakazka.name or "").strip(),
        phone=(zakazka.phone or "").strip(),
        email=(zakazka.email or "").strip(),
        brand=brand,
        model=model,
        plate=plate,
        vin=vin,
        year=year,
        engine_code=engine,
        notes="\n".join(notes_parts),
        estimated_price=estimated,
    )


def _load_answers(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(key): str(value) for key, value in data.items() if value is not None}


def _answer(answers: dict[str, str], *keys: str) -> str:
    lowered = {key.strip().lower(): value for key, value in answers.items()}
    for key in keys:
        value = lowered.get(key.strip().lower())
        if value and value.strip():
            return value.strip()
    return ""


def _build_header(styles: dict, bold_font: str, regular_font: str) -> Table:
    logo_flowable: list = []
    logo_path = _resolve_logo_path()
    if logo_path is not None:
        logo_flowable.append(Image(str(logo_path), width=28 * mm, height=28 * mm))
    else:
        logo_flowable.append(Paragraph(_safe_markup("LAKODI\nAUTOSLUŽBY"), styles["logo_fallback"]))

    service_box = Table(
        [
            [Paragraph("<b>Servis:</b>", styles["tiny_bold"])],
            [Paragraph(_safe_markup("LAKODI autoslužby"), styles["tiny"])],
            [Paragraph(_safe_markup("K Netlukám 93, Praha 22"), styles["tiny"])],
            [Paragraph(_safe_markup("Tel.: +420 776 053 625"), styles["tiny"])],
        ],
        colWidths=[55 * mm],
    )
    service_box.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ]
        )
    )

    header = Table(
        [
            [
                service_box,
                Paragraph(_safe_markup("Zakázkový list"), styles["title"]),
                logo_flowable[0],
            ]
        ],
        colWidths=[58 * mm, 85 * mm, 40 * mm],
    )
    header.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (1, 0), (1, 0), "CENTER"),
                ("ALIGN", (2, 0), (2, 0), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("FONTNAME", (0, 0), (-1, -1), regular_font),
            ]
        )
    )
    return header


def _build_customer_vehicle_table(
    prefill: ZakazkovyListPrefill,
    styles: dict,
    bold_font: str,
    regular_font: str,
) -> Table:
    left = [
        _field_row("Zákazník", prefill.customer_name, styles),
        _field_row("Ulice", prefill.street, styles),
        _field_row("Město", prefill.city, styles),
        _field_row("Telefon", prefill.phone, styles),
        _field_row("E-mail", prefill.email, styles),
        _field_row("IČ", prefill.ico, styles),
        _field_row("DIČ", prefill.dic, styles),
    ]
    right = [
        _field_row("Vozidlo / RZ", prefill.plate, styles),
        _field_row("Značka", prefill.brand, styles),
        _field_row("r.v.", prefill.year, styles),
        _field_row("Model", prefill.model, styles),
        _field_row("Kód motoru", prefill.engine_code, styles),
        _field_row("VIN", prefill.vin, styles),
        Paragraph(" ", styles["tiny"]),
    ]
    table = Table([[_boxed_stack(left), _boxed_stack(right)]], colWidths=[94 * mm, 94 * mm])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 1.5 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("FONTNAME", (0, 0), (-1, -1), regular_font),
            ]
        )
    )
    return table


def _build_checklists_row(styles: dict, bold_font: str, regular_font: str) -> Table:
    exterior = _checkbox_table(
        title="Stav vozidla z vnějšku",
        rows=EXTERIOR_ROWS,
        columns=("OK", "Závada", "Pozn."),
        styles=styles,
        col_widths=(42 * mm, 12 * mm, 14 * mm, 22 * mm),
    )
    fuel = Paragraph(
        _safe_markup("Palivo v nádrži:  [ ] 0   [ ] 1/4   [ ] 1/2   [ ] 3/4   [ ] 1"),
        styles["tiny"],
    )
    exterior_block = Table([[exterior], [fuel]], colWidths=[90 * mm])
    exterior_block.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )

    service = _checkbox_table(
        title="Servisní nabídka",
        rows=SERVICE_ROWS,
        columns=("ANO", "NE"),
        styles=styles,
        col_widths=(48 * mm, 14 * mm, 14 * mm),
    )
    service_block = Table([[service]], colWidths=[90 * mm])
    service_block.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )

    equipment = Table(
        [
            [_simple_checkbox_list("Povinná výbava", MANDATORY_EQUIPMENT, styles)],
            [_simple_checkbox_list("Ostatní výbava", OTHER_EQUIPMENT, styles)],
        ],
        colWidths=[90 * mm],
    )
    equipment.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )

    visual_inner = Table(
        [
            [Paragraph("<b>Vizuální kontrola</b>", styles["section"])],
            [_build_car_diagram()],
        ],
        colWidths=[90 * mm],
    )
    visual_inner.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )

    table = Table(
        [[exterior_block, service_block], [equipment, visual_inner]],
        colWidths=[94 * mm, 94 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 1.5 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 1 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1 * mm),
                ("BOX", (0, 0), (0, 0), 0.6, colors.black),
                ("BOX", (1, 0), (1, 0), 0.6, colors.black),
                ("BOX", (0, 1), (0, 1), 0.6, colors.black),
                ("BOX", (1, 1), (1, 1), 0.6, colors.black),
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("FONTNAME", (0, 0), (-1, -1), regular_font),
            ]
        )
    )
    return table


def _build_admin_payment_block(
    prefill: ZakazkovyListPrefill,
    styles: dict,
    bold_font: str,
    regular_font: str,
) -> Table:
    left = [
        _field_row("Datum + hod. příjmu", "", styles),
        _field_row("Předběžný termín", "", styles),
        _field_row("Datum + hod. předání", "", styles),
        Paragraph(
            _safe_markup("Převzaté doklady:  [ ] velký TP   [ ] malý TP   [ ] zelená karta"),
            styles["tiny"],
        ),
        Paragraph(
            _safe_markup("Platba:  [ ] hotově   [ ] kartou   [ ] faktura   [ ] jiné"),
            styles["tiny"],
        ),
    ]
    right = [
        _field_row("Předb. cena bez DPH", "", styles),
        _field_row("Předb. cena s DPH", prefill.estimated_price, styles),
        _field_row("Záloha", "", styles),
        _field_row("Opravu provedl", "", styles),
    ]
    table = Table([[_boxed_stack(left), _boxed_stack(right)]], colWidths=[94 * mm, 94 * mm])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 1.5 * mm),
                ("FONTNAME", (0, 0), (-1, -1), regular_font),
            ]
        )
    )
    return table


def _build_signature_block(title: str, styles: dict, bold_font: str, regular_font: str) -> Table:
    sign_customer = _signature_box("Podpis zákazníka / uživatele vozidla", styles)
    sign_service = _signature_box("Podpis a razítko servisu", styles)
    meta = Table(
        [
            [_field_row("Datum", "", styles)],
            [_field_row("Stav km", "", styles)],
            [_field_row("Stav nabití baterie %", "", styles)],
        ],
        colWidths=[52 * mm],
    )
    body = Table(
        [[sign_customer, sign_service, meta]],
        colWidths=[66 * mm, 66 * mm, 52 * mm],
    )
    body.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 1.5 * mm),
                ("FONTNAME", (0, 0), (-1, -1), regular_font),
            ]
        )
    )
    wrapper = Table(
        [
            [Paragraph(f"<b>{_safe_markup(title)}</b>", styles["section"])],
            [body],
        ],
        colWidths=[190 * mm],
    )
    wrapper.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
            ]
        )
    )
    return wrapper


def _signature_box(label: str, styles: dict) -> Table:
    blank = Paragraph("&nbsp;<br/>&nbsp;<br/>&nbsp;<br/>&nbsp;", styles["tiny"])
    table = Table(
        [
            [Paragraph(_safe_markup(label), styles["tiny_bold"])],
            [blank],
        ],
        colWidths=[64 * mm],
        rowHeights=[10 * mm, 18 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.7, colors.black),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def _checkbox_table(
    *,
    title: str,
    rows: tuple[str, ...],
    columns: tuple[str, ...],
    styles: dict,
    col_widths: tuple[float, ...],
) -> Table:
    header = [Paragraph(f"<b>{_safe_markup(title)}</b>", styles["tiny_bold"])] + [
        Paragraph(f"<b>{_safe_markup(col)}</b>", styles["tiny_center"]) for col in columns
    ]
    data = [header]
    for row in rows:
        data.append(
            [Paragraph(_safe_markup(row), styles["tiny"])]
            + [Paragraph("[ ]", styles["tiny_center"]) for _ in columns]
        )
    table = Table(data, colWidths=list(col_widths))
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.4, colors.black),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
            ]
        )
    )
    return table


def _simple_checkbox_list(title: str, items: tuple[str, ...], styles: dict) -> Table:
    lines = [Paragraph(f"<b>{_safe_markup(title)}</b>", styles["tiny_bold"])]
    for item in items:
        lines.append(Paragraph(_safe_markup(f"[ ]  {item}"), styles["tiny"]))
    return _boxed_stack(lines)


def _boxed_stack(flowables: list) -> Table:
    table = Table([[item] for item in flowables], colWidths=[90 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.7, colors.black),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
            ]
        )
    )
    return table


def _field_row(label: str, value: str, styles: dict) -> Paragraph:
    filled = value.strip() if value else "........................................"
    if value.strip():
        filled = value.strip()
    return Paragraph(
        f"<b>{_safe_markup(label)}:</b> {_safe_markup(filled)}",
        styles["tiny"],
    )


def _section_title(text: str, styles: dict) -> Paragraph:
    return Paragraph(f"<b>{_safe_markup(text)}</b>", styles["section"])


def _lined_block(lines: int, styles: dict, first_line: str | None = None) -> Table:
    rows = []
    for index in range(lines):
        content = first_line if index == 0 and first_line else " "
        rows.append([Paragraph(_safe_markup(content), styles["line"])])
    table = Table(rows, colWidths=[190 * mm])
    table.setStyle(
        TableStyle(
            [
                ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.black),
                ("LEFTPADDING", (0, 0), (-1, -1), 1),
                ("RIGHTPADDING", (0, 0), (-1, -1), 1),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    return table


def _build_car_diagram() -> Drawing:
    drawing = Drawing(88 * mm, 42 * mm)

    def car_side(x: float, y: float, label: str) -> None:
        drawing.add(Rect(x, y, 28, 10, strokeColor=colors.black, strokeWidth=0.6, fillColor=colors.white))
        drawing.add(Polygon([x + 6, y + 10, x + 10, y + 16, x + 20, y + 16, x + 24, y + 10], strokeColor=colors.black, strokeWidth=0.6, fillColor=colors.white))
        drawing.add(String(x + 8, y - 8, label, fontSize=6, fillColor=colors.black))

    def car_front(x: float, y: float, label: str) -> None:
        drawing.add(Rect(x, y, 14, 18, strokeColor=colors.black, strokeWidth=0.6, fillColor=colors.white))
        drawing.add(Line(x + 2, y + 14, x + 12, y + 14, strokeColor=colors.black, strokeWidth=0.5))
        drawing.add(String(x - 2, y - 8, label, fontSize=6, fillColor=colors.black))

    car_side(8, 55, "levý bok")
    car_side(120, 55, "pravý bok")
    car_front(70, 48, "předek")
    car_front(95, 48, "zadek")
    # top view
    drawing.add(Rect(68, 8, 40, 28, strokeColor=colors.black, strokeWidth=0.6, fillColor=colors.white))
    drawing.add(Rect(74, 14, 28, 16, strokeColor=colors.black, strokeWidth=0.5, fillColor=colors.white))
    drawing.add(String(78, 0, "půdorys", fontSize=6, fillColor=colors.black))
    return drawing


def _build_styles(regular_font: str, bold_font: str) -> dict:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ZakListTitle",
            parent=base["Title"],
            fontName=bold_font,
            fontSize=16,
            leading=18,
            alignment=TA_CENTER,
            textColor=colors.black,
            spaceAfter=0,
        ),
        "section": ParagraphStyle(
            "ZakListSection",
            parent=base["Normal"],
            fontName=bold_font,
            fontSize=8.5,
            leading=10,
            textColor=colors.black,
        ),
        "tiny": ParagraphStyle(
            "ZakListTiny",
            parent=base["Normal"],
            fontName=regular_font,
            fontSize=7.5,
            leading=9,
            alignment=TA_LEFT,
            textColor=colors.black,
        ),
        "tiny_bold": ParagraphStyle(
            "ZakListTinyBold",
            parent=base["Normal"],
            fontName=bold_font,
            fontSize=7.5,
            leading=9,
            textColor=colors.black,
        ),
        "tiny_center": ParagraphStyle(
            "ZakListTinyCenter",
            parent=base["Normal"],
            fontName=regular_font,
            fontSize=7.5,
            leading=9,
            alignment=TA_CENTER,
            textColor=colors.black,
        ),
        "legal": ParagraphStyle(
            "ZakListLegal",
            parent=base["Normal"],
            fontName=regular_font,
            fontSize=6.5,
            leading=8,
            textColor=colors.HexColor("#111827"),
        ),
        "line": ParagraphStyle(
            "ZakListLine",
            parent=base["Normal"],
            fontName=regular_font,
            fontSize=8,
            leading=10,
            textColor=colors.black,
        ),
        "logo_fallback": ParagraphStyle(
            "ZakListLogoFallback",
            parent=base["Normal"],
            fontName=bold_font,
            fontSize=8,
            leading=10,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#b91c1c"),
        ),
    }


def _ensure_pdf_fonts() -> tuple[str, str]:
    regular_candidates = [
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    ]
    bold_candidates = [
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        Path("/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf"),
    ]
    regular_path = next((path for path in regular_candidates if path.exists()), None)
    bold_path = next((path for path in bold_candidates if path.exists()), None)
    if not regular_path or not bold_path:
        return REGULAR_FONT_NAME, BOLD_FONT_NAME

    regular_name = "ZakListDejaVuSans"
    bold_name = "ZakListDejaVuSansBold"
    if regular_name not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(regular_name, str(regular_path)))
    if bold_name not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(bold_name, str(bold_path)))
    return regular_name, bold_name


def _resolve_logo_path() -> Path | None:
    root = Path(__file__).resolve().parents[4]
    for relative in LOGO_CANDIDATES:
        candidate = root / relative
        if candidate.exists():
            return candidate
    return None


def _safe_markup(value: str | None) -> str:
    return escape(str(value or "")).replace("\n", "<br/>")
