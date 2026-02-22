"""Gallery admin API – upload a mazání."""
import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
import pillow_heif
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.db import get_db
from backend.app.modules.admin.router import require_admin
from backend.app.modules.gallery.constants import GALLERY_CATEGORIES
from backend.app.modules.gallery.home_slots_service import ensure_home_slots, serialize_home_slot
from backend.app.modules.gallery.models import GalleryMedia, HomeGallerySlot
from backend.app.modules.gallery.service_media_store import get_item_overrides, set_item_overrides

pillow_heif.register_heif_opener()

router = APIRouter()
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./data/uploads"))
MAX_MEDIA_BYTES = 1024 * 1024 * 1024  # 1 GB
MAX_IMAGE_EDGE = 1920


def _category_slug(category: str) -> str:
    s = category.lower().replace(" ", "-")
    return "".join(c if c.isalnum() or c == "-" else "-" for c in s).strip("-").replace("--", "-")


def _category_dir(category: str) -> Path:
    return UPLOAD_DIR / _category_slug(category)


def _ensure_category_dir(category: str) -> Path:
    d = _category_dir(category)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _home_slot_dir(slot_index: int) -> Path:
    d = UPLOAD_DIR / "home-gallery" / f"slot-{slot_index + 1:02d}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _delete_uploaded_file(image_path: str | None) -> None:
    if not image_path or image_path.startswith("/"):
        return
    file_path = (UPLOAD_DIR / image_path).resolve()
    upload_root = UPLOAD_DIR.resolve()
    if not str(file_path).startswith(str(upload_root)):
        return
    if file_path.exists():
        file_path.unlink()


def _safe_segment(value: str) -> str:
    safe = "".join(c if c.isalnum() or c in ("-", "_") else "-" for c in value.strip().lower())
    while "--" in safe:
        safe = safe.replace("--", "-")
    return safe.strip("-") or "item"


def _service_item_dir(service_slug: str, item_id: str) -> Path:
    d = UPLOAD_DIR / "service-gallery" / _safe_segment(service_slug) / _safe_segment(item_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _save_upload_with_limit(file: UploadFile, target_path: Path) -> None:
    total = 0
    chunk_size = 1024 * 1024
    with target_path.open("wb") as out:
        while True:
            chunk = file.file.read(chunk_size)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_MEDIA_BYTES:
                out.close()
                if target_path.exists():
                    target_path.unlink()
                raise HTTPException(status_code=413, detail="Soubor je větší než 1 GB")
            out.write(chunk)


def _optimize_saved_image(path: Path) -> Path:
    try:
        with Image.open(path) as image:
            if image.width > MAX_IMAGE_EDGE or image.height > MAX_IMAGE_EDGE:
                image.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE), Image.Resampling.LANCZOS)
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            optimized_path = path.with_suffix(".webp")
            image.save(optimized_path, format="WEBP", quality=82, method=6)
        if optimized_path != path and path.exists():
            path.unlink()
        return optimized_path
    except (UnidentifiedImageError, OSError):
        return path


def _get_home_slot(db: Session, slot_index: int) -> HomeGallerySlot:
    ensure_home_slots(db)
    slot = db.query(HomeGallerySlot).filter(HomeGallerySlot.slot_index == slot_index).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot nenalezen")
    return slot


@router.get("/home")
def home_gallery_slots(db: Session = Depends(get_db), _: None = Depends(require_admin)):
    slots = ensure_home_slots(db)
    return {"slots": [serialize_home_slot(slot) for slot in slots]}


