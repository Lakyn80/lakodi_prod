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
            "subject_id": "ALTER TABLE invoices ADD COLUMN subject_id INTEGER",
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
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_invoices_subject_id "
                "ON invoices (subject_id)"
            )
        )


def _ensure_invoice_subjects_table():
    if not DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as conn:
        exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_subjects'")
        ).fetchone()
        if not exists:
            return
        rows = conn.execute(text("PRAGMA table_info(invoice_subjects)")).fetchall()
        columns = {row[1] for row in rows}
        add_map = {
            "name": "ALTER TABLE invoice_subjects ADD COLUMN name VARCHAR(256)",
            "email": "ALTER TABLE invoice_subjects ADD COLUMN email VARCHAR(256)",
            "phone": "ALTER TABLE invoice_subjects ADD COLUMN phone VARCHAR(64)",
            "address": "ALTER TABLE invoice_subjects ADD COLUMN address VARCHAR(256)",
            "ico": "ALTER TABLE invoice_subjects ADD COLUMN ico VARCHAR(32)",
            "dic": "ALTER TABLE invoice_subjects ADD COLUMN dic VARCHAR(32)",
            "data_box": "ALTER TABLE invoice_subjects ADD COLUMN data_box VARCHAR(64)",
            "country": "ALTER TABLE invoice_subjects ADD COLUMN country VARCHAR(128)",
            "note": "ALTER TABLE invoice_subjects ADD COLUMN note TEXT",
            "created_at": "ALTER TABLE invoice_subjects ADD COLUMN created_at DATETIME",
            "updated_at": "ALTER TABLE invoice_subjects ADD COLUMN updated_at DATETIME",
        }
        for col, sql in add_map.items():
            if col not in columns:
                conn.execute(text(sql))

        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_subjects_name ON invoice_subjects (name)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_subjects_email ON invoice_subjects (email)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_subjects_ico ON invoice_subjects (ico)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_subjects_dic ON invoice_subjects (dic)"))


def _ensure_invoice_suppliers_table():
    if not DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as conn:
        exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_suppliers'")
        ).fetchone()
        if not exists:
            return
        rows = conn.execute(text("PRAGMA table_info(invoice_suppliers)")).fetchall()
        columns = {row[1] for row in rows}
        add_map = {
            "name": "ALTER TABLE invoice_suppliers ADD COLUMN name VARCHAR(256)",
            "email": "ALTER TABLE invoice_suppliers ADD COLUMN email VARCHAR(256)",
            "phone": "ALTER TABLE invoice_suppliers ADD COLUMN phone VARCHAR(64)",
            "address": "ALTER TABLE invoice_suppliers ADD COLUMN address VARCHAR(256)",
            "ico": "ALTER TABLE invoice_suppliers ADD COLUMN ico VARCHAR(32)",
            "dic": "ALTER TABLE invoice_suppliers ADD COLUMN dic VARCHAR(32)",
            "data_box": "ALTER TABLE invoice_suppliers ADD COLUMN data_box VARCHAR(64)",
            "country": "ALTER TABLE invoice_suppliers ADD COLUMN country VARCHAR(128)",
            "note": "ALTER TABLE invoice_suppliers ADD COLUMN note TEXT",
            "created_at": "ALTER TABLE invoice_suppliers ADD COLUMN created_at DATETIME",
            "updated_at": "ALTER TABLE invoice_suppliers ADD COLUMN updated_at DATETIME",
        }
        for col, sql in add_map.items():
            if col not in columns:
                conn.execute(text(sql))

        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_suppliers_name ON invoice_suppliers (name)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_suppliers_email ON invoice_suppliers (email)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_suppliers_ico ON invoice_suppliers (ico)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_suppliers_dic ON invoice_suppliers (dic)"))


