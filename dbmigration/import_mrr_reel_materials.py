"""Import Reel materials and opening Our Reel records from Google Sheets.

The importer reads MRR FORM and HELPER SHEET, then creates or updates Reel
material masters and opening-stock packing slips in the application database.
It never creates material_in MRR documents and never writes to Google Sheets.

Dry-run is the default. Use --apply only after reviewing the preview.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import uuid
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable

import gspread
import pymysql
from google.oauth2.service_account import Credentials


DEFAULT_SPREADSHEET_ID = "1MAZwiGb5bgNXyAW-Bv4LfrdBF6mtYLyNco5IUDPnCfQ"
DEFAULT_START_DATE = dt.date(2026, 4, 1)
DEFAULT_BATCH_SIZE = 100
SHEET_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]


@dataclass(frozen=True)
class ReelRow:
    source_row: int
    mrr_no: str
    mrr_date: dt.date
    supplier_name: str
    erp_code: str
    size: Decimal
    gsm: Decimal
    bf: Decimal
    our_reel_no: str
    supplier_reel_no: str
    weight_kg: Decimal
    opening_rate: Decimal
    color: str = "LG"


def load_runtime_env() -> None:
    for env_path in (Path.cwd() / ".env", Path(__file__).resolve().parents[1] / ".env"):
        if not env_path.is_file():
            continue
        for raw in env_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            os.environ.setdefault(name.strip(), value.strip().strip("\"'"))
        return


def clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


def key(value: Any) -> str:
    return clean(value).casefold()


def parse_date(value: Any) -> dt.date | None:
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    raw = clean(value)
    if not raw:
        return None
    if re.fullmatch(r"\d+(?:\.\d+)?", raw):
        try:
            return dt.date(1899, 12, 30) + dt.timedelta(days=float(raw))
        except (OverflowError, ValueError):
            return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%m-%d-%Y"):
        try:
            return dt.datetime.strptime(raw[:10], fmt).date()
        except ValueError:
            pass
    return None


def decimal(value: Any, field: str, row_number: int, *, positive: bool = False) -> Decimal:
    try:
        result = Decimal(clean(value).replace(",", ""))
    except (InvalidOperation, ValueError):
        raise ValueError(f"Row {row_number}: {field} must be numeric; got {value!r}")
    if not result.is_finite() or (positive and result <= 0) or (not positive and result < 0):
        comparator = "greater than 0" if positive else "zero or greater"
        raise ValueError(f"Row {row_number}: {field} must be {comparator}; got {value!r}")
    return result.quantize(Decimal("0.01"))


def header_map(headers: list[Any]) -> dict[str, int]:
    return {clean(value).casefold(): index for index, value in enumerate(headers)}


def required_column(headers: dict[str, int], *names: str) -> int:
    for name in names:
        if name.casefold() in headers:
            return headers[name.casefold()]
    raise ValueError(f"Missing required sheet column: {' / '.join(names)}")


def cell(row: list[Any], headers: dict[str, int], *names: str) -> Any:
    index = required_column(headers, *names)
    return row[index] if index < len(row) else ""


def load_sheet_rows(credentials_path: Path, spreadsheet_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    credentials = Credentials.from_service_account_file(str(credentials_path), scopes=SHEET_SCOPES)
    book = gspread.authorize(credentials).open_by_key(spreadsheet_id)
    mrr_values = book.worksheet("MRR FORM").get_all_values(value_render_option="UNFORMATTED_VALUE")
    helper_values = book.worksheet("HELPER SHEET").get_all_values(value_render_option="UNFORMATTED_VALUE")
    if not mrr_values or not helper_values:
        raise ValueError("MRR FORM or HELPER SHEET is empty.")
    mrr_headers = header_map(mrr_values[0])
    helper_headers = header_map(helper_values[0])
    mrr_date_index = required_column(mrr_headers, "Date")
    mrr_no_index = required_column(mrr_headers, "MRR Number")
    mrr_supplier_index = required_column(mrr_headers, "SUPPLIER")
    mrr_rows = [
        {
            "row": row_number,
            "date": parse_date(row[mrr_date_index] if mrr_date_index < len(row) else ""),
            "mrr_no": clean(row[mrr_no_index] if mrr_no_index < len(row) else ""),
            "supplier": clean(row[mrr_supplier_index] if mrr_supplier_index < len(row) else ""),
        }
        for row_number, row in enumerate(mrr_values[1:], start=2)
    ]
    helper_rows = [
        {"row": row_number, "values": row, "headers": helper_headers}
        for row_number, row in enumerate(helper_values[1:], start=2)
    ]
    return mrr_rows, helper_rows


def build_import_rows(
    mrr_rows: list[dict[str, Any]],
    helper_rows: list[dict[str, Any]],
    start_date: dt.date,
) -> tuple[list[ReelRow], dict[str, Any]]:
    eligible_mrr: dict[str, dict[str, Any]] = {}
    for row in mrr_rows:
        mrr_no = clean(row["mrr_no"])
        if not mrr_no or not row["date"] or row["date"] < start_date:
            continue
        prior = eligible_mrr.get(key(mrr_no))
        if prior and (prior["date"] != row["date"] or prior["supplier"] != row["supplier"]):
            raise ValueError(f"MRR FORM has conflicting duplicate MRR Number {mrr_no} at rows {prior['row']} and {row['row']}")
        eligible_mrr[key(mrr_no)] = row

    rows: list[ReelRow] = []
    rows_by_reel: dict[str, list[ReelRow]] = {}
    material_signatures: dict[str, set[tuple[Decimal, Decimal, Decimal, str]]] = {}
    for item in helper_rows:
        raw = item["values"]
        headers = item["headers"]
        mrr_no = clean(cell(raw, headers, "MRR Number"))
        mrr = eligible_mrr.get(key(mrr_no))
        if not mrr:
            continue
        row_number = item["row"]
        supplier_name = clean(cell(raw, headers, "SUPPLIER", "Supplier Name")) or clean(mrr["supplier"])
        erp_raw = clean(cell(raw, headers, "ERP Code", "ERP"))
        our_reel_no = clean(cell(raw, headers, "Our Reel Number", "Our Reel No."))
        if not supplier_name:
            raise ValueError(f"HELPER SHEET row {row_number}: supplier is missing.")
        if not our_reel_no:
            raise ValueError(f"HELPER SHEET row {row_number}: Our Reel Number is missing.")
        if not re.fullmatch(r"\d+", erp_raw) or int(erp_raw) <= 0:
            raise ValueError(f"HELPER SHEET row {row_number}: ERP Code must be a positive integer.")
        erp_code = str(int(erp_raw))
        size = decimal(cell(raw, headers, "Size"), "Size", row_number, positive=True)
        gsm = decimal(cell(raw, headers, "GSM"), "GSM", row_number, positive=True)
        bf = decimal(cell(raw, headers, "BF"), "BF", row_number, positive=True)
        weight = decimal(cell(raw, headers, "Weight"), "Weight", row_number, positive=True)
        rate = decimal(cell(raw, headers, "Rate"), "Rate", row_number)
        supplier_reel_no = clean(cell(raw, headers, "Supplier Reel No.", "Supplier Reel No", "SUPPLIER REEL"))
        record = ReelRow(
            source_row=row_number,
            mrr_no=mrr_no,
            mrr_date=mrr["date"],
            supplier_name=supplier_name,
            erp_code=erp_code,
            size=size,
            gsm=gsm,
            bf=bf,
            our_reel_no=our_reel_no,
            supplier_reel_no=supplier_reel_no,
            weight_kg=weight,
            opening_rate=rate,
        )
        signature = (size, gsm, bf, record.color.casefold())
        rows_by_reel.setdefault(key(our_reel_no), []).append(record)
        material_signatures.setdefault(erp_code, set()).add(signature)
        rows.append(record)
    duplicate_reels = {reel for reel, matching_rows in rows_by_reel.items() if len(matching_rows) > 1}
    conflicting_erps = {erp for erp, signatures in material_signatures.items() if len(signatures) > 1}
    safe_rows = [row for row in rows if key(row.our_reel_no) not in duplicate_reels and row.erp_code not in conflicting_erps]
    skipped = {
        "duplicate_reel_numbers": sorted(duplicate_reels),
        "conflicting_erp_codes": sorted(conflicting_erps),
        "skipped_rows": len(rows) - len(safe_rows),
    }
    return safe_rows, skipped


def credential_path(argument: str | None) -> Path:
    value = argument or os.getenv("GOOGLE_APPLICATION_CREDENTIALS") or os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if value:
        path = Path(value.strip("\"'"))
    else:
        path = Path(__file__).resolve().parent / ".venv" / "db-migrations.json"
    if not path.is_file():
        raise FileNotFoundError(f"Google service-account key not found: {path}")
    return path


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
            raise RuntimeError("Database connection blocked by max_connections_per_hour (MySQL 1226).") from exc
        raise


def unit_one(cur: pymysql.cursors.Cursor) -> dict[str, str]:
    cur.execute("SELECT id, firmName FROM firms ORDER BY firmName")
    for row in cur.fetchall():
        normalized = re.sub(r"[^a-z0-9]+", "", clean(row["firmName"]).casefold())
        if normalized.endswith("unit1") or normalized.endswith("uniti"):
            return {"id": clean(row["id"]), "name": clean(row["firmName"])}
    raise RuntimeError("Configured Unit-I firm was not found.")


def dec(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def chunks(values: list[ReelRow], size: int) -> Iterable[list[ReelRow]]:
    for offset in range(0, len(values), size):
        yield values[offset : offset + size]


def preview(rows: list[ReelRow], skipped: dict[str, Any], start_date: dt.date) -> None:
    print(f"Source cutoff: {start_date.isoformat()}")
    print(f"Eligible MRR numbers: {len({row.mrr_no for row in rows})}")
    print(f"Helper rows / Our Reels: {len(rows)}")
    print(f"Unique ERP materials: {len({row.erp_code for row in rows})}")
    print(f"Rows skipped as non-unique: {skipped['skipped_rows']}")
    if skipped["duplicate_reel_numbers"]:
        print(f"Duplicate Our Reel numbers skipped: {', '.join(skipped['duplicate_reel_numbers'])}")
    if skipped["conflicting_erp_codes"]:
        print(f"Conflicting ERP codes skipped: {', '.join(skipped['conflicting_erp_codes'])}")
    print("Sample rows:")
    for row in rows[:10]:
        print(json.dumps({"sourceRow": row.source_row, "mrrNo": row.mrr_no, "erp": row.erp_code, "ourReelNo": row.our_reel_no, "weightKg": str(row.weight_kg), "rate": str(row.opening_rate)}))


def import_rows(db: pymysql.connections.Connection, rows: list[ReelRow]) -> tuple[int, int, int]:
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    with db.cursor() as cur:
        firm = unit_one(cur)
        cur.execute("SELECT id, name FROM suppliers")
        suppliers = {key(row["name"]): row for row in cur.fetchall()}
        cur.execute("SELECT id, name FROM material_groups")
        groups = {key(row["name"]): row for row in cur.fetchall()}
        reel_group = groups.get("reel")
        if not reel_group:
            reel_group = {"id": str(uuid.uuid4()), "name": "Reel"}
            cur.execute("INSERT INTO material_groups (id, name, updatedBy, updateTimestamp) VALUES (%s, %s, %s, %s)", (reel_group["id"], "Reel", "MRR Reel Import", now))
        cur.execute("SELECT id, erpCode FROM materials")
        materials = {}
        for existing in cur.fetchall():
            erp = clean(existing["erpCode"])
            if erp:
                if erp in materials:
                    raise RuntimeError(f"Duplicate ERP Code {erp} already exists in materials.")
                materials[erp] = existing
        cur.execute("SELECT * FROM material_in_packing_slips")
        slips = {}
        for existing in cur.fetchall():
            reel_key = key(existing["ourReelNo"])
            if reel_key:
                if reel_key in slips:
                    raise RuntimeError(f"Duplicate Our Reel No. {existing['ourReelNo']} already exists in database.")
                slips[reel_key] = existing

        for supplier_name in sorted({row.supplier_name for row in rows}, key=key):
            supplier_key = key(supplier_name)
            if supplier_key not in suppliers:
                supplier_id = str(uuid.uuid4())
                cur.execute("INSERT INTO suppliers (id, name, firmId, gstSupplyType, active, updatedBy, updateTimestamp) VALUES (%s, %s, %s, 'INTRA_STATE', 'Yes', %s, %s)", (supplier_id, supplier_name, firm["id"], "MRR Reel Import", now))
                suppliers[supplier_key] = {"id": supplier_id, "name": supplier_name}

        material_ids: dict[str, str] = {}
        created_materials = 0
        updated_materials = 0
        for erp_code in sorted({row.erp_code for row in rows}):
            sample = next(row for row in rows if row.erp_code == erp_code)
            material = materials.get(erp_code)
            material_id = clean(material["id"]) if material else str(uuid.uuid4())
            name = f"{erp_code} - Size: {sample.size} CM X GSM: {sample.gsm} X BF: {sample.bf}   Color - {sample.color}"
            if material:
                cur.execute("UPDATE materials SET firmId=%s, type='Reel', name=%s, uom='KGS', materialGroupId=%s, color=%s, size=%s, gsm=%s, bf=%s, active='Yes', updatedBy=%s, updateTimestamp=%s WHERE id=%s", (firm["id"], name, reel_group["id"], sample.color, sample.size, sample.gsm, sample.bf, "MRR Reel Import", now, material_id))
                updated_materials += 1
            else:
                cur.execute("INSERT INTO materials (id, firmId, type, erpCode, name, uom, materialGroupId, color, size, gsm, bf, active, updatedBy, updateTimestamp) VALUES (%s, %s, 'Reel', %s, %s, 'KGS', %s, %s, %s, %s, %s, 'Yes', %s, %s)", (material_id, firm["id"], erp_code, name, reel_group["id"], sample.color, sample.size, sample.gsm, sample.bf, "MRR Reel Import", now))
                created_materials += 1
            material_ids[erp_code] = material_id

        inserted_reels = 0
        updated_reels = 0
        touched_materials = set(material_ids.values())
        for row in rows:
            existing = slips.get(key(row.our_reel_no))
            supplier_id = suppliers[key(row.supplier_name)]["id"]
            material_id = material_ids[row.erp_code]
            if existing and key(existing["materialInId"]) != "opening":
                raise RuntimeError(f"Our Reel {row.our_reel_no} is already linked to a real MRR and cannot become opening stock.")
            if existing:
                cur.execute("UPDATE material_in_packing_slips SET firmId=%s, supplierId=%s, materialInId='OPENING', materialLineId=%s, materialId=%s, ourReelNo=%s, supplierReelNo=%s, weightKg=%s, openingRate=%s, updatedBy=%s, updateTimestamp=%s WHERE id=%s", (firm["id"], supplier_id, existing["id"], material_id, row.our_reel_no, row.supplier_reel_no or existing["supplierReelNo"], row.weight_kg, row.opening_rate, "MRR Reel Import", now, existing["id"]))
                updated_reels += 1
            else:
                slip_id = str(uuid.uuid4())
                cur.execute("INSERT INTO material_in_packing_slips (id, firmId, supplierId, materialInId, materialLineId, materialId, ourReelNo, supplierReelNo, weightKg, openingRate, updatedBy, updateTimestamp) VALUES (%s, %s, %s, 'OPENING', %s, %s, %s, %s, %s, %s, %s, %s)", (slip_id, firm["id"], supplier_id, slip_id, material_id, row.our_reel_no, row.supplier_reel_no or None, row.weight_kg, row.opening_rate, "MRR Reel Import", now))
                inserted_reels += 1

        for material_id in touched_materials:
            cur.execute("SELECT COALESCE(SUM(weightKg),0) AS qty, COALESCE(SUM(weightKg * COALESCE(openingRate,0)),0) AS value FROM material_in_packing_slips WHERE materialId=%s AND firmId=%s AND UPPER(TRIM(materialInId))='OPENING'", (material_id, firm["id"]))
            aggregate = cur.fetchone()
            qty = dec(aggregate["qty"])
            value = dec(aggregate["value"])
            rate = (value / qty).quantize(Decimal("0.01")) if qty else Decimal("0.00")
            cur.execute("INSERT INTO material_firm_openings (id, materialId, firmId, openingQty, openingRate, openingValue, updatedBy, updateTimestamp) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON DUPLICATE KEY UPDATE openingQty=VALUES(openingQty), openingRate=VALUES(openingRate), openingValue=VALUES(openingValue), updatedBy=VALUES(updatedBy), updateTimestamp=VALUES(updateTimestamp)", (str(uuid.uuid4()), material_id, firm["id"], qty, rate, value, "MRR Reel Import", now))
    return created_materials, updated_materials, inserted_reels + updated_reels


def verify_import(rows: list[ReelRow]) -> None:
    """Verify every safe source row and its Unit-I opening aggregate."""

    db = connect()
    try:
        with db.cursor() as cur:
            firm = unit_one(cur)
            expected_reels = {key(row.our_reel_no): row for row in rows}
            expected_materials = {row.erp_code for row in rows}
            found_reels: dict[str, dict[str, Any]] = {}
            for batch in chunks(rows, 200):
                placeholders = ",".join(["%s"] * len(batch))
                cur.execute(
                    f"""
                    SELECT ps.id, ps.ourReelNo, ps.materialInId, ps.firmId,
                           ps.materialId, ps.weightKg, ps.openingRate,
                           m.erpCode, m.type, m.uom, m.firmId AS materialFirmId
                    FROM material_in_packing_slips ps
                    JOIN materials m ON m.id = ps.materialId
                    WHERE LOWER(TRIM(ps.ourReelNo)) IN ({placeholders})
                    """,
                    tuple(key(row.our_reel_no) for row in batch),
                )
                for found in cur.fetchall():
                    reel_key = key(found["ourReelNo"])
                    if reel_key in found_reels:
                        raise RuntimeError(f"Verification found duplicate database Our Reel No. {found['ourReelNo']}.")
                    found_reels[reel_key] = found

            missing = sorted(set(expected_reels) - set(found_reels))
            if missing:
                raise RuntimeError(f"Verification missing {len(missing)} Our Reel records; first: {missing[:5]}")
            for reel_key, expected in expected_reels.items():
                found = found_reels[reel_key]
                if key(found["materialInId"]) != "opening" or clean(found["firmId"]) != firm["id"]:
                    raise RuntimeError(f"Verification failed for Our Reel {expected.our_reel_no}: not Unit-I opening stock.")
                if clean(found["erpCode"]) != expected.erp_code or clean(found["type"]).casefold() != "reel" or clean(found["uom"]).upper() != "KGS":
                    raise RuntimeError(f"Verification failed for Our Reel {expected.our_reel_no}: material mapping/type/UOM mismatch.")

            material_ids = {clean(found["materialId"]) for found in found_reels.values()}
            if len({clean(found["erpCode"]) for found in found_reels.values()}) != len(expected_materials):
                raise RuntimeError("Verification found an unexpected ERP material set.")
            for material_id in material_ids:
                cur.execute(
                    """
                    SELECT COALESCE(SUM(weightKg), 0) AS qty,
                           COALESCE(SUM(weightKg * COALESCE(openingRate, 0)), 0) AS value
                    FROM material_in_packing_slips
                    WHERE materialId = %s AND firmId = %s AND UPPER(TRIM(materialInId)) = 'OPENING'
                    """,
                    (material_id, firm["id"]),
                )
                aggregate = cur.fetchone()
                cur.execute(
                    "SELECT openingQty, openingRate, openingValue FROM material_firm_openings WHERE materialId = %s AND firmId = %s LIMIT 1",
                    (material_id, firm["id"]),
                )
                opening = cur.fetchone()
                if not opening:
                    raise RuntimeError(f"Verification missing material_firm_openings for material {material_id}.")
                if dec(aggregate["qty"]) != dec(opening["openingQty"]) or dec(aggregate["value"]) != dec(opening["openingValue"]):
                    raise RuntimeError(f"Verification aggregate mismatch for material {material_id}.")
        print(f"Verification passed: reels={len(found_reels)}; materials={len(material_ids)}")
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Commit database changes; default is dry-run")
    parser.add_argument("--start-date", default=DEFAULT_START_DATE.isoformat())
    parser.add_argument("--spreadsheet-id", default=DEFAULT_SPREADSHEET_ID)
    parser.add_argument("--credentials", default=None)
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--start-batch", type=int, default=1, help="1-based batch number to start from")
    parser.add_argument("--max-batches", type=int, default=0, help="Maximum batches to apply; 0 means all")
    args = parser.parse_args()
    if args.batch_size <= 0:
        parser.error("--batch-size must be positive")
    if args.start_batch <= 0:
        parser.error("--start-batch must be positive")
    if args.max_batches < 0:
        parser.error("--max-batches cannot be negative")
    try:
        start_date = dt.date.fromisoformat(args.start_date)
        load_runtime_env()
        credentials = credential_path(args.credentials)
        mrr_rows, helper_rows = load_sheet_rows(credentials, args.spreadsheet_id)
        rows, skipped = build_import_rows(mrr_rows, helper_rows, start_date)
        preview(rows, skipped, start_date)
        if not rows:
            print("No eligible helper rows found; no database changes made.")
            return 0
        batches = list(chunks(rows, args.batch_size))
        if args.start_batch > len(batches):
            raise ValueError(f"--start-batch {args.start_batch} is beyond the {len(batches)} available batches.")
        end_batch = len(batches) if not args.max_batches else min(len(batches), args.start_batch + args.max_batches - 1)
        selected = list(enumerate(batches[args.start_batch - 1 : end_batch], start=args.start_batch))
        print(f"Batches: total={len(batches)}; selected={len(selected)}; size={args.batch_size}")
        if not args.apply:
            print("DRY RUN: no database changes committed.")
            return 0
        totals = [0, 0, 0]
        for batch_number, batch_rows in selected:
            db = connect()
            try:
                db.begin()
                created, updated, reels = import_rows(db, batch_rows)
                db.commit()
                totals[0] += created
                totals[1] += updated
                totals[2] += reels
                print(f"Batch {batch_number}/{len(batches)} committed: rows={len(batch_rows)}; materials_created={created}; materials_updated={updated}; reels_inserted_or_updated={reels}")
            except Exception as exc:
                db.rollback()
                raise RuntimeError(f"Batch {batch_number} failed and was rolled back: {exc}") from exc
            finally:
                db.close()
        if args.start_batch == 1 and end_batch == len(batches):
            verify_import(rows)
        print(f"Applied totals: materials_created={totals[0]}; materials_updated={totals[1]}; reels_inserted_or_updated={totals[2]}")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
