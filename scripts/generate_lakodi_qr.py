from __future__ import annotations

from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFont, ImageOps
from qrcode.constants import ERROR_CORRECT_H
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "frontend" / "public" / "qr"
LOGO_PATH = ROOT / "frontend" / "public" / "logo" / "lakodi_logo_crena_pozadi.png"

QR_URL = "https://lakodi.cz/"
QUIET_ZONE = 4

DARK = (7, 17, 31)
NAVY = (10, 29, 56)
RED = (214, 31, 38)
WHITE = (255, 255, 255)
TEXT_MUTED = (214, 222, 234)


def make_matrix(data: str) -> list[list[bool]]:
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_H,
        box_size=1,
        border=0,
    )
    qr.add_data(data)
    qr.make(fit=True)
    return qr.modules


def draw_matrix_png(
    draw: ImageDraw.ImageDraw,
    matrix: list[list[bool]],
    x: int,
    y: int,
    module_px: int,
    fill: tuple[int, int, int] = (0, 0, 0),
) -> None:
    for row_index, row in enumerate(matrix):
        for col_index, active in enumerate(row):
            if not active:
                continue
            left = x + (col_index + QUIET_ZONE) * module_px
            top = y + (row_index + QUIET_ZONE) * module_px
            draw.rectangle(
                [left, top, left + module_px - 1, top + module_px - 1],
                fill=fill,
            )


def draw_matrix_pdf(
    pdf: canvas.Canvas,
    matrix: list[list[bool]],
    x: float,
    y: float,
    size: float,
) -> None:
    cell_count = len(matrix) + QUIET_ZONE * 2
    module = size / cell_count
    pdf.setFillColorRGB(1, 1, 1)
    pdf.rect(x, y, size, size, stroke=0, fill=1)
    pdf.setFillColorRGB(0, 0, 0)
    for row_index, row in enumerate(matrix):
        for col_index, active in enumerate(row):
            if not active:
                continue
            pdf.rect(
                x + (col_index + QUIET_ZONE) * module,
                y + size - (row_index + QUIET_ZONE + 1) * module,
                module,
                module,
                stroke=0,
                fill=1,
            )