def _ensure_invoice_expense_tables():
    if not DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as conn:
        expense_exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_expenses'")
        ).fetchone()
        if expense_exists:
            rows = conn.execute(text("PRAGMA table_info(invoice_expenses)")).fetchall()
            columns = {row[1] for row in rows}
            add_map = {
                "supplier_id": "ALTER TABLE invoice_expenses ADD COLUMN supplier_id INTEGER",
                "supplier_name": "ALTER TABLE invoice_expenses ADD COLUMN supplier_name VARCHAR(256)",
                "supplier_email": "ALTER TABLE invoice_expenses ADD COLUMN supplier_email VARCHAR(256)",
                "supplier_phone": "ALTER TABLE invoice_expenses ADD COLUMN supplier_phone VARCHAR(64)",
                "supplier_address": "ALTER TABLE invoice_expenses ADD COLUMN supplier_address VARCHAR(256)",
                "supplier_ico": "ALTER TABLE invoice_expenses ADD COLUMN supplier_ico VARCHAR(32)",
                "supplier_dic": "ALTER TABLE invoice_expenses ADD COLUMN supplier_dic VARCHAR(32)",
                "supplier_data_box": "ALTER TABLE invoice_expenses ADD COLUMN supplier_data_box VARCHAR(64)",
                "supplier_country": "ALTER TABLE invoice_expenses ADD COLUMN supplier_country VARCHAR(128)",
                "expense_number": "ALTER TABLE invoice_expenses ADD COLUMN expense_number VARCHAR(64)",
                "variable_symbol": "ALTER TABLE invoice_expenses ADD COLUMN variable_symbol VARCHAR(9)",
                "issue_date": "ALTER TABLE invoice_expenses ADD COLUMN issue_date DATE",
                "received_date": "ALTER TABLE invoice_expenses ADD COLUMN received_date DATE",
                "due_date": "ALTER TABLE invoice_expenses ADD COLUMN due_date DATE",
                "taxable_supply_date": "ALTER TABLE invoice_expenses ADD COLUMN taxable_supply_date DATE",
                "currency": "ALTER TABLE invoice_expenses ADD COLUMN currency VARCHAR(8) NOT NULL DEFAULT 'CZK'",
                "subtotal": "ALTER TABLE invoice_expenses ADD COLUMN subtotal NUMERIC(12, 2)",
                "vat_rate": "ALTER TABLE invoice_expenses ADD COLUMN vat_rate NUMERIC(5, 2)",
                "vat_amount": "ALTER TABLE invoice_expenses ADD COLUMN vat_amount NUMERIC(12, 2)",
                "total": "ALTER TABLE invoice_expenses ADD COLUMN total NUMERIC(12, 2)",
                "status": "ALTER TABLE invoice_expenses ADD COLUMN status VARCHAR(64) NOT NULL DEFAULT 'open'",
                "note": "ALTER TABLE invoice_expenses ADD COLUMN note TEXT",
                "payment_method": "ALTER TABLE invoice_expenses ADD COLUMN payment_method VARCHAR(64)",
                "bank_account_number": "ALTER TABLE invoice_expenses ADD COLUMN bank_account_number VARCHAR(32)",
                "bank_account_prefix": "ALTER TABLE invoice_expenses ADD COLUMN bank_account_prefix VARCHAR(16)",
                "bank_code": "ALTER TABLE invoice_expenses ADD COLUMN bank_code VARCHAR(16)",
                "bank_iban": "ALTER TABLE invoice_expenses ADD COLUMN bank_iban VARCHAR(34)",
                "created_at": "ALTER TABLE invoice_expenses ADD COLUMN created_at DATETIME",
                "updated_at": "ALTER TABLE invoice_expenses ADD COLUMN updated_at DATETIME",
            }
            for col, sql in add_map.items():
                if col not in columns:
                    conn.execute(text(sql))

            conn.execute(text("UPDATE invoice_expenses SET status = 'open' WHERE status IS NULL"))
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_invoice_expenses_expense_number "
                    "ON invoice_expenses (expense_number)"
                )
            )
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_invoice_expenses_variable_symbol "
                    "ON invoice_expenses (variable_symbol)"
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_expenses_supplier_email ON invoice_expenses (supplier_email)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_expenses_supplier_id ON invoice_expenses (supplier_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_expenses_due_date ON invoice_expenses (due_date)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_expenses_status ON invoice_expenses (status)"))

        item_exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_expense_items'")
        ).fetchone()
        if item_exists:
            rows = conn.execute(text("PRAGMA table_info(invoice_expense_items)")).fetchall()
            columns = {row[1] for row in rows}
            add_map = {
                "expense_id": "ALTER TABLE invoice_expense_items ADD COLUMN expense_id INTEGER",
                "description": "ALTER TABLE invoice_expense_items ADD COLUMN description VARCHAR(512)",
                "quantity": "ALTER TABLE invoice_expense_items ADD COLUMN quantity NUMERIC(12, 3)",
                "unit_price": "ALTER TABLE invoice_expense_items ADD COLUMN unit_price NUMERIC(12, 2)",
                "line_total": "ALTER TABLE invoice_expense_items ADD COLUMN line_total NUMERIC(12, 2)",
            }
            for col, sql in add_map.items():
                if col not in columns:
                    conn.execute(text(sql))

            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_invoice_expense_items_expense_id ON invoice_expense_items (expense_id)")
            )

        payment_exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_expense_payments'")
        ).fetchone()
        if payment_exists:
            rows = conn.execute(text("PRAGMA table_info(invoice_expense_payments)")).fetchall()
            columns = {row[1] for row in rows}
            add_map = {
                "expense_id": "ALTER TABLE invoice_expense_payments ADD COLUMN expense_id INTEGER",
                "amount": "ALTER TABLE invoice_expense_payments ADD COLUMN amount NUMERIC(12, 2)",
                "paid_at": "ALTER TABLE invoice_expense_payments ADD COLUMN paid_at DATE",
                "payment_method": "ALTER TABLE invoice_expense_payments ADD COLUMN payment_method VARCHAR(64)",
                "note": "ALTER TABLE invoice_expense_payments ADD COLUMN note TEXT",
                "created_at": "ALTER TABLE invoice_expense_payments ADD COLUMN created_at DATETIME",
            }
            for col, sql in add_map.items():
                if col not in columns:
                    conn.execute(text(sql))

            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_invoice_expense_payments_expense_id ON invoice_expense_payments (expense_id)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_invoice_expense_payments_paid_at ON invoice_expense_payments (paid_at)")
            )


