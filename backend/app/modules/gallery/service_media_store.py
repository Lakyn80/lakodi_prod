"""Filesystem store for service-detail gallery media overrides."""
import json
import os
from pathlib import Path


SERVICE_GALLERY_FILE = Path(os.getenv("SERVICE_GALLERY_FILE", "./data/service_gallery.json"))


def _ensure_parent_dir() -> None:
    SERVICE_GALLERY_FILE.parent.mkdir(parents=True, exist_ok=True)


def _load_store() -> dict[str, list[str]]:
    if not SERVICE_GALLERY_FILE.exists():
        return {}
    try:
        raw = json.loads(SERVICE_GALLERY_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(raw, dict):
        return {}
    out: dict[str, list[str]] = {}
    for key, value in raw.items():
        if isinstance(key, str) and isinstance(value, list):
            out[key] = [v for v in value if isinstance(v, str)]
    return out


def _save_store(store: dict[str, list[str]]) -> None:
    _ensure_parent_dir()
    SERVICE_GALLERY_FILE.write_text(
        json.dumps(store, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _make_key(service_slug: str, item_id: str) -> str:
    return f"{service_slug.strip()}::{item_id.strip()}"


def get_service_overrides(service_slug: str) -> dict[str, list[str]]:
    store = _load_store()
    prefix = f"{service_slug.strip()}::"
    result: dict[str, list[str]] = {}
    for key, media in store.items():
        if key.startswith(prefix):
            result[key[len(prefix):]] = media
    return result


def get_item_overrides(service_slug: str, item_id: str) -> list[str]:
    store = _load_store()
    return store.get(_make_key(service_slug, item_id), [])


def set_item_overrides(service_slug: str, item_id: str, media_paths: list[str]) -> list[str]:
    store = _load_store()
    key = _make_key(service_slug, item_id)
    cleaned = [p for p in media_paths if isinstance(p, str) and p.strip()]
    unique: list[str] = []
    for p in cleaned:
        if p not in unique:
            unique.append(p)
    store[key] = unique
    _save_store(store)
    return unique

