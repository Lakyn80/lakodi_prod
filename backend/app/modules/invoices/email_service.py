"""Odesílání faktur e-mailem."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from html import escape

from backend.app.modules.admin.email_service import EmailAttachment, is_email_configured, send_html_email
from backend.app.modules.invoices.exporters import build_invoice_export
from backend.app.modules.invoices.models import Invoice
from backend.app.modules.invoices.pdf_service import build_invoice_pdf_document

BUSINESS_MODE_LABELS = {
    "autoservice": "Autoservis",
    "construction": "Stavební práce",
}
TAX_MODE_LABELS = {
    "standard": "Běžný režim DPH",
    "reverse_charge": "Přenesená daňová povinnost",
}


class InvoiceEmailConfigurationError(RuntimeError):
    """Chybí konfigurace e-mailového odesílání."""


class InvoiceEmailSendError(RuntimeError):
    """Odeslání e-mailu s fakturou selhalo."""


@dataclass(frozen=True)
class InvoiceEmailDeliveryResult:
    invoice_id: int
    invoice_number: str
    sent_to: str


def deliver_invoice_email(invoice: Invoice, to_email: str | None = None) -> InvoiceEmailDeliveryResult:
    export = build_invoice_export(invoice)
    recipient = (to_email or export.customer.email or "").strip()
    if not recipient:
        raise InvoiceEmailSendError("Chybí e-mailová adresa příjemce faktury.")
    if not is_email_configured():
        raise InvoiceEmailConfigurationError("Odesílání e-mailů není nakonfigurované.")

    subject = f"Faktura {export.identity.invoice_number}"
    html = _build_invoice_email_html(export)
    pdf_document = build_invoice_pdf_document(invoice)
    attachments = [
        EmailAttachment(
            filename=pdf_document.filename,
            content=pdf_document.content,
            content_type=pdf_document.content_type,
        )
    ]
    if not send_html_email(recipient, subject, html, attachments=attachments):
        raise InvoiceEmailSendError("Fakturu se nepodařilo odeslat e-mailem.")

    return InvoiceEmailDeliveryResult(
        invoice_id=export.identity.id,
        invoice_number=export.identity.invoice_number,
        sent_to=recipient,
    )


def _build_invoice_email_html(export) -> str:
    item_rows = "".join(
        f"""
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">{escape(item.description)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">{_format_decimal(item.quantity)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">{_format_money(item.unit_price)} {escape(export.totals.currency)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">{_format_money(item.line_total)} {escape(export.totals.currency)}</td>
        </tr>
        """
        for item in export.items
    )

    reverse_charge_block = ""
    if export.reverse_charge_text:
        reverse_charge_block = f"""
        <p style="margin:16px 0 0;"><strong>Přenesená daňová povinnost:</strong><br>{escape(export.reverse_charge_text)}</p>
        """

    note_block = ""
    if export.note:
        note_block = f"""
        <p style="margin:16px 0 0;"><strong>Poznámka:</strong><br>{escape(export.note)}</p>
        """

    business_mode = BUSINESS_MODE_LABELS.get(export.business_mode, export.business_mode)
    tax_mode = TAX_MODE_LABELS.get(export.tax_mode, export.tax_mode)

    return f"""
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;max-width:760px;margin:0 auto;padding:24px;">
      <h1 style="margin:0 0 16px;font-size:24px;">Faktura {escape(export.identity.invoice_number)}</h1>
      <p style="margin:0 0 8px;">Dobrý den, v příloze zasíláme PDF fakturu k vaší zakázce.</p>
      <p style="margin:0 0 8px;"><strong>Odběratel:</strong> {escape(export.customer.name)}</p>
      <p style="margin:0 0 8px;"><strong>Datum vystavení:</strong> {export.identity.issue_date}</p>
      <p style="margin:0 0 8px;"><strong>Datum splatnosti:</strong> {export.identity.due_date}</p>
      <p style="margin:0 0 8px;"><strong>Režim faktury:</strong> {escape(business_mode)} / {escape(tax_mode)}</p>

      <table style="width:100%;border-collapse:collapse;margin:24px 0;">
        <thead>
          <tr style="background:#f3f4f6;text-align:left;">
            <th style="padding:8px;">Položka</th>
            <th style="padding:8px;text-align:right;">Množství</th>
            <th style="padding:8px;text-align:right;">Jednotková cena</th>
            <th style="padding:8px;text-align:right;">Celkem</th>
          </tr>
        </thead>
        <tbody>{item_rows}</tbody>
      </table>

      <p style="margin:8px 0;"><strong>Mezisoučet:</strong> {_format_money(export.totals.subtotal)} {escape(export.totals.currency)}</p>
      <p style="margin:8px 0;"><strong>DPH:</strong> {_format_money(export.totals.vat_amount)} {escape(export.totals.currency)}</p>
      <p style="margin:8px 0 0;"><strong>Celkem:</strong> {_format_money(export.totals.total)} {escape(export.totals.currency)}</p>
      {reverse_charge_block}
      {note_block}
    </div>
    """


def _format_money(value: Decimal) -> str:
    return f"{Decimal(value):.2f}"


def _format_decimal(value: Decimal) -> str:
    normalized = Decimal(value).normalize()
    return format(normalized, "f").rstrip("0").rstrip(".") or "0"
