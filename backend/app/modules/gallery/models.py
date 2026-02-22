"""Gallery media model."""
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func

from backend.app.db import Base


class GalleryMedia(Base):
    __tablename__ = "gallery_media"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(128), nullable=False, index=True)
    image_path = Column(String(512), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class HomeGallerySlot(Base):
    __tablename__ = "home_gallery_slots"

    id = Column(Integer, primary_key=True, index=True)
    slot_index = Column(Integer, nullable=False, unique=True, index=True)
    category = Column(String(128), nullable=False)
    image_path = Column(String(512), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
