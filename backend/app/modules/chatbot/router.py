from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class ChatMessage(BaseModel):
    session_id: str
    message: str
    brand: Optional[str] = None
    model: Optional[str] = None

@router.post("/message")
def chatbot_message(payload: ChatMessage):
    # MVP logika – zatím jen echo + další otázka
    next_question = "Jaký je model auta?"

    return {
        "reply": f"Díky, zapsáno: {payload.message}",
        "next_question": next_question
    }
