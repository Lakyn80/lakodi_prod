"""Odesílání admin a transakčních emailů přes Resend API nebo SMTP."""
from __future__ import annotations

import base64
import os
import smtplib
import ssl
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from email.message import EmailMessage
from email.utils import parseaddr
from html import escape
from typing import Mapping

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = os.getenv("ADMIN_FROM_EMAIL", "Lakodi <onboarding@resend.dev>")
RECOVERY_BASE_URL = os.getenv("ADMIN_RECOVERY_BASE_URL", "http://localhost:8080")
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "0") or "0")
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "true").strip().lower() in {"1", "true", "yes", "on"}
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "false").strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class EmailAttachment:
    filename: str
    content: bytes
    content_type: str = "application/octet-stream"


def _is_smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_PORT and SMTP_USER and SMTP_PASSWORD)


def is_email_configured() -> bool:
    return bool(RESEND_API_KEY) or _is_smtp_configured()


def _build_email_message(
    to_email: str,
    subject: str,
    html: str,
    attachments: Sequence[EmailAttachment] | None = None,
    cc: Sequence[str] | None = None,
) -> EmailMessage:
    message = EmailMessage()
    message["From"] = FROM_EMAIL
    message["To"] = to_email
    if cc:
        message["Cc"] = ", ".join(cc)
    message["Subject"] = subject
    message.set_content("Tato zpráva obsahuje HTML verzi.")
    message.add_alternative(html, subtype="html")

    for attachment in attachments or ():
        maintype, _, subtype = attachment.content_type.partition("/")
        if not maintype or not subtype:
            maintype, subtype = "application", "octet-stream"
        message.add_attachment(
            attachment.content,
            maintype=maintype,
            subtype=subtype,
            filename=attachment.filename,
        )

    return message


def _send_email_smtp(
    to_email: str,
    subject: str,
    html: str,
    attachments: Sequence[EmailAttachment] | None = None,
    cc: Sequence[str] | None = None,
    bcc: Sequence[str] | None = None,
) -> bool:
    if not _is_smtp_configured():
        return False
    try:
        from_addr = parseaddr(FROM_EMAIL)[1] or SMTP_USER
        cc_list = [email for email in (cc or ()) if email]
        bcc_list = [email for email in (bcc or ()) if email]
        message = _build_email_message(to_email, subject, html, attachments, cc=cc_list)
        recipient_list = [to_email, *cc_list, *bcc_list]

        if SMTP_USE_SSL:
            with smtplib.SMTP_SSL(
                SMTP_HOST,
                SMTP_PORT,
                timeout=20,
                context=ssl.create_default_context(),
            ) as server:
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(message, from_addr=from_addr, to_addrs=recipient_list)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
                if SMTP_USE_TLS:
                    server.starttls(context=ssl.create_default_context())
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(message, from_addr=from_addr, to_addrs=recipient_list)
        return True
    except Exception:
        return False


def _send_email(
    to_email: str,
    subject: str,
    html: str,
    attachments: Sequence[EmailAttachment] | None = None,
    cc: Sequence[str] | None = None,
    bcc: Sequence[str] | None = None,
) -> bool:
    if _is_smtp_configured():
        return _send_email_smtp(to_email, subject, html, attachments, cc=cc, bcc=bcc)
    if RESEND_API_KEY:
        try:
            import resend  # type: ignore

            resend.api_key = RESEND_API_KEY
            payload = {
                "from": FROM_EMAIL,
                "to": [to_email],
                "subject": subject,
                "html": html,
            }
            if cc:
                payload["cc"] = [email for email in cc if email]
            if bcc:
                payload["bcc"] = [email for email in bcc if email]
            if attachments:
                payload["attachments"] = [
                    {
                        "filename": attachment.filename,
                        "content": base64.b64encode(attachment.content).decode("ascii"),
                    }
                    for attachment in attachments
                ]
            resend.Emails.send(payload)
            return True
        except Exception:
            pass
    return _send_email_smtp(to_email, subject, html, attachments, cc=cc, bcc=bcc)


def send_html_email(
    to_email: str,
    subject: str,
    html: str,
    attachments: Sequence[EmailAttachment] | None = None,
    cc: Sequence[str] | None = None,
    bcc: Sequence[str] | None = None,
) -> bool:
    """Public helper for sending arbitrary HTML emails via configured provider."""

    return _send_email(to_email, subject, html, attachments, cc=cc, bcc=bcc)


def send_recovery_email(to_email: str, token: str) -> bool:
    """
    Odešle recovery email s odkazem na přihlášení.
    Vrací True při úspěchu, False při chybě.
    """
    recovery_url = f"{RECOVERY_BASE_URL.rstrip('/')}/admin/recover?token={token}"
    html = f"""
    <p>Dobrý den,</p>
    <p>Požádali jste o odkaz pro přihlášení do administrace Lakodi autoservis.</p>
    <p><a href="{recovery_url}">Obnovit heslo přes tento odkaz</a></p>
    <p>Odkaz je platný 1 hodinu. Pokud jste o něj nepožádali, tento email ignorujte.</p>
    <p>— Lakodi</p>
    """
    return send_html_email(to_email, "Přihlášení do administrace Lakodi", html)