def _ensure_invoice_bank_matching_tables():
    if not DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as conn:
        transaction_exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_bank_transactions'")
        ).fetchone()
        if transaction_exists:
            rows = conn.execute(text("PRAGMA table_info(invoice_bank_transactions)")).fetchall()
            columns = {row[1] for row in rows}
            add_map = {
                "external_id": "ALTER TABLE invoice_bank_transactions ADD COLUMN external_id VARCHAR(256)",
                "fingerprint": "ALTER TABLE invoice_bank_transactions ADD COLUMN fingerprint VARCHAR(128)",
                "account_iban": "ALTER TABLE invoice_bank_transactions ADD COLUMN account_iban VARCHAR(34)",
                "account_number": "ALTER TABLE invoice_bank_transactions ADD COLUMN account_number VARCHAR(32)",
                "bank_code": "ALTER TABLE invoice_bank_transactions ADD COLUMN bank_code VARCHAR(16)",
                "transaction_date": "ALTER TABLE invoice_bank_transactions ADD COLUMN transaction_date DATE",
                "booked_date": "ALTER TABLE invoice_bank_transactions ADD COLUMN booked_date DATE",
                "amount": "ALTER TABLE invoice_bank_transactions ADD COLUMN amount NUMERIC(12, 2)",
                "currency": "ALTER TABLE invoice_bank_transactions ADD COLUMN currency VARCHAR(8)",
                "variable_symbol": "ALTER TABLE invoice_bank_transactions ADD COLUMN variable_symbol VARCHAR(32)",
                "constant_symbol": "ALTER TABLE invoice_bank_transactions ADD COLUMN constant_symbol VARCHAR(32)",
                "specific_symbol": "ALTER TABLE invoice_bank_transactions ADD COLUMN specific_symbol VARCHAR(32)",
                "counterparty_name": "ALTER TABLE invoice_bank_transactions ADD COLUMN counterparty_name VARCHAR(256)",
                "counterparty_account": "ALTER TABLE invoice_bank_transactions ADD COLUMN counterparty_account VARCHAR(64)",
                "counterparty_iban": "ALTER TABLE invoice_bank_transactions ADD COLUMN counterparty_iban VARCHAR(34)",
                "message": "ALTER TABLE invoice_bank_transactions ADD COLUMN message TEXT",
                "raw_payload": "ALTER TABLE invoice_bank_transactions ADD COLUMN raw_payload TEXT",
                "direction": "ALTER TABLE invoice_bank_transactions ADD COLUMN direction VARCHAR(16)",
                "status": "ALTER TABLE invoice_bank_transactions ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'imported'",
                "created_at": "ALTER TABLE invoice_bank_transactions ADD COLUMN created_at DATETIME",
                "updated_at": "ALTER TABLE invoice_bank_transactions ADD COLUMN updated_at DATETIME",
            }
            for col, sql in add_map.items():
                if col not in columns:
                    conn.execute(text(sql))

            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_invoice_bank_transactions_external_id ON invoice_bank_transactions (external_id)"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_invoice_bank_transactions_fingerprint ON invoice_bank_transactions (fingerprint)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_bank_transactions_variable_symbol ON invoice_bank_transactions (variable_symbol)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_bank_transactions_transaction_date ON invoice_bank_transactions (transaction_date)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_bank_transactions_status ON invoice_bank_transactions (status)"))

        match_exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_payment_matches'")
        ).fetchone()
        if match_exists:
            rows = conn.execute(text("PRAGMA table_info(invoice_payment_matches)")).fetchall()
            columns = {row[1] for row in rows}
            add_map = {
                "bank_transaction_id": "ALTER TABLE invoice_payment_matches ADD COLUMN bank_transaction_id INTEGER",
                "invoice_id": "ALTER TABLE invoice_payment_matches ADD COLUMN invoice_id INTEGER",
                "expense_id": "ALTER TABLE invoice_payment_matches ADD COLUMN expense_id INTEGER",
                "invoice_payment_id": "ALTER TABLE invoice_payment_matches ADD COLUMN invoice_payment_id INTEGER",
                "expense_payment_id": "ALTER TABLE invoice_payment_matches ADD COLUMN expense_payment_id INTEGER",
                "match_type": "ALTER TABLE invoice_payment_matches ADD COLUMN match_type VARCHAR(64)",
                "confidence": "ALTER TABLE invoice_payment_matches ADD COLUMN confidence INTEGER",
                "status": "ALTER TABLE invoice_payment_matches ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'suggested'",
                "reason": "ALTER TABLE invoice_payment_matches ADD COLUMN reason TEXT",
                "created_at": "ALTER TABLE invoice_payment_matches ADD COLUMN created_at DATETIME",
                "applied_at": "ALTER TABLE invoice_payment_matches ADD COLUMN applied_at DATETIME",
            }
            for col, sql in add_map.items():
                if col not in columns:
                    conn.execute(text(sql))

            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_payment_matches_bank_transaction_id ON invoice_payment_matches (bank_transaction_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_payment_matches_invoice_id ON invoice_payment_matches (invoice_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_payment_matches_expense_id ON invoice_payment_matches (expense_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_payment_matches_status ON invoice_payment_matches (status)"))


def _ensure_invoice_recurring_tables():
    if not DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as conn:
        template_exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_recurring_templates'")
        ).fetchone()
        if template_exists:
            rows = conn.execute(text("PRAGMA table_info(invoice_recurring_templates)")).fetchall()
            columns = {row[1] for row in rows}
            add_map = {
                "template_type": "ALTER TABLE invoice_recurring_templates ADD COLUMN template_type VARCHAR(16)",
                "document_kind": "ALTER TABLE invoice_recurring_templates ADD COLUMN document_kind VARCHAR(32)",
                "subject_id": "ALTER TABLE invoice_recurring_templates ADD COLUMN subject_id INTEGER",
                "supplier_id": "ALTER TABLE invoice_recurring_templates ADD COLUMN supplier_id INTEGER",
                "name": "ALTER TABLE invoice_recurring_templates ADD COLUMN name VARCHAR(256)",
                "status": "ALTER TABLE invoice_recurring_templates ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'active'",
                "recurrence_interval": "ALTER TABLE invoice_recurring_templates ADD COLUMN recurrence_interval VARCHAR(16)",
                "recurrence_count": "ALTER TABLE invoice_recurring_templates ADD COLUMN recurrence_count INTEGER NOT NULL DEFAULT 1",
                "next_run_date": "ALTER TABLE invoice_recurring_templates ADD COLUMN next_run_date DATE",
                "last_run_date": "ALTER TABLE invoice_recurring_templates ADD COLUMN last_run_date DATE",
                "business_mode": "ALTER TABLE invoice_recurring_templates ADD COLUMN business_mode VARCHAR(64)",
                "tax_mode": "ALTER TABLE invoice_recurring_templates ADD COLUMN tax_mode VARCHAR(64)",
                "currency": "ALTER TABLE invoice_recurring_templates ADD COLUMN currency VARCHAR(8) NOT NULL DEFAULT 'CZK'",
                "vat_rate": "ALTER TABLE invoice_recurring_templates ADD COLUMN vat_rate NUMERIC(5, 2)",
                "note": "ALTER TABLE invoice_recurring_templates ADD COLUMN note TEXT",
                "payment_method": "ALTER TABLE invoice_recurring_templates ADD COLUMN payment_method VARCHAR(64)",
                "bank_account_number": "ALTER TABLE invoice_recurring_templates ADD COLUMN bank_account_number VARCHAR(32)",
                "bank_account_prefix": "ALTER TABLE invoice_recurring_templates ADD COLUMN bank_account_prefix VARCHAR(16)",
                "bank_code": "ALTER TABLE invoice_recurring_templates ADD COLUMN bank_code VARCHAR(16)",
                "bank_iban": "ALTER TABLE invoice_recurring_templates ADD COLUMN bank_iban VARCHAR(34)",
                "created_at": "ALTER TABLE invoice_recurring_templates ADD COLUMN created_at DATETIME",
                "updated_at": "ALTER TABLE invoice_recurring_templates ADD COLUMN updated_at DATETIME",
            }
            for col, sql in add_map.items():
                if col not in columns:
                    conn.execute(text(sql))

            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_recurring_templates_template_type ON invoice_recurring_templates (template_type)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_recurring_templates_status ON invoice_recurring_templates (status)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_recurring_templates_next_run_date ON invoice_recurring_templates (next_run_date)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_recurring_templates_subject_id ON invoice_recurring_templates (subject_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_recurring_templates_supplier_id ON invoice_recurring_templates (supplier_id)"))

        item_exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_recurring_template_items'")
        ).fetchone()
        if item_exists:
            rows = conn.execute(text("PRAGMA table_info(invoice_recurring_template_items)")).fetchall()
            columns = {row[1] for row in rows}
            add_map = {
                "template_id": "ALTER TABLE invoice_recurring_template_items ADD COLUMN template_id INTEGER",
                "description": "ALTER TABLE invoice_recurring_template_items ADD COLUMN description VARCHAR(512)",
                "quantity": "ALTER TABLE invoice_recurring_template_items ADD COLUMN quantity NUMERIC(12, 3)",
                "unit_price": "ALTER TABLE invoice_recurring_template_items ADD COLUMN unit_price NUMERIC(12, 2)",
                "line_total": "ALTER TABLE invoice_recurring_template_items ADD COLUMN line_total NUMERIC(12, 2)",
            }
            for col, sql in add_map.items():
                if col not in columns:
                    conn.execute(text(sql))

            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_recurring_template_items_template_id ON invoice_recurring_template_items (template_id)"))

        generation_exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_recurring_generations'")
        ).fetchone()
        if generation_exists:
            rows = conn.execute(text("PRAGMA table_info(invoice_recurring_generations)")).fetchall()
            columns = {row[1] for row in rows}
            add_map = {
                "template_id": "ALTER TABLE invoice_recurring_generations ADD COLUMN template_id INTEGER",
                "generated_invoice_id": "ALTER TABLE invoice_recurring_generations ADD COLUMN generated_invoice_id INTEGER",
                "generated_expense_id": "ALTER TABLE invoice_recurring_generations ADD COLUMN generated_expense_id INTEGER",
                "generated_at": "ALTER TABLE invoice_recurring_generations ADD COLUMN generated_at DATETIME",
                "run_date": "ALTER TABLE invoice_recurring_generations ADD COLUMN run_date DATE",
                "status": "ALTER TABLE invoice_recurring_generations ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'generated'",
                "message": "ALTER TABLE invoice_recurring_generations ADD COLUMN message TEXT",
            }
            for col, sql in add_map.items():
                if col not in columns:
                    conn.execute(text(sql))

            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_recurring_generations_template_id ON invoice_recurring_generations (template_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_recurring_generations_generated_invoice_id ON invoice_recurring_generations (generated_invoice_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_recurring_generations_generated_expense_id ON invoice_recurring_generations (generated_expense_id)"))


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
        row_map = {row[1]: row for row in rows}
        source_payment_row = row_map.get("source_payment_id")
        needs_recreate = bool(source_payment_row and source_payment_row[3] == 1)

        if needs_recreate:
            conn.execute(text("PRAGMA foreign_keys=OFF"))
            conn.execute(text("ALTER TABLE invoice_document_relations RENAME TO invoice_document_relations_legacy"))
            conn.execute(
                text(
                    "CREATE TABLE invoice_document_relations ("
                    "id INTEGER NOT NULL PRIMARY KEY, "
                    "source_invoice_id INTEGER NOT NULL, "
                    "target_invoice_id INTEGER NOT NULL, "
                    "source_payment_id INTEGER, "
                    "relation_type VARCHAR(64) NOT NULL, "
                    "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                    "FOREIGN KEY(source_invoice_id) REFERENCES invoices (id) ON DELETE CASCADE, "
                    "FOREIGN KEY(target_invoice_id) REFERENCES invoices (id) ON DELETE CASCADE, "
                    "FOREIGN KEY(source_payment_id) REFERENCES invoice_payments (id) ON DELETE CASCADE"
                    ")"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO invoice_document_relations ("
                    "id, source_invoice_id, target_invoice_id, source_payment_id, relation_type, created_at"
                    ") "
                    "SELECT "
                    "id, source_invoice_id, target_invoice_id, source_payment_id, relation_type, "
                    "COALESCE(created_at, CURRENT_TIMESTAMP) "
                    "FROM invoice_document_relations_legacy"
                )
            )
            conn.execute(text("DROP TABLE invoice_document_relations_legacy"))
            conn.execute(text("PRAGMA foreign_keys=ON"))
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
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS "
                "ux_invoice_document_relations_source_invoice_final_invoice "
                "ON invoice_document_relations (source_invoice_id, relation_type) "
                "WHERE relation_type = 'final_invoice_for_proforma'"
            )
        )
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS "
                "ux_invoice_document_relations_source_invoice_correction "
                "ON invoice_document_relations (source_invoice_id, relation_type) "
                "WHERE relation_type = 'correction_for_invoice'"
            )
        )
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS "
                "ux_invoice_document_relations_source_invoice_from_quote "
                "ON invoice_document_relations (source_invoice_id, relation_type) "
                "WHERE relation_type = 'invoice_from_quote'"
            )
        )
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS "
                "ux_invoice_document_relations_source_proforma_from_quote "
                "ON invoice_document_relations (source_invoice_id, relation_type) "
                "WHERE relation_type = 'proforma_from_quote'"
            )
        )


