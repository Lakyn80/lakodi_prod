"""User model pro role-based auth."""
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func

from backend.app.db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(256), nullable=False, unique=True, index=True)
    password_hash = Column(String(256), nullable=False)
    role = Column(String(32), nullable=False, default="user")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
