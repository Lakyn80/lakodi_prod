"""Zakázky API – ukládání, správa statusů, statistiky a notifikace."""
import json
import os
import uuid
from io import BytesIO
from datetime import datetime
from pathlib import Path
from urllib.parse import quote
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
import pillow_heif
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.db import get_db
from backend.app.modules.admin.email_service import (
    send_booking_confirmation_email,
    send_booking_owner_notification_email,
    send_booking_update_email,
)
from backend.app.modules.admin.router import require_admin
from backend.app.modules.zakazky.models import Zakazka
from backend.app.modules.zakazky.schemas import ZakazkaResponse

pillow_heif.register_heif_opener()

router = APIRouter()

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./data/uploads"))
WHATSAPP_NUMBER = os.getenv("WHATSAPP_NUMBER", "420776053625")
MAX_IMAGE_EDGE = 1920
ALLOWED_STATUSES = (
    "poptávka",
    "odeslaná nabídka",
    "potvrzená objednávka",
    "hotovo",
)


def _resolve_upload_public_base_url() -> str:
    explicit = os.getenv("UPLOAD_PUBLIC_BASE_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    for key in ("NEXT_PUBLIC_API_URL", "ADMIN_RECOVERY_BASE_URL"):
        base = os.getenv(key, "").strip()
        if base.startswith("http://") or base.startswith("https://"):
            return f"{base.rstrip('/')}/api/uploads"
    return "https://lakodi.cz/api/uploads"


UPLOAD_PUBLIC_BASE_URL = _resolve_upload_public_base_url()


def ensure_upload_dir():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _optimize_uploaded_photo(content: bytes, original_ext: str) -> tuple[bytes, str]:
    ext = (original_ext or ".jpg").lower()
    try:
        image = Image.open(BytesIO(content))
        if image.width > MAX_IMAGE_EDGE or image.height > MAX_IMAGE_EDGE:
            image.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE), Image.Resampling.LANCZOS)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
        output = BytesIO()
        image.save(output, format="WEBP", quality=82, method=6)
        return output.getvalue(), ".webp"
    except (UnidentifiedImageError, OSError):
        return content, ext


def _build_whatsapp_message(z: Zakazka) -> str:
    answers_obj = json.loads(z.answers) if z.answers else {}
    photos_list = json.loads(z.photos) if z.photos else []
    lines = [
        f"Zakázka #{z.id} – Lakodi autoservis",
        "",
        f"Kategorie: {z.category}",
        f"Jméno: {z.name}",
        f"Email: {z.email or '—'}",
        f"Telefon: {z.phone}",
        f"Status: {z.status}",
        f"Popis: {z.description}",
    ]
    if z.repair_description:
        lines.append(f"Popis opravy: {z.repair_description}")
    if z.estimated_price is not None:
        lines.append(f"Předběžná cena: {z.estimated_price} Kč")
    if z.final_price is not None:
        lines.append(f"Konečná cena: {z.final_price} Kč")
    for k, v in (answers_obj or {}).items():
        if v:
            lines.append(f"{k}: {v}")
    if photos_list:
        lines.append("")
        lines.append(f"📷 Klient přiložil {len(photos_list)} fotku/fotek:")
        base = UPLOAD_PUBLIC_BASE_URL.rstrip("/")
        for index, photo in enumerate(photos_list, start=1):
            if isinstance(photo, str) and photo.strip():
                rel = photo.strip()
                photo_url = ""
                if rel.startswith("http://") or rel.startswith("https://"):
                    photo_url = rel
                else:
                    photo_url = f"{base}/{rel.lstrip('/')}"
                lines.append(f"fotka_{index}: {photo_url}")
    if z.callback_requested:
        lines.append("")
        lines.append("⚠️ Klient žádá zpětné volání")
    return "\n".join(lines)


def _build_whatsapp_url(message: str) -> str:
    return f"https://wa.me/{WHATSAPP_NUMBER}?text={quote(message)}"


