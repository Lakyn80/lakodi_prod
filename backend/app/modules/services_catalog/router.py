from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def services_catalog_health():
    return {"status": "ok"}
