from fastapi import APIRouter, UploadFile, File
from typing import List

router = APIRouter()

@router.post("")
async def convert_images(files: List[UploadFile] = File(...)):
    filenames = [f.filename for f in files]

    return {
        "status": "received",
        "count": len(files),
        "files": filenames,
        "note": "zatím jen mock endpoint — další krok bude skutečný WebP převod"
    }