def _get_zakazka_or_404(db: Session, zakazka_id: int) -> Zakazka:
    z = db.query(Zakazka).filter(Zakazka.id == zakazka_id).first()
    if not z:
        raise HTTPException(status_code=404, detail="Zakázka nenalezena")
    return z


def _load_answers_obj(z: Zakazka) -> dict:
    if not z.answers:
        return {}
    try:
        data = json.loads(z.answers)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _appointment_label_from_answers(answers_obj: dict) -> Optional[str]:
    preferred_date = str(answers_obj.get("preferred_date") or "").strip()
    preferred_time = str(answers_obj.get("preferred_time") or "").strip()
    if not preferred_date:
        return None
    try:
        if preferred_time:
            dt = datetime.fromisoformat(f"{preferred_date}T{preferred_time}")
            return dt.strftime("%d.%m.%Y %H:%M")
        dt = datetime.fromisoformat(preferred_date)
        return dt.strftime("%d.%m.%Y")
    except ValueError:
        return f"{preferred_date} {preferred_time}".strip()


class ZakazkaUpdateRequest(BaseModel):
    status: Optional[str] = None
    estimated_price: Optional[int] = None
    final_price: Optional[int] = None
    repair_description: Optional[str] = None
    admin_order_number: Optional[str] = None
    preferred_date: Optional[str] = None
    preferred_time: Optional[str] = None


@router.post("")
def create_zakazka(
    category: str = Form(...),
    name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    description: str = Form(...),
    answers: str = Form("{}"),
    callback_requested: str = Form("false"),
    photos: Optional[list[UploadFile]] = File(None),
    db: Session = Depends(get_db),
):
    ensure_upload_dir()
    photo_paths: list[str] = []

    for f in (photos or []):
        if f.filename:
            original_ext = Path(f.filename).suffix or ".jpg"
            content = f.file.read()
            optimized_content, ext = _optimize_uploaded_photo(content, original_ext)
            safe_name = f"{uuid.uuid4().hex}{ext}"
            path = UPLOAD_DIR / safe_name
            path.write_bytes(optimized_content)
            photo_paths.append(safe_name)

    z = Zakazka(
        category=category,
        name=name,
        email=email.strip(),
        phone=phone,
        description=description,
        status="poptávka",
        answers=answers,
        photos=json.dumps(photo_paths),
        callback_requested=callback_requested.lower() == "true",
    )
    db.add(z)
    db.commit()
    db.refresh(z)

    answers_obj = _load_answers_obj(z)
    whatsapp_message = _build_whatsapp_message(z)
    whatsapp_url = _build_whatsapp_url(whatsapp_message)
    confirmation_email_sent = (
        send_booking_confirmation_email(
            to_email=z.email or "",
            name=z.name,
            zakazka_id=z.id,
        )
        if z.email
        else False
    )
    owner_notification_email_sent = send_booking_owner_notification_email(
        zakazka_id=z.id,
        category=z.category,
        name=z.name,
        email=z.email,
        phone=z.phone,
        description=z.description,
        answers=answers_obj,
        callback_requested=z.callback_requested,
        created_at=z.created_at,
        photos_count=len(photo_paths),
    )

    return {
        "id": z.id,
        "status": "saved",
        "whatsapp_message": whatsapp_message,
        "whatsapp_url": whatsapp_url,
        "confirmation_email_sent": confirmation_email_sent,
        "owner_notification_email_sent": owner_notification_email_sent,
    }


@router.get("")
def list_zakazky(db: Session = Depends(get_db), _: None = Depends(require_admin)):
    rows = db.query(Zakazka).order_by(Zakazka.created_at.desc()).all()
    return [ZakazkaResponse(r).to_dict() for r in rows]


