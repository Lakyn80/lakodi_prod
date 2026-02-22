"""Gallery API – veřejné načítání."""
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

from backend.app.db import SessionLocal
from backend.app.modules.gallery.constants import GALLERY_CATEGORIES
from backend.app.modules.gallery.home_slots_service import ensure_home_slots, serialize_home_slot
from backend.app.modules.gallery.models import GalleryMedia
from backend.app.modules.gallery.service_media_store import get_service_overrides

router = APIRouter()
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./data/uploads"))


@router.get("/categories")
def list_categories():
    """Seznam pevných kategorií (veřejné)."""
    return {"categories": list(GALLERY_CATEGORIES)}


@router.get("/home")
def get_home_gallery():
    """Fixní sloty homepage galerie (veřejné)."""
    db = SessionLocal()
    try:
        slots = ensure_home_slots(db)
        return {"slots": [serialize_home_slot(slot) for slot in slots]}
    finally:
        db.close()


@router.get("/{category}")
def get_gallery(category: str):
    """Fotky dané kategorie (veřejné)."""
    if category not in GALLERY_CATEGORIES:
        raise HTTPException(status_code=404, detail="Kategorie nenalezena")
    db = SessionLocal()
    try:
        rows = db.query(GalleryMedia).filter(GalleryMedia.category == category).order_by(GalleryMedia.created_at.desc()).all()
        media = [{"id": r.id, "image_path": r.image_path} for r in rows]
        return {"category": category, "images": media, "media": media}
    finally:
        db.close()


@router.get("/service/{service_slug}")
def get_service_gallery(service_slug: str):
    """Vrátí override média pro detail služby podle item_id."""
    return {"service_slug": service_slug, "items": get_service_overrides(service_slug)}
