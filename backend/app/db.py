"""SQLite database setup for Lakodi."""
import os
from sqlalchemy import text
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import StaticPool

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")
# SQLite needs connect_args for relative path
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs = {"connect_args": {"check_same_thread": False}}
    if DATABASE_URL.endswith(":memory:"):
        engine_kwargs["poolclass"] = StaticPool
    engine = create_engine(DATABASE_URL, **engine_kwargs)
else:
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def _ensure_zakazky_columns():
    if not DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as conn:
        exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='zakazky'")
        ).fetchone()
        if not exists:
            return
        rows = conn.execute(text("PRAGMA table_info(zakazky)")).fetchall()
        columns = {row[1] for row in rows}
        add_map = {
            "email": "ALTER TABLE zakazky ADD COLUMN email VARCHAR(256)",
            "repair_description": "ALTER TABLE zakazky ADD COLUMN repair_description TEXT",
            "status": "ALTER TABLE zakazky ADD COLUMN status VARCHAR(64) NOT NULL DEFAULT 'poptávka'",
            "estimated_price": "ALTER TABLE zakazky ADD COLUMN estimated_price INTEGER",
            "final_price": "ALTER TABLE zakazky ADD COLUMN final_price INTEGER",
            "completed_at": "ALTER TABLE zakazky ADD COLUMN completed_at DATETIME",
        }
        for col, sql in add_map.items():
            if col not in columns:
                conn.execute(text(sql))


def init_db():
    """Create tables. Call on startup."""
    from backend.app.modules.zakazky import models  # noqa: F401
    from backend.app.modules.auth import models as auth_models  # noqa: F401
    from backend.app.modules.gallery import models as gallery_models  # noqa: F401
    from backend.app.modules.invoices import models as invoice_models  # noqa: F401

    db_path = DATABASE_URL.replace("sqlite:///", "")
    if db_path:
        d = os.path.dirname(db_path)
        if d:
            os.makedirs(d, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    _ensure_zakazky_columns()


def get_db():
    """Dependency for FastAPI."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
