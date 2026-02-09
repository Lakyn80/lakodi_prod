from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()

class Lead(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    problem: str
    photos: Optional[List[str]] = None

fake_db = []

@router.post("")
def create_lead(lead: Lead):
    fake_db.append(lead.dict())
    return {"status": "saved", "id": len(fake_db)}

@router.get("")
def list_leads():
    return fake_db
