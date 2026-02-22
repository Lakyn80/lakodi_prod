"""Shared helpers for homepage gallery slots."""

from sqlalchemy.orm import Session

from backend.app.modules.gallery.constants import HOME_GALLERY_SLOTS
from backend.app.modules.gallery.models import HomeGallerySlot


def ensure_home_slots(db: Session) -> list[HomeGallerySlot]:
    existing_rows = db.query(HomeGallerySlot).all()
    by_index = {row.slot_index: row for row in existing_rows}
    changed = False

    for idx, slot in enumerate(HOME_GALLERY_SLOTS):
        row = by_index.get(idx)
        if row is None:
            row = HomeGallerySlot(
                slot_index=idx,
                category=slot["category"],
                image_path=slot["default_image_path"],
            )
            db.add(row)
            changed = True
            continue
        if row.category != slot["category"]:
            row.category = slot["category"]
            changed = True

    if changed:
        db.commit()

    return db.query(HomeGallerySlot).order_by(HomeGallerySlot.slot_index.asc()).all()


def serialize_home_slot(slot: HomeGallerySlot) -> dict[str, int | str | None]:
    return {
        "slot_index": slot.slot_index,
        "category": slot.category,
        "image_path": slot.image_path,
    }
