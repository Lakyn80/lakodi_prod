import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.app.db import init_db
from backend.app.modules.convertor.router import router as convertor_router
from backend.app.modules.rag.router import router as rag_router
from backend.app.modules.services_catalog.router import router as services_catalog_router
from backend.app.modules.admin.router import router as admin_router
from backend.app.modules.gallery.admin_router import router as gallery_admin_router
from backend.app.modules.gallery.router import router as gallery_router
from backend.app.modules.zakazky.router import router as zakazky_router


UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./data/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        from backend.app.modules.admin.router import _seed_admin
        _seed_admin()
    except Exception:
        pass
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="Lakodi Backend", lifespan=lifespan)

# Pro credentials (cookies) musíme povolit konkrétní origin
_origins = os.getenv("CORS_ORIGINS", "http://localhost:8080,http://localhost:8081,http://localhost:3000,http://127.0.0.1:8080,http://127.0.0.1:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_router, prefix="/api/admin", tags=["admin"])
app.include_router(gallery_admin_router, prefix="/api/admin/gallery", tags=["gallery-admin"])
app.include_router(gallery_router, prefix="/api/gallery", tags=["gallery"])
app.include_router(zakazky_router, prefix="/api/zakazky", tags=["zakazky"])
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.include_router(rag_router, prefix="/api/rag", tags=["rag"])
app.include_router(services_catalog_router, prefix="/api/services-catalog", tags=["services-catalog"])
app.include_router(convertor_router, prefix="/api")

@app.get("/api/health")
def health():
    return {"status": "ok"}