def _ensure_invoice_todos_table():
    if not DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as conn:
        exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_todos'")
        ).fetchone()
        if not exists:
            return
        rows = conn.execute(text("PRAGMA table_info(invoice_todos)")).fetchall()
        columns = {row[1] for row in rows}
        add_map = {
            "invoice_id": "ALTER TABLE invoice_todos ADD COLUMN invoice_id INTEGER",
            "expense_id": "ALTER TABLE invoice_todos ADD COLUMN expense_id INTEGER",
            "todo_type": "ALTER TABLE invoice_todos ADD COLUMN todo_type VARCHAR(64)",
            "status": "ALTER TABLE invoice_todos ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'open'",
            "title": "ALTER TABLE invoice_todos ADD COLUMN title VARCHAR(256)",
            "message": "ALTER TABLE invoice_todos ADD COLUMN message TEXT",
            "due_date": "ALTER TABLE invoice_todos ADD COLUMN due_date DATE",
            "created_at": "ALTER TABLE invoice_todos ADD COLUMN created_at DATETIME",
            "updated_at": "ALTER TABLE invoice_todos ADD COLUMN updated_at DATETIME",
            "completed_at": "ALTER TABLE invoice_todos ADD COLUMN completed_at DATETIME",
        }
        for col, sql in add_map.items():
            if col not in columns:
                conn.execute(text(sql))

        conn.execute(text("UPDATE invoice_todos SET status = 'open' WHERE status IS NULL"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_todos_invoice_id ON invoice_todos (invoice_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_todos_expense_id ON invoice_todos (expense_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_todos_todo_type ON invoice_todos (todo_type)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_todos_status ON invoice_todos (status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_todos_due_date ON invoice_todos (due_date)"))


def _ensure_invoice_reminder_emails_table():
    if not DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as conn:
        exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_reminder_emails'")
        ).fetchone()
        if not exists:
            return
        rows = conn.execute(text("PRAGMA table_info(invoice_reminder_emails)")).fetchall()
        columns = {row[1] for row in rows}
        add_map = {
            "invoice_id": "ALTER TABLE invoice_reminder_emails ADD COLUMN invoice_id INTEGER",
            "todo_id": "ALTER TABLE invoice_reminder_emails ADD COLUMN todo_id INTEGER",
            "reminder_type": "ALTER TABLE invoice_reminder_emails ADD COLUMN reminder_type VARCHAR(64)",
            "status": "ALTER TABLE invoice_reminder_emails ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'prepared'",
            "recipient_email": "ALTER TABLE invoice_reminder_emails ADD COLUMN recipient_email VARCHAR(256)",
            "subject": "ALTER TABLE invoice_reminder_emails ADD COLUMN subject VARCHAR(256)",
            "message": "ALTER TABLE invoice_reminder_emails ADD COLUMN message TEXT",
            "sent_at": "ALTER TABLE invoice_reminder_emails ADD COLUMN sent_at DATETIME",
            "error_message": "ALTER TABLE invoice_reminder_emails ADD COLUMN error_message TEXT",
            "created_at": "ALTER TABLE invoice_reminder_emails ADD COLUMN created_at DATETIME",
        }
        for col, sql in add_map.items():
            if col not in columns:
                conn.execute(text(sql))

        conn.execute(text("UPDATE invoice_reminder_emails SET status = 'prepared' WHERE status IS NULL"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_reminder_emails_invoice_id ON invoice_reminder_emails (invoice_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_reminder_emails_todo_id ON invoice_reminder_emails (todo_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_reminder_emails_status ON invoice_reminder_emails (status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_reminder_emails_reminder_type ON invoice_reminder_emails (reminder_type)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_invoice_reminder_emails_sent_at ON invoice_reminder_emails (sent_at)"))


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
    _ensure_invoice_subjects_table()
    _ensure_invoice_suppliers_table()
    _ensure_invoice_expense_tables()
    _ensure_invoice_bank_matching_tables()
    _ensure_invoice_recurring_tables()
    _ensure_invoice_settings_columns()
    _ensure_invoice_sequence_state_columns()
    _ensure_invoice_document_relations_table()
    _ensure_invoice_todos_table()
    _ensure_invoice_reminder_emails_table()


def get_db():
    """Dependency for FastAPI."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
