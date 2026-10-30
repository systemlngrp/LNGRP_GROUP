"""Mark post-2026-04-01 MRRs as Reel receipts with KG line units.

Dry-run is the default. Use ``--apply`` to commit the database changes.
This script only touches the MySQL application database; it does not access
or modify the Google Sheet.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

import pymysql


START_DATE = "2026-04-01"
DEFAULT_BATCH_SIZE = 100


def load_runtime_env() -> None:
    """Load the first available project .env without overwriting shell vars."""

    candidates = (
        Path.cwd() / ".env",
        Path(__file__).resolve().parent / ".env",
        Path(__file__).resolve().parents[1] / ".env",
    )
    for env_path in candidates:
        if not env_path.is_file():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            name = name.strip()
            value = value.strip().strip("\"'")
            os.environ.setdefault(name, value)
        return


def text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def normalize_firm_name(value: Any) -> str:
    return "".join(char for char in text(value).lower() if char.isalnum())


def parse_lines(raw: Any, row_id: str) -> list[dict[str, Any]]:
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid lines JSON for material_in id={row_id}: {exc}") from exc
    if value is None:
        return []
    if not isinstance(value, list):
        raise RuntimeError(f"material_in.lines is not an array for material_in id={row_id}")
    if not all(isinstance(line, dict) for line in value):
        raise RuntimeError(f"material_in.lines contains a non-object for material_in id={row_id}")
    return value


def connect() -> pymysql.connections.Connection:
    required = ("DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME")
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise RuntimeError(f"Missing database environment variable(s): {', '.join(missing)}")
    try:
        return pymysql.connect(
            host=os.environ["DB_HOST"],
            port=int(os.getenv("DB_PORT", "3306")),
            user=os.environ["DB_USER"],
            password=os.environ["DB_PASSWORD"],
            database=os.environ["DB_NAME"],
            connect_timeout=15,
            read_timeout=180,
            write_timeout=180,
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=False,
        )
    except pymysql.err.OperationalError as exc:
        if exc.args and int(exc.args[0]) == 1226:
            raise RuntimeError(
                "Database connection blocked by max_connections_per_hour (MySQL 1226). "
                "Wait for the hosting quota to reset or ask the provider to reset/increase it; "
                "do not retry repeatedly while this error is present."
            ) from exc
        raise


def database_identity(cur: pymysql.cursors.Cursor) -> tuple[str, str]:
    cur.execute("SELECT DATABASE() AS database_name, @@hostname AS database_host")
    row = cur.fetchone() or {}
    return text(row.get("database_host")), text(row.get("database_name"))


def find_unit_one(cur: pymysql.cursors.Cursor) -> dict[str, str]:
    cur.execute("SELECT id, firmName FROM firms ORDER BY firmName")
    firms = cur.fetchall()
    for firm in firms:
        normalized = normalize_firm_name(firm.get("firmName"))
        if normalized.endswith("unit1") or normalized.endswith("uniti"):
            return {"id": text(firm.get("id")), "firmName": text(firm.get("firmName"))}
    raise RuntimeError("No configured Unit-I firm was found in firms.firmName.")


def load_target_rows(
    cur: pymysql.cursors.Cursor,
    start_date: str,
    lock_rows: bool = False,
) -> list[dict[str, Any]]:
    lock_clause = " FOR UPDATE" if lock_rows else ""
    cur.execute(
        f"""
        SELECT id, transactionNo, date, mrrType, firmId, firmName, `lines`
        FROM material_in
        WHERE date >= %s
        ORDER BY date, transactionNo, id
        {lock_clause}
        """,
        (start_date,),
    )
    return list(cur.fetchall())


def snapshot_digest(cur: pymysql.cursors.Cursor, where_sql: str, params: tuple[Any, ...]) -> str:
    cur.execute(
        f"SELECT id, mrrType, firmId, firmName, `lines` FROM material_in WHERE {where_sql} ORDER BY id",
        params,
    )
    digest = hashlib.sha256()
    for row in cur.fetchall():
        payload = json.dumps(row, sort_keys=True, default=str, separators=(",", ":"))
        digest.update(payload.encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()


def prepare_update(row: dict[str, Any], unit_one: dict[str, str]) -> tuple[str, int, bool]:
    row_id = text(row.get("id"))
    lines = parse_lines(row.get("lines"), row_id)
    changed = text(row.get("mrrType")).casefold() != "reel"
    changed = changed or text(row.get("firmId")) != unit_one["id"]
    changed = changed or text(row.get("firmName")) != unit_one["firmName"]
    for line in lines:
        if text(line.get("uom")).upper() != "KG":
            changed = True
        line["uom"] = "KG"
    return json.dumps(lines, ensure_ascii=False, separators=(",", ":")), len(lines), changed


def preview(rows: list[dict[str, Any]], unit_one: dict[str, str], start_date: str) -> tuple[int, int]:
    records_needing_update = 0
    line_count = 0
    print(f"Target: material_in.date >= {start_date}")
    print(f"Unit-I: {unit_one['firmName']} ({unit_one['id']})")
    print(f"Qualifying MRR records: {len(rows)}")
    for row in rows:
        _, lines, changed = prepare_update(row, unit_one)
        line_count += lines
        records_needing_update += int(changed)
    print(f"Material lines scanned: {line_count}")
    print(f"Records needing update: {records_needing_update}")
    for row in rows[:10]:
        line_json, lines, changed = prepare_update(row, unit_one)
        parsed = json.loads(line_json)
        print(
            json.dumps(
                {
                    "id": text(row.get("id")),
                    "transactionNo": text(row.get("transactionNo")),
                    "date": text(row.get("date")),
                    "currentType": text(row.get("mrrType")),
                    "lineCount": lines,
                    "lineUomsAfterUpdate": [text(line.get("uom")) for line in parsed],
                    "wouldChange": changed,
                },
                ensure_ascii=False,
            )
        )
    return records_needing_update, line_count


def apply_updates(
    db: pymysql.connections.Connection,
    rows: list[dict[str, Any]],
    unit_one: dict[str, str],
    start_date: str,
    batch_size: int,
) -> tuple[int, int]:
    updated_records = 0
    updated_lines = 0
    with db.cursor() as cur:
        for offset in range(0, len(rows), batch_size):
            for row in rows[offset : offset + batch_size]:
                lines_json, line_count, changed = prepare_update(row, unit_one)
                if not changed:
                    continue
                cur.execute(
                    """
                    UPDATE material_in
                    SET mrrType = 'Reel', firmId = %s, firmName = %s, `lines` = %s
                    WHERE id = %s AND date >= %s
                    """,
                    (unit_one["id"], unit_one["firmName"], lines_json, text(row.get("id")), start_date),
                )
                if cur.rowcount != 1:
                    raise RuntimeError(f"Expected one updated row for material_in id={text(row.get('id'))}; got {cur.rowcount}")
                updated_records += 1
                updated_lines += line_count
    return updated_records, updated_lines


def verify(cur: pymysql.cursors.Cursor, unit_one: dict[str, str], start_date: str, before_digest: str) -> None:
    cur.execute(
        """
        SELECT id, mrrType, firmId, firmName, `lines`
        FROM material_in
        WHERE date >= %s
        """,
        (start_date,),
    )
    bad_records = []
    bad_lines = []
    for row in cur.fetchall():
        if text(row.get("mrrType")).casefold() != "reel" or text(row.get("firmId")) != unit_one["id"]:
            bad_records.append(text(row.get("id")))
        lines = parse_lines(row.get("lines"), text(row.get("id")))
        bad_lines.extend(
            (text(row.get("id")), index)
            for index, line in enumerate(lines)
            if text(line.get("uom")).upper() != "KG"
        )
    after_digest = snapshot_digest(cur, "date < %s", (start_date,))
    if bad_records or bad_lines:
        raise RuntimeError(
            f"Verification failed: bad records={bad_records[:5]}, bad lines={bad_lines[:5]}"
        )
    if before_digest != after_digest:
        raise RuntimeError("Verification failed: a pre-cutoff material_in snapshot changed.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Commit changes; default is dry-run")
    parser.add_argument("--start-date", default=START_DATE, help="Inclusive ISO date; default: 2026-04-01")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    args = parser.parse_args()
    if args.batch_size <= 0:
        parser.error("--batch-size must be positive")
    load_runtime_env()
    db = None
    try:
        db = connect()
        if args.apply:
            db.begin()
        with db.cursor() as cur:
            host, database = database_identity(cur)
            unit_one = find_unit_one(cur)
            rows = load_target_rows(cur, args.start_date, lock_rows=args.apply)
            before_digest = snapshot_digest(cur, "date < %s", (args.start_date,))
            records_needing_update, line_count = preview(rows, unit_one, args.start_date)
            print(f"Connected database: host={host}; database={database}")
            if not args.apply:
                print("DRY RUN: no database changes committed.")
                return 0
            updated_records, updated_lines = apply_updates(db, rows, unit_one, args.start_date, args.batch_size)
            verify(cur, unit_one, args.start_date, before_digest)
        db.commit()
        print(f"Applied: records={updated_records}; material_lines={updated_lines}; scanned_lines={line_count}")
        if updated_records != records_needing_update:
            raise RuntimeError("Update count mismatch between preview and apply.")
        return 0
    except Exception as exc:
        if db is not None:
            db.rollback()
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    finally:
        if db is not None:
            db.close()


if __name__ == "__main__":
    raise SystemExit(main())
