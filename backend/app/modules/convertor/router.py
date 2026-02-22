from fastapi import APIRouter, File, UploadFile
from typing import List
from io import BytesIO
from PIL import Image, UnidentifiedImageError
import pillow_heif

pillow_heif.register_heif_opener()

router = APIRouter(prefix="/convertor", tags=["convertor"])
MAX_IMAGE_EDGE = 1920
THUMB_EDGE = 480


def _webp_bytes(source: Image.Image, max_edge: int, quality: int) -> bytes:
    image = source.copy()
    if image.width > max_edge or image.height > max_edge:
        image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
    output = BytesIO()
    image.save(output, format="WEBP", quality=quality, method=6)
    return output.getvalue()

@router.post("")
async def convert_images(files: List[UploadFile] = File(...)):
    converted = {}

    for file in files:
        data = await file.read()
        try:
            img = Image.open(BytesIO(data))
            webp_data = _webp_bytes(img, MAX_IMAGE_EDGE, 82)
            thumb_data = _webp_bytes(img, THUMB_EDGE, 70)
            converted[file.filename] = f"webp-ok ({len(webp_data)} B), thumb-ok ({len(thumb_data)} B)"
        except (UnidentifiedImageError, OSError):
            converted[file.filename] = "skipped-not-image"

    return {
        "status": "received",
        "count": len(files),
        "files": converted
    }