def save_svg(matrix: list[list[bool]]) -> Path:
    cell_count = len(matrix) + QUIET_ZONE * 2
    output = OUTPUT_DIR / "lakodi-web-qr.svg"
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {cell_count} {cell_count}" '
            'shape-rendering="crispEdges" role="img">'
        ),
        f"<title>QR kod pro {QR_URL}</title>",
        f'<rect width="{cell_count}" height="{cell_count}" fill="#fff"/>',
    ]
    for row_index, row in enumerate(matrix):
        for col_index, active in enumerate(row):
            if active:
                parts.append(
                    f'<rect x="{col_index + QUIET_ZONE}" y="{row_index + QUIET_ZONE}" '
                    'width="1" height="1" fill="#000"/>'
                )
    parts.append("</svg>")
    output.write_text("\n".join(parts) + "\n", encoding="utf-8")
    return output


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    font_candidates = [
        Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for font_path in font_candidates:
        if font_path.exists():
            return ImageFont.truetype(str(font_path), size)
    return ImageFont.load_default()


def register_pdf_fonts() -> tuple[str, str]:
    regular = Path("C:/Windows/Fonts/segoeui.ttf")
    bold = Path("C:/Windows/Fonts/segoeuib.ttf")
    if regular.exists() and bold.exists():
        pdfmetrics.registerFont(TTFont("LakodiRegular", str(regular)))
        pdfmetrics.registerFont(TTFont("LakodiBold", str(bold)))
        return "LakodiRegular", "LakodiBold"
    return "Helvetica", "Helvetica-Bold"


def draw_centered_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    y: int,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    fill: tuple[int, int, int],
    width: int,
) -> None:
    bbox = draw.textbbox((0, 0), text, font=font)
    draw.text(((width - (bbox[2] - bbox[0])) // 2, y), text, font=font, fill=fill)


def make_qr_image(matrix: list[list[bool]], module_px: int = 90) -> Image.Image:
    cell_count = len(matrix) + QUIET_ZONE * 2
    size = cell_count * module_px
    image = Image.new("RGB", (size, size), WHITE)
    draw = ImageDraw.Draw(image)
    draw_matrix_png(draw, matrix, 0, 0, module_px)
    return image


def save_png(matrix: list[list[bool]]) -> Path:
    output = OUTPUT_DIR / "lakodi-web-qr.png"
    make_qr_image(matrix).save(output, optimize=True)
    return output


def save_sticker_png(matrix: list[list[bool]]) -> Path:
    width, height = 1240, 1748  # A6 at 300 DPI.
    image = Image.new("RGB", (width, height), DARK)
    draw = ImageDraw.Draw(image)

    draw.rectangle([0, 0, 46, height], fill=RED)
    draw.rectangle([46, 0, width, 22], fill=NAVY)
    draw.rectangle([46, height - 22, width, height], fill=NAVY)

    logo = Image.open(LOGO_PATH).convert("RGB")
    logo = ImageOps.contain(logo, (780, 520), Image.Resampling.LANCZOS)
    image.paste(logo, ((width - logo.width) // 2, 58))

    prompt_font = load_font(54, bold=True)
    url_font = load_font(72, bold=True)
    phone_font = load_font(38)

    draw_centered_text(
        draw,
        "Naskenujte pro objednání servisu",
        625,
        prompt_font,
        WHITE,
        width,
    )

    qr_box = 820
    qr_x = (width - qr_box) // 2
    qr_y = 725
    draw.rounded_rectangle(
        [qr_x, qr_y, qr_x + qr_box, qr_y + qr_box],
        radius=34,
        fill=WHITE,
    )

    qr_image = make_qr_image(matrix, module_px=20)
    image.paste(qr_image, (qr_x + 40, qr_y + 40))

    draw_centered_text(draw, "lakodi.cz", 1588, url_font, WHITE, width)
    draw_centered_text(draw, "+420 776 053 625", 1668, phone_font, TEXT_MUTED, width)

    output = OUTPUT_DIR / "lakodi-web-sticker-a6.png"
    image.save(output, optimize=True)
    return output


def draw_sticker_pdf(
    pdf: canvas.Canvas,
    matrix: list[list[bool]],
    x: float,
    y: float,
    width: float,
    height: float,
    regular_font: str,
    bold_font: str,
) -> None:
    pdf.setFillColorRGB(DARK[0] / 255, DARK[1] / 255, DARK[2] / 255)
    pdf.rect(x, y, width, height, stroke=0, fill=1)

    pdf.setFillColorRGB(RED[0] / 255, RED[1] / 255, RED[2] / 255)
    pdf.rect(x, y, 4 * mm, height, stroke=0, fill=1)

    logo_width = width * 0.55
    logo_height = logo_width * 2 / 3
    logo_x = x + (width - logo_width) / 2
    logo_y = y + height - logo_height - 5 * mm
    pdf.drawImage(
        str(LOGO_PATH),
        logo_x,
        logo_y,
        width=logo_width,
        height=logo_height,
        preserveAspectRatio=True,
        mask="auto",
    )

    pdf.setFillColorRGB(1, 1, 1)
    pdf.setFont(bold_font, 11)
    pdf.drawCentredString(
        x + width / 2,
        y + height * 0.665,
        "Naskenujte pro objednání servisu",
    )

    qr_size = width * 0.705
    qr_x = x + (width - qr_size) / 2
    qr_y = y + height * 0.11
    draw_matrix_pdf(pdf, matrix, qr_x, qr_y, qr_size)

    pdf.setFillColorRGB(1, 1, 1)
    pdf.setFont(bold_font, 18)
    pdf.drawCentredString(x + width / 2, y + 8.5 * mm, "lakodi.cz")
    pdf.setFillColorRGB(TEXT_MUTED[0] / 255, TEXT_MUTED[1] / 255, TEXT_MUTED[2] / 255)
    pdf.setFont(regular_font, 9)
    pdf.drawCentredString(x + width / 2, y + 4.6 * mm, "+420 776 053 625")

    pdf.setStrokeColorRGB(0.85, 0.87, 0.9)
    pdf.setLineWidth(0.25)
    pdf.rect(x, y, width, height, stroke=1, fill=0)


def save_sticker_pdf(matrix: list[list[bool]]) -> Path:
    regular_font, bold_font = register_pdf_fonts()
    output = OUTPUT_DIR / "lakodi-web-sticker-a6.pdf"
    pdf = canvas.Canvas(str(output), pagesize=(105 * mm, 148 * mm))
    draw_sticker_pdf(
        pdf,
        matrix,
        0,
        0,
        105 * mm,
        148 * mm,
        regular_font,
        bold_font,
    )
    pdf.save()
    return output


def save_a4_sheet_pdf(matrix: list[list[bool]]) -> Path:
    regular_font, bold_font = register_pdf_fonts()
    output = OUTPUT_DIR / "lakodi-web-sticker-a4-sheet.pdf"
    page_width, page_height = 210 * mm, 297 * mm
    sticker_width, sticker_height = page_width / 2, page_height / 2

    pdf = canvas.Canvas(str(output), pagesize=(page_width, page_height))
    for row in range(2):
        for col in range(2):
            draw_sticker_pdf(
                pdf,
                matrix,
                col * sticker_width,
                page_height - (row + 1) * sticker_height,
                sticker_width,
                sticker_height,
                regular_font,
                bold_font,
            )
    pdf.save()
    return output


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    matrix = make_matrix(QR_URL)
    generated = [
        save_svg(matrix),
        save_png(matrix),
        save_sticker_png(matrix),
        save_sticker_pdf(matrix),
        save_a4_sheet_pdf(matrix),
    ]
    print(f"QR URL: {QR_URL}")
    for path in generated:
        print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()
