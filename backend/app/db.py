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


def _ensure_invoice_columns():
    if not DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as conn:
        exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='invoices'")
        ).fetchone()
        if not exists:
            return
        rows = conn.execute(text("PRAGMA table_info(invoices)")).fetchall()
        columns = {row[1] for row in rows}
        add_map = {
            "variable_symbol": "ALTER TABLE invoices ADD COLUMN variable_symbol VARCHAR(9)",
            "document_kind": "ALTER TABLE invoices ADD COLUMN document_kind VARCHAR(32) NOT NULL DEFAULT 'invoice'",
            "payment_method": "ALTER TABLE invoices ADD COLUMN payment_method VARCHAR(64) NOT NULL DEFAULT 'Převodem'",
            "bank_account_number": "ALTER TABLE invoices ADD COLUMN bank_account_number VARCHAR(32) NOT NULL DEFAULT '5997826359'",
            "bank_account_prefix": "ALTER TABLE invoices ADD COLUMN bank_account_prefix VARCHAR(16)",
            "bank_code": "ALTER TABLE invoices ADD COLUMN bank_code VARCHAR(16) NOT NULL DEFAULT '0800'",
            "bank_iban": "ALTER TABLE invoices ADD COLUMN bank_iban VARCHAR(34) NOT NULL DEFAULT 'CZ9108000000005997826359'",
        }
        for col, sql in add_map.items():
            if col not in columns:
                conn.execute(text(sql))

        conn.execute(
            text(
                "UPDATE invoices "
                "SET document_kind = 'invoice' "
                "WHERE document_kind IS NULL"
            )
        )
        conn.execute(
            text(
                "UPDATE invoices "
                "SET variable_symbol = CASE "
                "WHEN invoice_number GLOB '[0-9]*' THEN invoice_number "
                "ELSE CAST(id AS TEXT) "
                "END "
                "WHERE variable_symbol IS NULL"
            )
        )
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_invoices_variable_symbol "
                "ON invoices (variable_symbol)"
            )
        )


def _ensure_invoice_settings_columns():
    if not DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as conn:
        exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_settings'")
        ).fetchone()
        if not exists:
            return
        rows = conn.execute(text("PRAGMA table_info(invoice_settings)")).fetchall()
        columns = {row[1] for row in rows}
        add_map = {
            "issuer_name": "ALTER TABLE invoice_settings ADD COLUMN issuer_name VARCHAR(256)",
            "issuer_address": "ALTER TABLE invoice_settings ADD COLUMN issuer_address VARCHAR(256)",
            "issuer_city": "ALTER TABLE invoice_settings ADD COLUMN issuer_city VARCHAR(128)",
            "issuer_zip": "ALTER TABLE invoice_settings ADD COLUMN issuer_zip VARCHAR(32)",
            "issuer_ico": "ALTER TABLE invoice_settings ADD COLUMN issuer_ico VARCHAR(32)",
            "issuer_dic": "ALTER TABLE invoice_settings ADD COLUMN issuer_dic VARCHAR(32)",
            "issuer_data_box": "ALTER TABLE invoice_settings ADD COLUMN issuer_data_box VARCHAR(64)",
            "issuer_email": "ALTER TABLE invoice_settings ADD COLUMN issuer_email VARCHAR(256)",
            "issuer_phone": "ALTER TABLE invoice_settings ADD COLUMN issuer_phone VARCHAR(64)",
            "default_currency": "ALTER TABLE invoice_settings ADD COLUMN default_currency VARCHAR(8)",
            "default_due_days": "ALTER TABLE invoice_settings ADD COLUMN default_due_days INTEGER",
            "default_note": "ALTER TABLE invoice_settings ADD COLUMN default_note TEXT",
        }
        for col, sql in add_map.items():
            if col not in columns:
                conn.execute(text(sql))


def _ensure_invoice_sequence_state_columns():
    if not DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as conn:
        exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_sequence_states'")
        ).fetchone()
        if not exists:
            return
        rows = conn.execute(text("PRAGMA table_info(invoice_sequence_states)")).fetchall()
        columns = {row[1] for row in rows}
        add_map = {
            "document_kind": "ALTER TABLE invoice_sequence_states ADD COLUMN document_kind VARCHAR(32)",
            "sequence_year": "ALTER TABLE invoice_sequence_states ADD COLUMN sequence_year INTEGER",
            "prefix": "ALTER TABLE invoice_sequence_states ADD COLUMN prefix VARCHAR(32)",
        }
        for col, sql in add_map.items():
            if col not in columns:
                conn.execute(text(sql))

        conn.execute(
            text(
                "UPDATE invoice_sequence_states "
                "SET document_kind = 'invoice' "
                "WHERE sequence_key = 'default' AND document_kind IS NULL"
            )
        )


def _ensure_invoice_document_relations_table():
    if not DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as conn:
        exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_document_relations'")
        ).fetchone()
        if not exists:
            return
        rows = conn.execute(text("PRAGMA table_info(invoice_document_relations)")).fetchall()
        columns = {row[1] for row in rows}
        add_map = {
            "source_invoice_id": "ALTER TABLE invoice_document_relations ADD COLUMN source_invoice_id INTEGER",
            "target_invoice_id": "ALTER TABLE invoice_document_relations ADD COLUMN target_invoice_id INTEGER",
            "source_payment_id": "ALTER TABLE invoice_document_relations ADD COLUMN source_payment_id INTEGER",
            "relation_type": "ALTER TABLE invoice_document_relations ADD COLUMN relation_type VARCHAR(64)",
            "created_at": "ALTER TABLE invoice_document_relations ADD COLUMN created_at DATETIME",
        }
        for col, sql in add_map.items():
            if col not in columns:
                conn.execute(text(sql))

        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS "
                "ux_invoice_document_relations_source_payment_relation_type "
                "ON invoice_document_relations (source_payment_id, relation_type)"
            )
        )


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
    _ensure_invoice_columns()
    _ensure_invoice_settings_columns()
    _ensure_invoice_sequence_state_columns()
    _ensure_invoice_document_relations_table()


def get_db():
    """Dependency for FastAPI."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
