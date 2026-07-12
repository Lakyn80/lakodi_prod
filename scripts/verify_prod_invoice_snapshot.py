#!/usr/bin/env python3
"""Read-only audit of a production Lakodi SQLite snapshot (invoices + numbering).

Usage:
  python scripts/verify_prod_invoice_snapshot.py \\
    --db-path production-data/lakodi-prod-invoices-2026-07-12/app.db \\
    --expected-sha256 8e85cf8e8e497ef1fd94a56d78a7717dfd246bd0275293e7cf822c642d463268

Exit code 0 = all checks passed, 1 = at least one failure.
"""
from __future__ import annotations

import argparse
import hashlib
import sqlite3
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_PADDING = 3
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SNAPSHOT = ROOT / "production-data" / "lakodi-prod-invoices-2026-07-12" / "app.db"
DEFAULT_SHA256 = "8e85cf8e8e497ef1fd94a56d78a7717dfd246bd0275293e7cf822c642d463268"


@dataclass
class Report:
    ok: list[str] = field(default_factory=list)
    fail: list[str] = field(default_factory=list)
    info: list[str] = field(default_factory=list)

    def pass_(self, message: str) -> None:
        self.ok.append(message)

    def fail_(self, message: str) -> None:
        self.fail.append(message)

    def note(self, message: str) -> None:
        self.info.append(message)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def connect_readonly(db_path: Path) -> sqlite3.Connection:
    uri = f"file:{db_path.resolve().as_posix()}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (name,),
    ).fetchone()
    return row is not None


def format_next_number(last_number: int, padding: int) -> str:
    width = max(padding, DEFAULT_PADDING)
    return str(last_number + 1).zfill(width)


