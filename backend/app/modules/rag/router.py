from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def rag_health():
    return {"status": "ok"}
