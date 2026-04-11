"""Generování PDF faktur."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from backend.app.modules.invoices.exporters import build_invoice_export
from backend.app.modules.invoices.models import Invoice
from backend.app.modules.invoices.payment_service import build_qr_code_drawing, build_qr_payment_payload

LOGO_RELATIVE_PATH = Path("frontend/public/logo/lakodi_logo_crena_pozadi.png")
REGULAR_FONT_NAME = "Helvetica"
BOLD_FONT_NAME = "Helvetica-Bold"
BUSINESS_MODE_LABELS = {
    "autoservice": "Autoservis",
    "construction": "Stavební práce",
}
TAX_MODE_LABELS = {
    "standard": "Běžný režim DPH",
    "reverse_charge": "Přenesená daňová povinnost",
}


class InvoicePdfGenerationError(RuntimeError):
    """PDF faktury se nepodařilo vytvořit."""


@dataclass(frozen=True)
class InvoicePdfDocument:
    filename: str
    content: bytes
    content_type: str = "application/pdf"


def build_invoice_pdf_document(invoice: Invoice) -> InvoicePdfDocument:
    export = build_invoice_export(invoice)
    buffer = BytesIO()

    try:
        regular_font, bold_font = _ensure_pdf_fonts()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=18 * mm,
            rightMargin=18 * mm,
            topMargin=18 * mm,
            bottomMargin=18 * mm,
        )
        styles = _build_styles(regular_font, bold_font)
        story: list = []

        logo_path = _resolve_logo_path()
        if logo_path and logo_path.exists():
            story.append(Image(str(logo_path), width=54 * mm, height=22 * mm))
            story.append(Spacer(1, 10))

        story.append(Paragraph(_safe_markup(f"Faktura {export.identity.invoice_number}"), styles["title"]))
        story.append(Spacer(1, 6))
        story.append(
            Paragraph(
                _safe_markup(
                    f"Datum vystavení: {export.identity.issue_date} | "
                    f"Datum splatnosti: {export.identity.due_date} | "
                    f"Režim faktury: {_format_business_mode(export.business_mode)} / {_format_tax_mode(export.tax_mode)}"
                ),
                styles["meta"],
            )
        )
        story.append(Spacer(1, 12))

        issuer_block = [
            Paragraph("Dodavatel", styles["section_heading"]),
            Paragraph(
                _multiline_paragraph(
                    [
                        export.issuer.name,
                        export.issuer.address,
                        f"{export.issuer.zip} {export.issuer.city}",
                        f"IČO: {export.issuer.ico}",
                        f"DIČ: {export.issuer.dic}",
                        f"Datová schránka: {export.issuer.data_box}" if export.issuer.data_box else None,
                    ]
                ),
                styles["body"],
            ),
        ]
        customer_block = [
            Paragraph("Odběratel", styles["section_heading"]),
            Paragraph(
                _multiline_paragraph(
                    [
                        export.customer.name,
                        export.customer.address,
                        export.customer.email,
                        export.customer.phone,
                        f"IČO: {export.customer.ico}" if export.customer.ico else None,
                        f"DIČ: {export.customer.dic}" if export.customer.dic else None,
                    ]
                ),
                styles["body"],
            ),
        ]
        party_table = Table([[issuer_block, customer_block]], colWidths=[84 * mm, 84 * mm])
        party_table.setStyle(
            TableStyle(
                [
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f9fafb")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ]
            )
        )
        story.append(party_table)
        story.append(Spacer(1, 16))

        qr_payload = build_qr_payment_payload(
            iban=export.payment.iban,
            amount=export.totals.total,
            currency=export.totals.currency,
            variable_symbol=export.payment.variable_symbol,
            invoice_number=export.identity.invoice_number,
            due_date=export.identity.due_date,
        )
        payment_info_rows = [
            [
                Paragraph("Způsob platby", styles["payment_label"]),
                Paragraph(_safe_markup(export.payment.method), styles["payment_value"]),
            ],
            [
                Paragraph("Bankovní účet", styles["payment_label"]),
                Paragraph(_safe_markup(export.payment.account_label), styles["payment_value"]),
            ],
            [
                Paragraph("Variabilní symbol", styles["payment_label"]),
                Paragraph(_safe_markup(export.payment.variable_symbol), styles["payment_value"]),
            ],
            [
                Paragraph("IBAN", styles["payment_label"]),
                Paragraph(_safe_markup(export.payment.iban), styles["payment_value_small"]),
            ],
        ]
        payment_info_table = Table(payment_info_rows, colWidths=[42 * mm, 76 * mm])
        payment_info_table.setStyle(
            TableStyle(
                [
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ]
            )
        )
        qr_block = [
            build_qr_code_drawing(qr_payload, size_mm=33),
            Spacer(1, 5),
            Paragraph("QR platba", styles["qr_caption"]),
        ]
        payment_table = Table([[payment_info_table, qr_block]], colWidths=[122 * mm, 52 * mm])
        payment_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f9fafb")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ]
            )
        )
        story.append(Paragraph("Platební údaje", styles["section_heading"]))
        story.append(payment_table)
        story.append(Spacer(1, 16))

        items_data = [
            [
                Paragraph("Položka", styles["table_header"]),
                Paragraph("Množství", styles["table_header_right"]),
                Paragraph("Jednotková cena", styles["table_header_right"]),
                Paragraph("Celkem", styles["table_header_right"]),
            ]
        ]
        for item in export.items:
            items_data.append(
                [
                    Paragraph(_safe_markup(item.description), styles["table_cell"]),
                    Paragraph(_safe_markup(_format_number(item.quantity)), styles["table_cell_right"]),
                    Paragraph(
                        _safe_markup(f"{_format_money(item.unit_price)} {export.totals.currency}"),
                        styles["table_cell_right"],
                    ),
                    Paragraph(
                        _safe_markup(f"{_format_money(item.line_total)} {export.totals.currency}"),
                        styles["table_cell_right_bold"],
                    ),
                ]
            )

        items_table = Table(items_data, colWidths=[82 * mm, 24 * mm, 36 * mm, 36 * mm], repeatRows=1)
        items_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        story.append(items_table)
        story.append(Spacer(1, 14))

        totals_rows = [
            ["Mezisoučet", f"{_format_money(export.totals.subtotal)} {export.totals.currency}"],
            [
                f"DPH{f' ({_format_money(export.totals.vat_rate)} %)' if export.totals.vat_rate is not None else ''}",
                f"{_format_money(export.totals.vat_amount)} {export.totals.currency}",
            ],
            ["Celkem", f"{_format_money(export.totals.total)} {export.totals.currency}"],
        ]
        totals_table = Table(totals_rows, colWidths=[50 * mm, 44 * mm], hAlign="RIGHT")
        totals_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f9fafb")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
                    ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                    ("FONTNAME", (0, 0), (-1, -1), regular_font),
                    ("FONTNAME", (0, -1), (-1, -1), bold_font),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        story.append(totals_table)

        if export.reverse_charge_text:
            story.append(Spacer(1, 16))
            story.append(Paragraph("Přenesená daňová povinnost", styles["section_heading"]))
            story.append(
                Table(
                    [[Paragraph(_safe_markup(export.reverse_charge_text), styles["body"])]],
                    colWidths=[174 * mm],
                    style=TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fff7ed")),
                            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#fdba74")),
                            ("LEFTPADDING", (0, 0), (-1, -1), 10),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                            ("TOPPADDING", (0, 0), (-1, -1), 10),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                        ]
                    ),
                )
            )

        if export.note:
            story.append(Spacer(1, 16))
            story.append(Paragraph("Poznámka", styles["section_heading"]))
            story.append(Paragraph(_safe_markup(export.note), styles["body"]))

        doc.build(story)
    except Exception as exc:
        raise InvoicePdfGenerationError("PDF faktury se nepodařilo vygenerovat.") from exc

    return InvoicePdfDocument(
        filename=f"{export.identity.invoice_number}.pdf",
        content=buffer.getvalue(),
    )


def _build_styles(regular_font: str, bold_font: str) -> dict[str, ParagraphStyle]:
    base_styles = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "LakodiTitle",
            parent=base_styles["Heading1"],
            fontName=bold_font,
            fontSize=20,
            leading=24,
            textColor=colors.HexColor("#111827"),
            spaceAfter=0,
        ),
        "meta": ParagraphStyle(
            "LakodiMeta",
            parent=base_styles["BodyText"],
            fontName=regular_font,
            fontSize=9.5,
            leading=12,
            textColor=colors.HexColor("#4b5563"),
        ),
        "section_heading": ParagraphStyle(
            "LakodiSectionHeading",
            parent=base_styles["Heading3"],
            fontName=bold_font,
            fontSize=11,
            leading=14,
            textColor=colors.HexColor("#111827"),
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "LakodiBody",
            parent=base_styles["BodyText"],
            fontName=regular_font,
            fontSize=10,
            leading=13,
            textColor=colors.HexColor("#111827"),
        ),
        "payment_label": ParagraphStyle(
            "LakodiPaymentLabel",
            parent=base_styles["BodyText"],
            fontName=regular_font,
            fontSize=9.5,
            leading=12,
            textColor=colors.HexColor("#4b5563"),
        ),
        "payment_value": ParagraphStyle(
            "LakodiPaymentValue",
            parent=base_styles["BodyText"],
            fontName=bold_font,
            fontSize=10,
            leading=12,
            textColor=colors.HexColor("#111827"),
        ),
        "payment_value_small": ParagraphStyle(
            "LakodiPaymentValueSmall",
            parent=base_styles["BodyText"],
            fontName=regular_font,
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#111827"),
        ),
        "qr_caption": ParagraphStyle(
            "LakodiQrCaption",
            parent=base_styles["BodyText"],
            fontName=bold_font,
            fontSize=9,
            leading=11,
            alignment=1,
            textColor=colors.HexColor("#111827"),
        ),
        "table_header": ParagraphStyle(
            "LakodiTableHeader",
            parent=base_styles["BodyText"],
            fontName=bold_font,
            fontSize=9.5,
            leading=12,
            textColor=colors.white,
        ),
        "table_header_right": ParagraphStyle(
            "LakodiTableHeaderRight",
            parent=base_styles["BodyText"],
            fontName=bold_font,
            fontSize=9.5,
            leading=12,
            alignment=2,
            textColor=colors.white,
        ),
        "table_cell": ParagraphStyle(
            "LakodiTableCell",
            parent=base_styles["BodyText"],
            fontName=regular_font,
            fontSize=9.5,
            leading=12,
            textColor=colors.HexColor("#111827"),
        ),
        "table_cell_right": ParagraphStyle(
            "LakodiTableCellRight",
            parent=base_styles["BodyText"],
            fontName=regular_font,
            fontSize=9.5,
            leading=12,
            alignment=2,
            textColor=colors.HexColor("#111827"),
        ),
        "table_cell_right_bold": ParagraphStyle(
            "LakodiTableCellRightBold",
            parent=base_styles["BodyText"],
            fontName=bold_font,
            fontSize=9.5,
            leading=12,
            alignment=2,
            textColor=colors.HexColor("#111827"),
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

    regular_path = _first_existing_path(regular_candidates)
    bold_path = _first_existing_path(bold_candidates)
    if not regular_path or not bold_path:
        return REGULAR_FONT_NAME, BOLD_FONT_NAME

    regular_font_name = "LakodiDejaVuSans"
    bold_font_name = "LakodiDejaVuSansBold"
    if regular_font_name not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(regular_font_name, str(regular_path)))
    if bold_font_name not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(bold_font_name, str(bold_path)))
    return regular_font_name, bold_font_name


def _first_existing_path(candidates: list[Path]) -> Path | None:
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def _resolve_logo_path() -> Path | None:
    root = Path(__file__).resolve().parents[4]
    candidate = root / LOGO_RELATIVE_PATH
    if candidate.exists():
        return candidate
    return None


def _safe_markup(value: str | None) -> str:
    return escape(str(value or "")).replace("\n", "<br/>")


def _multiline_paragraph(lines: list[str | None]) -> str:
    return "<br/>".join(_safe_markup(line) for line in lines if line)


def _format_money(value: Decimal | None) -> str:
    if value is None:
        return "0.00"
    return f"{Decimal(value):.2f}"


def _format_number(value: Decimal) -> str:
    normalized = Decimal(value).normalize()
    return format(normalized, "f").rstrip("0").rstrip(".") or "0"


def _format_business_mode(value: str) -> str:
    return BUSINESS_MODE_LABELS.get(value, value)


def _format_tax_mode(value: str) -> str:
    return TAX_MODE_LABELS.get(value, value)
