from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.modules.chatbot.router import router as chatbot_router
from backend.app.modules.leads.router import router as leads_router
from backend.app.modules.convertor.router import router as convertor_router

app = FastAPI(title="Lakodi Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chatbot_router, prefix="/api/chatbot", tags=["chatbot"])
app.include_router(leads_router, prefix="/api/leads", tags=["leads"])
app.include_router(convertor_router, prefix="/api/convertor", tags=["convertor"])

@app.get("/api/health")
def health_check():
    return {"status": "ok"}