@router.get("/stats")
def zakazky_stats(db: Session = Depends(get_db), _: None = Depends(require_admin)):
    now = datetime.now()
    rows = (
        db.query(Zakazka)
        .filter(Zakazka.status == "hotovo")
        .filter(Zakazka.final_price.isnot(None))
        .all()
    )
    daily = 0
    monthly = 0
    yearly = 0
    completed_count = 0
    for z in rows:
        if not z.completed_at or z.final_price is None:
            continue
        completed_count += 1
        amount = int(z.final_price)
        if z.completed_at.date() == now.date():
            daily += amount
        if z.completed_at.year == now.year and z.completed_at.month == now.month:
            monthly += amount
        if z.completed_at.year == now.year:
            yearly += amount
    return {
        "daily_revenue": daily,
        "monthly_revenue": monthly,
        "yearly_revenue": yearly,
        "completed_count": completed_count,
    }


@router.get("/{zakazka_id}")
def get_zakazka(zakazka_id: int, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    z = _get_zakazka_or_404(db, zakazka_id)
    return ZakazkaResponse(z).to_dict()


@router.patch("/{zakazka_id}")
def update_zakazka(
    zakazka_id: int,
    body: ZakazkaUpdateRequest,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    z = _get_zakazka_or_404(db, zakazka_id)

    if body.status is not None:
        if body.status not in ALLOWED_STATUSES:
            raise HTTPException(status_code=400, detail="Neplatný status")
        z.status = body.status
    if body.repair_description is not None:
        z.repair_description = body.repair_description
    if body.estimated_price is not None:
        z.estimated_price = body.estimated_price
    if body.final_price is not None:
        z.final_price = body.final_price
    if (
        body.admin_order_number is not None
        or body.preferred_date is not None
        or body.preferred_time is not None
    ):
        answers_obj = _load_answers_obj(z)
        if body.admin_order_number is not None:
            order_number = body.admin_order_number.strip()
            if order_number:
                answers_obj["admin_order_number"] = order_number
            else:
                answers_obj.pop("admin_order_number", None)

        preferred_date_cleared = False
        if body.preferred_date is not None:
            preferred_date = body.preferred_date.strip()
            if preferred_date:
                answers_obj["preferred_date"] = preferred_date
            else:
                answers_obj.pop("preferred_date", None)
                answers_obj.pop("preferred_time", None)
                preferred_date_cleared = True

        if not preferred_date_cleared and body.preferred_time is not None:
            preferred_time = body.preferred_time.strip()
            if preferred_time:
                answers_obj["preferred_time"] = preferred_time
            else:
                answers_obj.pop("preferred_time", None)
        z.answers = json.dumps(answers_obj)

    if z.status == "hotovo":
        if z.final_price is None:
            raise HTTPException(status_code=400, detail="Pro status hotovo je vyžadována konečná cena")
        z.completed_at = datetime.now()

    db.commit()
    db.refresh(z)
    return ZakazkaResponse(z).to_dict()


@router.post("/{zakazka_id}/send-email")
def send_zakazka_email(zakazka_id: int, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    z = _get_zakazka_or_404(db, zakazka_id)
    if not z.email:
        raise HTTPException(status_code=400, detail="Zakázka nemá email zákazníka")
    answers_obj = _load_answers_obj(z)
    order_number = str(answers_obj.get("admin_order_number") or "").strip() or None
    appointment_label = _appointment_label_from_answers(answers_obj)
    sent = send_booking_update_email(
        to_email=z.email,
        name=z.name,
        zakazka_id=z.id,
        status=z.status,
        repair_description=z.repair_description,
        estimated_price=z.estimated_price,
        final_price=z.final_price,
        order_number=order_number,
        appointment_label=appointment_label,
    )
    if not sent:
        raise HTTPException(status_code=500, detail="Nepodařilo se odeslat email")
    return {"ok": True}


@router.get("/{zakazka_id}/whatsapp-link")
def zakazka_whatsapp_link(zakazka_id: int, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    z = _get_zakazka_or_404(db, zakazka_id)
    message = _build_whatsapp_message(z)
    return {"url": _build_whatsapp_url(message), "message": message}