@router.post("/home/{slot_index}/upload")
def home_gallery_upload(
    slot_index: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Soubor vyžadován")
    slot = _get_home_slot(db, slot_index)
    ext = Path(file.filename).suffix or ".jpg"
    safe_name = f"{uuid.uuid4().hex}{ext}"
    target_dir = _home_slot_dir(slot_index)
    target_path = target_dir / safe_name
    _save_upload_with_limit(file, target_path)
    target_path = _optimize_saved_image(target_path)
    _delete_uploaded_file(slot.image_path)
    rel_path = f"home-gallery/slot-{slot_index + 1:02d}/{target_path.name}"
    slot.image_path = rel_path
    db.commit()
    db.refresh(slot)
    return serialize_home_slot(slot)


@router.delete("/home/{slot_index}")
def home_gallery_delete(slot_index: int, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    slot = _get_home_slot(db, slot_index)
    _delete_uploaded_file(slot.image_path)
    slot.image_path = None
    db.commit()
    db.refresh(slot)
    return {"ok": True, "slot": serialize_home_slot(slot)}


@router.post("/upload")
def gallery_upload(
    file: UploadFile = File(...),
    category: str = Form(...),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    """Upload fotky do galerie (admin)."""
    if category not in GALLERY_CATEGORIES:
        raise HTTPException(status_code=400, detail="Neplatná kategorie")
    if not file.filename:
        raise HTTPException(status_code=400, detail="Soubor vyžadován")
    ext = Path(file.filename).suffix or ".jpg"
    safe_name = f"{uuid.uuid4().hex}{ext}"
    cat_dir = _ensure_category_dir(category)
    path = cat_dir / safe_name
    _save_upload_with_limit(file, path)
    path = _optimize_saved_image(path)
    rel_path = f"{_category_slug(category)}/{path.name}"
    m = GalleryMedia(category=category, image_path=rel_path)
    db.add(m)
    db.commit()
    db.refresh(m)
    return {"id": m.id, "image_path": rel_path}


@router.delete("/{media_id}")
def gallery_delete(media_id: int, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    """Smazat fotku z galerie (admin) – DB i soubor."""
    m = db.query(GalleryMedia).filter(GalleryMedia.id == media_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Záznam nenalezen")
    file_path = UPLOAD_DIR / m.image_path
    if file_path.exists():
        file_path.unlink()
    db.delete(m)
    db.commit()
    return {"ok": True}


class ServiceGallerySetRequest(BaseModel):
    media_paths: list[str]


class ServiceGalleryRemoveRequest(BaseModel):
    media_path: str
    media_paths: Optional[list[str]] = None


@router.post("/service/{service_slug}/{item_id}/upload")
def service_gallery_upload(
    service_slug: str,
    item_id: str,
    file: UploadFile = File(...),
    media_paths: str = Form("[]"),
    _: None = Depends(require_admin),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Soubor vyžadován")
    ext = Path(file.filename).suffix or ".jpg"
    safe_name = f"{uuid.uuid4().hex}{ext}"
    target_dir = _service_item_dir(service_slug, item_id)
    target_path = target_dir / safe_name
    _save_upload_with_limit(file, target_path)
    target_path = _optimize_saved_image(target_path)
    rel_path = f"service-gallery/{_safe_segment(service_slug)}/{_safe_segment(item_id)}/{target_path.name}"

    try:
        import json

        current = json.loads(media_paths)
        if not isinstance(current, list):
            current = []
    except Exception:
        current = []
    current_paths = [p for p in current if isinstance(p, str)]
    current_paths.append(rel_path)
    final_paths = set_item_overrides(service_slug, item_id, current_paths)
    return {"ok": True, "media_paths": final_paths}


@router.put("/service/{service_slug}/{item_id}")
def service_gallery_set(
    service_slug: str,
    item_id: str,
    body: ServiceGallerySetRequest,
    _: None = Depends(require_admin),
):
    final_paths = set_item_overrides(service_slug, item_id, body.media_paths)
    return {"ok": True, "media_paths": final_paths}


@router.post("/service/{service_slug}/{item_id}/remove")
def service_gallery_remove(
    service_slug: str,
    item_id: str,
    body: ServiceGalleryRemoveRequest,
    _: None = Depends(require_admin),
):
    current = body.media_paths if body.media_paths is not None else get_item_overrides(service_slug, item_id)
    kept = [p for p in current if p != body.media_path]
    if body.media_path and not body.media_path.startswith("/"):
        _delete_uploaded_file(body.media_path)
    final_paths = set_item_overrides(service_slug, item_id, kept)
    return {"ok": True, "media_paths": final_paths}
