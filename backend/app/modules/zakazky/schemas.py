"""Pydantic schemas for Zakázka API."""


class ZakazkaResponse:
    """Output for API responses."""

    def __init__(self, row):
        import json
        self.id = row.id
        self.category = row.category
        self.name = row.name
        self.email = row.email
        self.phone = row.phone
        self.description = row.description
        self.repair_description = row.repair_description
        self.status = row.status
        self.estimated_price = row.estimated_price
        self.final_price = row.final_price
        self.answers = json.loads(row.answers) if row.answers else {}
        self.photos = json.loads(row.photos) if row.photos else []
        self.callback_requested = row.callback_requested
        self.completed_at = row.completed_at.isoformat() if row.completed_at else None
        self.created_at = row.created_at.isoformat() if row.created_at else None

    def to_dict(self):
        return {
            "id": self.id,
            "category": self.category,
            "name": self.name,
            "email": self.email,
            "phone": self.phone,
            "description": self.description,
            "repair_description": self.repair_description,
            "status": self.status,
            "estimated_price": self.estimated_price,
            "final_price": self.final_price,
            "answers": self.answers,
            "photos": self.photos,
            "callback_requested": self.callback_requested,
            "completed_at": self.completed_at,
            "created_at": self.created_at,
        }
