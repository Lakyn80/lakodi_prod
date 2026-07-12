#!/usr/bin/env python3
"""Run FastAPI invoice API checks against a writable copy of the prod snapshot.

Must be pointed at a COPY of the snapshot — startup runs init_db() and may sync
admin password from ADMIN_PASSWORD env (same as docker dev defaults).

Usage:
  python scripts/run_snapshot_invoice_api_check.py \\
    --db-path production-data/lakodi-prod-invoices-2026-07-12/app.api-test.db
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

DEFAULT_PADDING = 3


def _fail(message: str) -> None:
    print(f"[FAIL] {message}")
    sys.exit(1)


def _pass(message: str) -> None:
    print(f"[PASS] {message}")


def _read_sequence_last_number(db_path: Path) -> tuple[int, int]:
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute(
            """
            SELECT last_number, padding
            FROM invoice_sequence_states
            WHERE sequence_key = 'default'
              AND COALESCE(document_kind, 'invoice') = 'invoice'
              AND sequence_year IS NULL
            LIMIT 1
            """
        ).fetchone()
        if row is None:
            _fail("Default invoice sequence state missing in DB copy")
        return int(row[0]), int(row[1])
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="API smoke test on prod snapshot DB copy")
    parser.add_argument("--db-path", type=Path, required=True)
    parser.add_argument("--expected-invoice-count", type=int, default=20)
    parser.add_argument("--expected-next-number", default="0044")
    parser.add_argument("--expected-max-invoice-number", default="0043")
    parser.add_argument("--admin-email", default=os.getenv("ADMIN_EMAIL", "lakodi@seznam.cz"))
    parser.add_argument("--admin-password", default=os.getenv("ADMIN_PASSWORD", "admin123"))
    args = parser.parse_args()

    db_path = args.db_path.resolve()
    if not db_path.is_file():
        _fail(f"DB copy not found: {db_path}")

    before_last, before_padding = _read_sequence_last_number(db_path)

    os.environ["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"

    from fastapi.testclient import TestClient

    from backend.app.main import app

    print(f"DB copy: {db_path}")
    print(f"Admin login: {args.admin_email}")

    with TestClient(app) as client:
        login = client.post(
            "/api/admin/login",
            json={"email": args.admin_email, "password": args.admin_password},
        )
        if login.status_code != 200 or not login.json().get("ok"):
            _fail(f"Admin login failed: HTTP {login.status_code} {login.text}")
        _pass("Admin login")

        check = client.get("/api/admin/check")
        if check.status_code != 200 or not check.json().get("authenticated"):
            _fail("Admin session check failed")
        _pass("Admin session")

        defaults = client.get("/api/admin/invoices/defaults")
        if defaults.status_code != 200:
            _fail(f"GET /invoices/defaults failed: HTTP {defaults.status_code}")
        defaults_body = defaults.json()
        suggested = defaults_body.get("suggested_invoice_number")
        suggested_vs = defaults_body.get("suggested_variable_symbol")
        if suggested != args.expected_next_number:
            _fail(
                f"suggested_invoice_number expected {args.expected_next_number!r}, got {suggested!r}"
            )
        if suggested_vs != suggested:
            _fail(f"suggested_variable_symbol {suggested_vs!r} != suggested_invoice_number {suggested!r}")
        _pass(f"Defaults suggest next invoice {suggested!r}")

        listing = client.get("/api/admin/invoices")
        if listing.status_code != 200:
            _fail(f"GET /invoices failed: HTTP {listing.status_code}")
        invoices = listing.json()
        if len(invoices) != args.expected_invoice_count:
            _fail(f"Expected {args.expected_invoice_count} invoices, list returned {len(invoices)}")
        _pass(f"Invoice list count = {len(invoices)}")

        max_row = max(invoices, key=lambda row: int(row["id"]))
        detail = client.get(f"/api/admin/invoices/{max_row['id']}")
        if detail.status_code != 200:
            _fail(f"GET /invoices/{max_row['id']} failed: HTTP {detail.status_code}")
        detail_body = detail.json()
        if detail_body.get("invoice_number") != args.expected_max_invoice_number:
            _fail(
                "Latest invoice number "
                f"expected {args.expected_max_invoice_number!r}, "
                f"got {detail_body.get('invoice_number')!r}"
            )
        _pass(f"Latest invoice detail OK ({detail_body.get('invoice_number')})")

        if max_row.get("invoice_number") != args.expected_max_invoice_number:
            _fail(
                f"List max invoice_number expected {args.expected_max_invoice_number!r}, "
                f"got {max_row.get('invoice_number')!r}"
            )

    after_last, after_padding = _read_sequence_last_number(db_path)
    if after_last != before_last or after_padding != before_padding:
        _fail(
            f"Sequence state changed during read-only API check "
            f"(before last={before_last}, after last={after_last})"
        )
    expected_next = str(after_last + 1).zfill(max(after_padding, DEFAULT_PADDING))
    if expected_next != args.expected_next_number:
        _fail(f"Post-check next number {expected_next!r} != expected {args.expected_next_number!r}")
    _pass("Sequence state unchanged after API read checks")

    print("")
    print("All snapshot API checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