def send_booking_confirmation_email(to_email: str, name: str, zakazka_id: int) -> bool:
    html = f"""
    <p>Dobrý den {name},</p>
    <p>potvrzujeme přijetí vaší poptávky č. {zakazka_id}.</p>
    <p>Brzy se vám ozveme s dalšími informacemi.</p>
    <p>— Lakodi autoservis</p>
    """
    return send_html_email(to_email, f"Potvrzení poptávky #{zakazka_id}", html)


def _resolve_booking_notification_email() -> str:
    explicit = os.getenv("BOOKING_NOTIFICATION_EMAIL", "").strip().lower()
    if explicit:
        return explicit
    fallback = os.getenv("ADMIN_EMAIL", "").strip().lower()
    if fallback:
        return fallback
    return "lakodi@seznam.cz"


def _resolve_booking_admin_base_url() -> str:
    return (os.getenv("BOOKING_ADMIN_BASE_URL", "").strip() or RECOVERY_BASE_URL.strip()).rstrip("/")


def _format_booking_datetime(value: datetime | None) -> str:
    if value is None:
        return "—"
    return value.strftime("%d.%m.%Y %H:%M")


def _to_html_text(value: str | None) -> str:
    cleaned = str(value or "").strip()
    if not cleaned:
        return "—"
    return escape(cleaned).replace("\n", "<br>")


def _format_booking_answers_html(answers: Mapping[str, object] | None) -> str:
    items: list[str] = []
    for key, value in (answers or {}).items():
        answer = str(value or "").strip()
        if not answer:
            continue
        items.append(f"<li><strong>{escape(str(key))}:</strong> {escape(answer)}</li>")
    if not items:
        return "<li>—</li>"
    return "".join(items)


def send_booking_owner_notification_email(
    *,
    zakazka_id: int,
    category: str,
    name: str,
    email: str | None,
    phone: str,
    description: str,
    answers: Mapping[str, object] | None = None,
    callback_requested: bool = False,
    created_at: datetime | None = None,
    photos_count: int = 0,
) -> bool:
    to_email = _resolve_booking_notification_email()
    if not to_email:
        return False

    base_url = _resolve_booking_admin_base_url()
    detail_url = f"{base_url}/admin/zakazky/{zakazka_id}" if base_url else ""

    actions: list[str] = []
    if detail_url:
        actions.append(
            f'<a href="{escape(detail_url, quote=True)}" '
            'style="display:inline-block;padding:10px 14px;border-radius:8px;'
            'background:#111827;color:#ffffff;text-decoration:none;font-weight:600;">'
            "Otevřít v adminu</a>"
        )
    actions_html = "&nbsp;".join(actions) if actions else ""

    html = f"""
    <p>Dorazila nová poptávka do adminu Lakodi.</p>
    <p><strong>Přijato:</strong> {_format_booking_datetime(created_at)}</p>
    <p><strong>ID:</strong> #{zakazka_id}</p>
    <p><strong>Kategorie:</strong> {escape(category)}</p>
    <p><strong>Jméno:</strong> {escape(name)}</p>
    <p><strong>Email:</strong> {_to_html_text(email)}</p>
    <p><strong>Telefon:</strong> {escape(phone)}</p>
    <p><strong>Zpětné volání:</strong> {"Ano" if callback_requested else "Ne"}</p>
    <p><strong>Počet fotek:</strong> {photos_count}</p>
    <p><strong>Popis:</strong><br>{_to_html_text(description)}</p>
    <p><strong>Doplňující odpovědi:</strong></p>
    <ul>{_format_booking_answers_html(answers)}</ul>
    {f"<p>{actions_html}</p>" if actions_html else ""}
    <p>— Lakodi autoservis</p>
    """
    return send_html_email(to_email, f"Nová poptávka #{zakazka_id} – {name}", html)


def send_booking_update_email(
    to_email: str,
    name: str,
    zakazka_id: int,
    status: str,
    repair_description: str | None,
    estimated_price: int | None,
    final_price: int | None,
    order_number: str | None = None,
    appointment_label: str | None = None,
) -> bool:
    display_number = order_number or str(zakazka_id)
    est = f"{estimated_price} Kč" if estimated_price is not None else "—"
    final = f"{final_price} Kč" if final_price is not None else "—"
    appointment = appointment_label or "—"
    html = f"""
    <p>Dobrý den {name},</p>
    <p>aktualizovali jsme vaši zakázku č. {display_number}.</p>
    <p><strong>Číslo objednávky:</strong> {display_number}</p>
    <p><strong>Termín:</strong> {appointment}</p>
    <p><strong>Status:</strong> {status}</p>
    <p><strong>Popis opravy:</strong> {repair_description or "—"}</p>
    <p><strong>Předběžná cena:</strong> {est}</p>
    <p><strong>Konečná cena:</strong> {final}</p>
    <p>— Lakodi autoservis</p>
    """
    return send_html_email(to_email, f"Aktualizace zakázky {display_number}", html)
