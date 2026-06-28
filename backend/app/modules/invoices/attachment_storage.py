"""Local disk storage for invoice-related attachments."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
STORAGE_DIR = Path(__file__).resolve().parents[3] / "storage" / "invoice_attachments"


class InvoiceAttachmentStorageError(ValueError):
    """Attachment storage failure."""


@dataclass(frozen=True)
class StoredInvoiceAttachmentFile:
    original_filename: str
    stored_filename: str
    content_type: str
    size_bytes: int
    checksum_sha256: str


def store_invoice_attachment_file(upload: UploadFile) -> StoredInvoiceAttachmentFile:
    original_filename = _sanitize_original_filename(upload.filename)
    content_type = (upload.content_type or "application/octet-stream").strip() or "application/octet-stream"
    payload = upload.file.read()
    size_bytes = len(payload)
    if size_bytes <= 0:
        raise InvoiceAttachmentStorageError("Prázdný soubor nelze nahrát.")
    if size_bytes > DEFAULT_MAX_FILE_SIZE_BYTES:
        raise InvoiceAttachmentStorageError(
            f"Soubor je příliš velký. Maximální povolená velikost je {DEFAULT_MAX_FILE_SIZE_BYTES} bajtů."
        )

    checksum_sha256 = hashlib.sha256(payload).hexdigest()
    stored_filename = _generate_stored_filename(original_filename)
    storage_path = get_invoice_attachment_path(stored_filename)
    storage_path.write_bytes(payload)
    return StoredInvoiceAttachmentFile(
        original_filename=original_filename,
        stored_filename=stored_filename,
        content_type=content_type,
        size_bytes=size_bytes,
        checksum_sha256=checksum_sha256,
    )


def delete_invoice_attachment_file(stored_filename: str) -> None:
    path = get_invoice_attachment_path(stored_filename)
    if path.exists():
        path.unlink()


def get_invoice_attachment_path(stored_filename: str) -> Path:
    _ensure_storage_dir()
    safe_name = Path(stored_filename).name
    if not safe_name or safe_name != stored_filename:
        raise InvoiceAttachmentStorageError("Neplatný název uloženého souboru.")
    return STORAGE_DIR / safe_name


def attachment_file_exists(stored_filename: str) -> bool:
    return get_invoice_attachment_path(stored_filename).exists()


def _ensure_storage_dir() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def _sanitize_original_filename(filename: str | None) -> str:
    cleaned = (filename or "").replace("\\", "/").split("/")[-1].strip()
    if not cleaned:
        raise InvoiceAttachmentStorageError("Soubor musí mít název.")
    return cleaned


def _generate_stored_filename(original_filename: str) -> str:
    suffix = Path(original_filename).suffix.lower()
    generated_name = uuid4().hex
    return f"{generated_name}{suffix}" if suffix else generated_name
