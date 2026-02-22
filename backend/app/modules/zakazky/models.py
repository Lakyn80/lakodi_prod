"""Zakázka database model."""
from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from sqlalchemy.sql import func
from backend.app.db import Base


class Zakazka(Base):
    __tablename__ = "zakazky"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(64), nullable=False, index=True)
    name = Column(String(256), nullable=False)
    email = Column(String(256), nullable=True, index=True)
    phone = Column(String(64), nullable=False)
    description = Column(Text, nullable=False)
    repair_description = Column(Text, nullable=True)
    status = Column(String(64), nullable=False, default="poptávka", index=True)
    estimated_price = Column(Integer, nullable=True)
    final_price = Column(Integer, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    answers = Column(Text, nullable=True)  # JSON string { question_key: answer }
    photos = Column(Text, nullable=True)  # JSON array of relative paths
    callback_requested = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