def verify_snapshot(
    db_path: Path,
    *,
    expected_sha256: str | None,
    expected_invoice_count: int | None,
    expected_last_number: int | None,
    expected_next_number: str | None,
) -> Report:
    report = Report()

    if not db_path.is_file():
        report.fail_(f"DB file not found: {db_path}")
        return report

    size = db_path.stat().st_size
    report.note(f"Path: {db_path}")
    report.note(f"Size: {size:,} bytes")

    digest = sha256_file(db_path)
    report.note(f"SHA-256: {digest}")
    if expected_sha256:
        if digest.lower() == expected_sha256.lower():
            report.pass_("SHA-256 matches expected production hash")
        else:
            report.fail_(
                f"SHA-256 mismatch (expected {expected_sha256}, got {digest})"
            )

    conn = connect_readonly(db_path)
    try:
        if not table_exists(conn, "invoices"):
            report.fail_("Missing table: invoices")
            return report

        if not table_exists(conn, "invoice_sequence_states"):
            report.fail_("Missing table: invoice_sequence_states")
            return report

        sequence_rows = conn.execute(
            """
            SELECT sequence_key, document_kind, last_number, padding, sequence_year, prefix
            FROM invoice_sequence_states
            ORDER BY sequence_key, COALESCE(document_kind, ''), COALESCE(sequence_year, -1)
            """
        ).fetchall()
        report.note(f"Sequence states: {len(sequence_rows)} row(s)")
        for row in sequence_rows:
            report.note(
                "  "
                f"key={row[0]!r} kind={row[1]!r} last={row[2]} padding={row[3]} "
                f"year={row[4]} prefix={row[5]!r}"
            )

        default_state = conn.execute(
            """
            SELECT last_number, padding
            FROM invoice_sequence_states
            WHERE sequence_key = 'default'
              AND COALESCE(document_kind, 'invoice') = 'invoice'
              AND sequence_year IS NULL
            LIMIT 1
            """
        ).fetchone()
        if default_state is None:
            report.fail_("Missing legacy default invoice sequence state (default / invoice / NULL year)")
        else:
            last_number, padding = int(default_state[0]), int(default_state[1])
            next_number = format_next_number(last_number, padding)
            report.pass_(f"Default sequence last_number={last_number}, padding={padding}, next={next_number}")
            if expected_last_number is not None and last_number != expected_last_number:
                report.fail_(f"Expected last_number={expected_last_number}, got {last_number}")
            if expected_next_number is not None and next_number != expected_next_number:
                report.fail_(f"Expected next number {expected_next_number!r}, computed {next_number!r}")

        invoice_count = conn.execute("SELECT COUNT(*) FROM invoices").fetchone()[0]
        invoice_kind_count = conn.execute(
            """
            SELECT COUNT(*)
            FROM invoices
            WHERE COALESCE(document_kind, 'invoice') = 'invoice'
            """
        ).fetchone()[0]
        report.note(f"Invoices total: {invoice_count}, document_kind=invoice: {invoice_kind_count}")
        if expected_invoice_count is not None and invoice_kind_count != expected_invoice_count:
            report.fail_(
                f"Expected {expected_invoice_count} invoice rows, found {invoice_kind_count}"
            )
        else:
            report.pass_(f"Invoice count OK ({invoice_kind_count})")

        rows = conn.execute(
            """
            SELECT id, invoice_number, variable_symbol, issue_date, status, document_kind
            FROM invoices
            WHERE COALESCE(document_kind, 'invoice') = 'invoice'
            ORDER BY id
            """
        ).fetchall()

        invoice_numbers = [row[1] for row in rows]
        variable_symbols = [row[2] for row in rows]
        dup_numbers = [n for n, c in Counter(invoice_numbers).items() if c > 1]
        dup_vs = [n for n, c in Counter(variable_symbols).items() if c > 1]
        if dup_numbers:
            report.fail_(f"Duplicate invoice_number values: {dup_numbers}")
        else:
            report.pass_("No duplicate invoice_number values")

        if dup_vs:
            report.fail_(f"Duplicate variable_symbol values: {dup_vs}")
        else:
            report.pass_("No duplicate variable_symbol values")

        non_digit = [n for n in invoice_numbers if not str(n).isdigit()]
        if non_digit:
            report.fail_(f"Non-numeric invoice numbers: {non_digit}")
        else:
            report.pass_("All invoice numbers are numeric")

        numeric_values = [int(n) for n in invoice_numbers if str(n).isdigit()]
        max_numeric = max(numeric_values) if numeric_values else 0
        width = max([len(n) for n in invoice_numbers] + [DEFAULT_PADDING])
        max_label = str(max_numeric).zfill(width)
        report.note(f"Max invoice number: {max_label} (numeric {max_numeric})")

        if default_state is not None:
            seq_last = int(default_state[0])
            if max_numeric != seq_last:
                report.fail_(
                    f"Max invoice number ({max_numeric}) != sequence last_number ({seq_last})"
                )
            else:
                report.pass_("Max invoice number matches sequence last_number")

        mismatched_vs = [
            (row[1], row[2])
            for row in rows
            if str(row[1]) != str(row[2])
        ]
        if mismatched_vs:
            report.note(f"Invoice number != VS on {len(mismatched_vs)} row(s) (may be OK)")
        else:
            report.pass_("All invoice numbers match variable_symbol")

        status_counts = conn.execute(
            """
            SELECT status, COUNT(*)
            FROM invoices
            WHERE COALESCE(document_kind, 'invoice') = 'invoice'
            GROUP BY status
            ORDER BY status
            """
        ).fetchall()
        for status, count in status_counts:
            report.note(f"  status {status!r}: {count}")

        if table_exists(conn, "invoice_attachments"):
            attachment_count = conn.execute("SELECT COUNT(*) FROM invoice_attachments").fetchone()[0]
            report.note(f"invoice_attachments rows: {attachment_count}")
        else:
            report.note("invoice_attachments table missing (OK on older DB)")

        last_rows = conn.execute(
            """
            SELECT invoice_number, variable_symbol, issue_date, status
            FROM invoices
            WHERE COALESCE(document_kind, 'invoice') = 'invoice'
            ORDER BY id DESC
            LIMIT 5
            """
        ).fetchall()
        report.note("Last 5 invoices:")
        for number, vs, issue_date, status in reversed(last_rows):
            report.note(f"  {number} VS={vs} issued={issue_date} status={status}")

        admin_count = 0
        if table_exists(conn, "users"):
            admin_count = conn.execute(
                "SELECT COUNT(*) FROM users WHERE role = 'admin'"
            ).fetchone()[0]
            report.note(f"Admin users: {admin_count}")
            if admin_count < 1:
                report.fail_("No admin user in users table (API login would fail)")
            else:
                report.pass_(f"At least one admin user present ({admin_count})")
        else:
            report.fail_("Missing users table")
    finally:
        conn.close()

    return report


def print_report(report: Report) -> None:
    print("")
    print("=== Lakodi production invoice snapshot verify ===")
    for line in report.info:
        print(line)
    print("")
    for line in report.ok:
        print(f"[OK]   {line}")
    for line in report.fail:
        print(f"[FAIL] {line}")
    print("")
    if report.fail:
        print(f"RESULT: FAIL ({len(report.ok)} passed, {len(report.fail)} failed)")
    else:
        print(f"RESULT: PASS ({len(report.ok)} checks passed)")


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only verify of prod invoice SQLite snapshot")
    parser.add_argument(
        "--db-path",
        type=Path,
        default=DEFAULT_SNAPSHOT,
        help=f"Path to snapshot DB (default: {DEFAULT_SNAPSHOT.relative_to(ROOT)})",
    )
    parser.add_argument(
        "--expected-sha256",
        default=DEFAULT_SHA256,
        help="Expected SHA-256 of the snapshot file (use empty string to skip)",
    )
    parser.add_argument("--expected-invoice-count", type=int, default=20)
    parser.add_argument("--expected-last-number", type=int, default=43)
    parser.add_argument("--expected-next-number", default="0044")
    args = parser.parse_args()

    expected_sha = args.expected_sha256.strip() or None
    report = verify_snapshot(
        args.db_path.resolve(),
        expected_sha256=expected_sha,
        expected_invoice_count=args.expected_invoice_count,
        expected_last_number=args.expected_last_number,
        expected_next_number=args.expected_next_number,
    )
    print_report(report)
    return 1 if report.fail else 0


if __name__ == "__main__":
    sys.exit(main())
