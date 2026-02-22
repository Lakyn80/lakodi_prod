"""Odesílání recovery emailů přes Resend API."""
import os

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = os.getenv("ADMIN_FROM_EMAIL", "Lakodi <onboarding@resend.dev>")
RECOVERY_BASE_URL = os.getenv("ADMIN_RECOVERY_BASE_URL", "http://localhost:8080")


def is_email_configured() -> bool:
    return bool(RESEND_API_KEY)


def _send_email(to_email: str, subject: str, html: str) -> bool:
    if not RESEND_API_KEY:
        return False
    try:
        import resend  # type: ignore
        resend.api_key = RESEND_API_KEY
        resend.Emails.send({
            "from": FROM_EMAIL,
            "to": [to_email],
            "subject": subject,
            "html": html,
        })
        return True
    except Exception:
        return False


def send_recovery_email(to_email: str, token: str) -> bool:
    """
    Odešle recovery email s odkazem na přihlášení.
    Vrací True při úspěchu, False při chybě.
    """
    recovery_url = f"{RECOVERY_BASE_URL.rstrip('/')}/admin/login?recovery={token}"
    html = f"""
    <p>Dobrý den,</p>
    <p>Požádali jste o odkaz pro přihlášení do administrace Lakodi autoservis.</p>
    <p><a href="{recovery_url}">Přihlásit se přes tento odkaz</a></p>
    <p>Odkaz je platný 1 hodinu. Pokud jste o něj nepožádali, tento email ignorujte.</p>
    <p>— Lakodi</p>
    """
    return _send_email(to_email, "Přihlášení do administrace Lakodi", html)


def send_booking_confirmation_email(to_email: str, name: str, zakazka_id: int) -> bool:
    html = f"""
    <p>Dobrý den {name},</p>
    <p>potvrzujeme přijetí vaší poptávky č. {zakazka_id}.</p>
    <p>Brzy se vám ozveme s dalšími informacemi.</p>
    <p>— Lakodi autoservis</p>
    """
    return _send_email(to_email, f"Potvrzení poptávky #{zakazka_id}", html)


def send_booking_update_email(
    to_email: str,
    name: str,
    zakazka_id: int,
    status: str,
    repair_description: str | None,
    estimated_price: int | None,
    final_price: int | None,
) -> bool:
    est = f"{estimated_price} Kč" if estimated_price is not None else "—"
    final = f"{final_price} Kč" if final_price is not None else "—"
    html = f"""
    <p>Dobrý den {name},</p>
    <p>aktualizovali jsme vaši zakázku č. {zakazka_id}.</p>
    <p><strong>Status:</strong> {status}</p>
    <p><strong>Popis opravy:</strong> {repair_description or "—"}</p>
    <p><strong>Předběžná cena:</strong> {est}</p>
    <p><strong>Konečná cena:</strong> {final}</p>
    <p>— Lakodi autoservis</p>
    """
    return _send_email(to_email, f"Aktualizace zakázky #{zakazka_id}", html)
