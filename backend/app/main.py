import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.app.db import init_db
from backend.app.modules.ai_accounting.router import router as ai_accounting_router
from backend.app.modules.convertor.router import router as convertor_router
from backend.app.modules.rag.router import router as rag_router
from backend.app.modules.services_catalog.router import router as services_catalog_router
from backend.app.modules.admin.router import router as admin_router
from backend.app.modules.gallery.admin_router import router as gallery_admin_router
from backend.app.modules.gallery.router import router as gallery_router
from backend.app.modules.invoices.router import router as invoices_router
from backend.app.modules.zakazky.router import router as zakazky_router


UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./data/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from backend.app.modules.ai_accounting.tracing import (
            configure_json_logging_if_requested,
            configure_tracing,
            instrument_fastapi_app,
        )

        configure_json_logging_if_requested()
        configure_tracing(service_name=os.getenv("OTEL_SERVICE_NAME", "lakodi"))
        instrument_fastapi_app(app)
    except Exception:
        pass
    init_db()
    try:
        from backend.app.modules.admin.router import _seed_admin
        _seed_admin()
    except Exception:
        pass
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="Lakodi Backend", lifespan=lifespan)

# Continue inbound W3C trace context for the full request (soft no-op without OTEL).
try:
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request
    from starlette.responses import Response

    class _TraceContextMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next) -> Response:
            try:
                from backend.app.modules.ai_accounting.tracing import attach_trace_context

                with attach_trace_context(dict(request.headers)):
                    return await call_next(request)
            except Exception:
                return await call_next(request)

    app.add_middleware(_TraceContextMiddleware)
except Exception:
    pass

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
app.include_router(invoices_router, prefix="/api/admin/invoices", tags=["invoices"])
app.include_router(ai_accounting_router, prefix="/internal/ai/v1/accounting", tags=["ai-accounting"])
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
