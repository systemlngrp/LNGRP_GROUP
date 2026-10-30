"""Single resumable BK order, schedule, and job migration."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import uuid
from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

import pymysql
from google.oauth2 import service_account
from googleapiclient.discovery import build



def load_runtime_env():
    candidates = (
        Path.cwd() / ".env",
        Path(__file__).resolve().parent / ".env",
        Path(__file__).resolve().parents[1] / ".env",
    )
    for env_path in candidates:
        if not env_path.is_file():
            continue
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            name = name.strip()
            value = value.strip()
            if name.startswith("export "):
                name = name[7:].strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            os.environ.setdefault(name, value)
        return


load_runtime_env()

SHEET_ID = os.getenv("GOOGLE_SHEET_ID", "1IP3xnNElvdvNLDYPK9Za6E8Nl8nnw3CByeLDUSCD4BY")
UNIT_II_ID = "334aa279-b7f3-450d-8b34-ee538a70e802"
UNIT_II_NAME = "Laxmi Narayan Corrugated Boards LLP (Unit-II)"
DEFAULT_CREDENTIALS_PATH = Path(__file__).resolve().parent / ".venv" / "db-migrations.json"
START_DATE = "2026-04-01"
BATCH_SIZE = int(os.getenv("MIGRATION_BATCH_SIZE", "100"))
SCHEDULE_COLUMN_INDEX = 8  # New Order Master column I

if BATCH_SIZE <= 0:
    raise RuntimeError("MIGRATION_BATCH_SIZE must be a positive integer")


def chunks(values, size=BATCH_SIZE):
    batch = []
    for value in values:
        batch.append(value)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def configure_cli():
    parser = argparse.ArgumentParser(description="Migrate BK orders, schedules, and jobs")
    parser.add_argument("--apply", action="store_true", help="Commit database changes; default is dry-run")
    parser.add_argument("--order-ids-file", help="Optional file containing quoted Order Id values")
    args = parser.parse_args()
    os.environ["DRY_RUN"] = "false" if args.apply else "true"
    if args.order_ids_file:
        os.environ["ORDER_IDS_FILE"] = str(Path(args.order_ids_file).expanduser().resolve())


def s(value: Any) -> str:
    return "" if value is None else str(value).strip()


def oid(value: Any) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return s(value)


def dec(value: Any) -> Decimal:
    try:
        return Decimal(s(value).replace(",", ""))
    except Exception:
        return Decimal("0")


def ymd(value: Any) -> str:
    if isinstance(value, (int, float)):
        return (datetime(1899, 12, 30) + timedelta(days=float(value))).date().isoformat()
    raw = s(value)[:10]
    if re.fullmatch(r"\d+(?:\.\d+)?", raw):
        try:
            return (datetime(1899, 12, 30) + timedelta(days=float(raw))).date().isoformat()
        except (OverflowError, ValueError):
            return ""
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return ""


def order_id_allowlist():
    order_ids_file = os.getenv("ORDER_IDS_FILE", "").strip()
    if not order_ids_file:
        return None
    path = Path(order_ids_file.strip("\"'"))
    if not path.is_file():
        raise RuntimeError(f"Order Id allowlist file not found: {path}")
    text = path.read_text(encoding="utf-8")
    ids = {oid(value) for value in re.findall(r'"([^"\r\n]+)"', text)}
    ids.discard("")
    if not ids:
        raise RuntimeError(f"Order Id allowlist is empty: {path}")
    return ids


def credentials(scopes):
    credential_value = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON") or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not credential_value:
        if DEFAULT_CREDENTIALS_PATH.is_file():
            credential_value = str(DEFAULT_CREDENTIALS_PATH)
    if not credential_value:
        local_keys = list(Path(__file__).resolve().parent.glob("*.json"))
        if len(local_keys) == 1:
            credential_value = str(local_keys[0])
    if not credential_value:
        raise RuntimeError(
            "Google service-account key not found. Save a rotated key as "
            "D:\\LNGRP\\dbmigration\\.venv\\db-migrations.json, or set "
            "GOOGLE_APPLICATION_CREDENTIALS to its full path."
        )
    credential_value = credential_value.strip()
    credential_path = Path(credential_value.strip("\"'")).expanduser()
    if credential_path.is_file():
        return service_account.Credentials.from_service_account_file(str(credential_path), scopes=scopes)
    if credential_value.lower().endswith(".json") or "\\" in credential_value or "/" in credential_value:
        local_key = Path(__file__).resolve().parent / ".venv" / credential_path.name
        hint = f" A key with the same filename exists at {local_key}." if local_key.is_file() else ""
        raise RuntimeError(f"Google service-account JSON file not found: {credential_path}.{hint}")
    else:
        try:
            credential_info = json.loads(credential_value.lstrip("\ufeff"))
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                "Google credentials must be either an existing JSON key file path "
                "(GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS) "
                "or the service-account JSON object itself"
            ) from exc
        return service_account.Credentials.from_service_account_info(credential_info, scopes=scopes)


def sheets_values(write=False):
    scope = "https://www.googleapis.com/auth/spreadsheets" if write else "https://www.googleapis.com/auth/spreadsheets.readonly"
    creds = credentials([scope])
    return build("sheets", "v4", credentials=creds, cache_discovery=False).spreadsheets().values()


def sheet_rows(include_all_daily=False):
    values = sheets_values()
    allowlist = order_id_allowlist()
    print("Reading Daily Production Master and New Order Master...", flush=True)
    ranges = [
        "'Daily Production Master'!C:C",
        "'Daily Production Master'!B:B",
        "'Daily Production Master'!E:E",
        "'Daily Production Master'!BE:BG",
        "'Daily Production Master'!BK:BK",
        "'New Order Master'!A:ZZ",
    ]
    response = values.batchGet(spreadsheetId=SHEET_ID, ranges=ranges).execute()
    value_ranges = response.get("valueRanges", [])

    def range_values(index):
        return value_ranges[index].get("values", []) if index < len(value_ranges) else []

    daily_job = range_values(0)
    daily_date = range_values(1)
    daily_erp = range_values(2)
    daily_cancel = range_values(3)
    bk_raw = range_values(4)
    eligible_jobs = []
    bk = set()
    row_count = max(len(daily_job), len(daily_date), len(daily_erp), len(daily_cancel), len(bk_raw))
    for i in range(1, row_count):
        cancel = daily_cancel[i] if i < len(daily_cancel) else []
        item = {
            "order": oid(bk_raw[i][0]) if i < len(bk_raw) and bk_raw[i] else "",
            "erp": s(daily_erp[i][0]) if i < len(daily_erp) and daily_erp[i] else "",
            "date": ymd(daily_date[i][0]) if i < len(daily_date) and daily_date[i] else "",
            "jobcard": s(daily_job[i][0]) if i < len(daily_job) and daily_job[i] else "",
            "timestamp": s(cancel[0]) if len(cancel) > 0 else "",
            "email": s(cancel[1]) if len(cancel) > 1 else "",
            "reason": s(cancel[2]) if len(cancel) > 2 else "",
        }
        if item["order"] in {"", "0"} or (allowlist is not None and item["order"] not in allowlist):
            continue
        if not include_all_daily and (
            item["date"] < START_DATE or any(item[key] for key in ("timestamp", "email", "reason"))
        ):
            continue
        bk.add(item["order"])
        if item["jobcard"]:
            eligible_jobs.append(item)
    print(f"Eligible Daily Production Master rows: {len(eligible_jobs)}", flush=True)

    raw = range_values(5)
    if not raw:
        return bk, [], eligible_jobs
    headers = [s(x).rstrip() for x in raw[0]]
    schedule_index = next(
        (index for index, header in enumerate(headers) if header.lower() == "scheduled date"),
        SCHEDULE_COLUMN_INDEX,
    )
    if schedule_index >= len(headers):
        raise RuntimeError("New Order Master column I (Scheduled Date) was not returned")
    required = {"Order Id", "Order Date", "Company Name", "ERP Code", "Item", "Qty", "Rate"}
    missing = required - set(headers)
    if missing:
        raise RuntimeError("Missing columns in New Order Master: " + ", ".join(sorted(missing)))
    grouped = {}
    for values_row in raw[1:]:
        row = {headers[i]: values_row[i] if i < len(values_row) else "" for i in range(len(headers))}
        order = oid(row.get("Order Id"))
        scheduled = ymd(values_row[schedule_index] if schedule_index < len(values_row) else "")
        if order not in bk or not scheduled or dec(row.get("Qty")) <= 0:
            continue
        current = grouped.setdefault(order, {
            "order": order,
            "order_date": ymd(row.get("Order Date")),
            "company": s(row.get("Company Name")),
            "po": s(row.get("PO Number")),
            "erp": s(row.get("ERP Code")),
            "item_name": s(row.get("Item")),
            "qty": dec(row.get("Qty")),
            "rate": dec(row.get("Rate")),
            "schedules": [],
        })
        if not any(x["date"] == scheduled for x in current["schedules"]):
            current["schedules"].append({
                "date": scheduled,
                "qty": dec(row.get("Qty")),
                "erp": s(row.get("ERP Code")),
            })
    return bk, [row for row in grouped.values() if row["schedules"]], eligible_jobs

def connect():
    return pymysql.connect(
        host=os.environ["DB_HOST"], port=int(os.getenv("DB_PORT", "3306")),
        user=os.environ["DB_USER"], password=os.environ["DB_PASSWORD"], database=os.environ["DB_NAME"],
        connect_timeout=15, read_timeout=180, write_timeout=180,
        cursorclass=pymysql.cursors.Cursor, autocommit=False
    )


def safe_rollback(db):
    try:
        db.rollback()
    except (pymysql.MySQLError, OSError):
        # A lost connection has already discarded the server-side transaction.
        pass


def reopen_connection(db, cur):
    try:
        cur.close()
    except Exception:
        pass
    try:
        db.close()
    except Exception:
        pass
    new_db = connect()
    return new_db, new_db.cursor()


def database_preflight(cur, enforce=False):
    cur.execute("SELECT DATABASE(), @@hostname")
    database_name, database_host = cur.fetchone()
    cur.execute("SELECT COUNT(*) FROM orders")
    order_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM orders_schedule")
    schedule_count = cur.fetchone()[0]
    identity = {
        "host": s(database_host),
        "database": s(database_name),
        "orders": int(order_count),
        "schedules": int(schedule_count),
    }
    print(
        f"Database preflight: host={identity['host']}; database={identity['database']}; "
        f"orders={identity['orders']}; schedules={identity['schedules']}",
        flush=True,
    )
    expected_host = os.getenv("MIGRATION_EXPECTED_DB_HOST", "").strip()
    expected_name = os.getenv("MIGRATION_EXPECTED_DB_NAME", "").strip()
    mismatches = []
    if expected_host and identity["host"].lower() != expected_host.lower():
        mismatches.append(f"host expected {expected_host!r}, got {identity['host']!r}")
    if expected_name and identity["database"].lower() != expected_name.lower():
        mismatches.append(f"database expected {expected_name!r}, got {identity['database']!r}")
    if enforce and mismatches:
        raise RuntimeError("Database identity check failed: " + "; ".join(mismatches))
    if enforce and not expected_host and not expected_name:
        print("Warning: MIGRATION_EXPECTED_DB_HOST/NAME are not set; database identity was reported but not enforced.", flush=True)
    return identity


def one(cur, sql, params=()):
    cur.execute(sql, params)
    return cur.fetchone()


def rows(cur, sql, params=()):
    cur.execute(sql, params)
    return cur.fetchall()


def ensure_links(cur):
    cur.execute("""CREATE TABLE IF NOT EXISTS sales_order_sheet_links (
      spreadsheetId VARCHAR(100) NOT NULL, sourceOrderId VARCHAR(100) NOT NULL,
      orderId VARCHAR(36) NOT NULL, PRIMARY KEY (spreadsheetId, sourceOrderId),
      UNIQUE KEY uq_sales_sheet_order (orderId))""")
    cur.execute("""CREATE TABLE IF NOT EXISTS sales_order_sheet_schedule_links (
      spreadsheetId VARCHAR(100) NOT NULL, sourceOrderId VARCHAR(100) NOT NULL,
      slotNo TINYINT UNSIGNED NOT NULL, scheduleId VARCHAR(36) NOT NULL,
      PRIMARY KEY (spreadsheetId, sourceOrderId, slotNo), UNIQUE KEY uq_sales_sheet_schedule (scheduleId))""")


def item_for(cur, erp, item_name=""):
    candidates = []
    try:
        candidates += rows(cur, "SELECT id, itemName FROM npd WHERE TRIM(erp)=%s AND COALESCE(syncStatus,'active') <> 'removed' LIMIT 5", (erp,))
    except pymysql.MySQLError:
        pass
    try:
        candidates += rows(cur, "SELECT id, name FROM items WHERE TRIM(CAST(erp AS CHAR))=%s LIMIT 5", (erp,))
    except pymysql.MySQLError:
        pass
    if candidates:
        return candidates[0][0], False
    existing = one(cur, "SELECT id FROM items WHERE TRIM(CAST(erp AS CHAR))=%s LIMIT 1", (erp,))
    if existing:
        return existing[0], False
    group = one(cur, "SELECT groupId FROM items WHERE COALESCE(groupId,'')<>'' LIMIT 1")
    group_id = group[0] if group else "UNASSIGNED"
    fallback_id = str(uuid.uuid4())
    numeric_erp = int(erp) if erp.isdigit() and int(erp) <= 2147483647 else None
    cur.execute("""INSERT INTO items (id, groupId, name, uom, erp, itemType, typeName, updatedBy, updateTimestamp)
      VALUES (%s,%s,%s,'PCS',%s,'Others','REGULAR','BK Migration',NOW())""",
      (fallback_id, group_id, item_name or erp, numeric_erp))
    return fallback_id, True


def sync_one(cur, row, report):
    company = one(cur, "SELECT id, name FROM companies WHERE LOWER(TRIM(name))=LOWER(%s) LIMIT 1", (row["company"],))
    if not company:
        report["skipped"].append({"order": row["order"], "reason": "company not found"})
        return [], False
    item_id, fallback_item = item_for(cur, row["erp"], row["item_name"])
    if fallback_item:
        report["fallback_npd"].append(row["order"])
    link = one(cur, "SELECT orderId FROM sales_order_sheet_links WHERE spreadsheetId=%s AND sourceOrderId=%s FOR UPDATE", (SHEET_ID, row["order"]))
    order_uuid = link[0] if link else str(uuid.uuid4())
    if link and not one(cur, "SELECT id FROM orders WHERE id=%s FOR UPDATE", (order_uuid,)):
        cur.execute("DELETE FROM sales_order_sheet_links WHERE spreadsheetId=%s AND sourceOrderId=%s", (SHEET_ID, row["order"]))
        report["stale_order_links_repaired"].append(row["order"])
        link = None
        order_uuid = str(uuid.uuid4())
    payload = (UNIT_II_ID, UNIT_II_NAME, row["order"], row["order_date"], company[0], row["po"], row["erp"], item_id, "FG", item_id, row["qty"], row["rate"], row["qty"] * row["rate"])
    if link:
        cur.execute("""UPDATE orders SET firmId=%s, firmName=%s, orderNo=%s, orderDate=%s, companyId=%s,
          poNumber=%s, erpCode=%s, itemId=%s, itemSource=%s, npdId=%s, qty=%s, rate=%s, orderAmount=%s,
          status='Approved', approvedTimestamp=NOW(), approvedEmail='Salesman Migration',
          updatedBy='BK Migration', updateTimestamp=NOW() WHERE id=%s""", payload + (order_uuid,))
        report["orders_updated"].append(row["order"])
    else:
        cur.execute("""INSERT INTO orders (id, firmId, firmName, orderNo, orderDate, companyId, poNumber,
          erpCode, itemId, itemSource, npdId, qty, rate, orderAmount, status, approvedTimestamp,
          approvedEmail, updatedBy, updateTimestamp)
          VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'Approved',NOW(),'Salesman Migration','BK Migration',NOW())""", (order_uuid,) + payload)
        cur.execute("INSERT INTO sales_order_sheet_links VALUES (%s,%s,%s)", (SHEET_ID, row["order"], order_uuid))
        report["orders_created"].append(row["order"])
    schedule_ids = []
    for slot, schedule in enumerate(row["schedules"], 1):
        linked = one(cur, "SELECT scheduleId FROM sales_order_sheet_schedule_links WHERE spreadsheetId=%s AND sourceOrderId=%s AND slotNo=%s FOR UPDATE", (SHEET_ID, row["order"], slot))
        if linked and not one(cur, "SELECT id FROM orders_schedule WHERE id=%s FOR UPDATE", (linked[0],)):
            cur.execute("DELETE FROM sales_order_sheet_schedule_links WHERE spreadsheetId=%s AND sourceOrderId=%s AND slotNo=%s", (SHEET_ID, row["order"], slot))
            report["stale_schedule_links_repaired"].append(row["order"])
            linked = None
        schedule_uuid = linked[0] if linked else str(uuid.uuid4())
        if linked:
            cur.execute("UPDATE orders_schedule SET firmId=%s, firmName=%s, scheduledDate=%s, qty=%s, updatedBy='BK Migration', updateTimestamp=NOW() WHERE id=%s", (UNIT_II_ID, UNIT_II_NAME, schedule["date"], schedule["qty"], schedule_uuid))
            report["schedules_updated"].append(row["order"])
        else:
            cur.execute("""INSERT INTO orders_schedule (id, orderId, firmId, firmName, scheduledDate, qty, producedQty, canceledQty, updatedBy, updateTimestamp)
              VALUES (%s,%s,%s,%s,%s,%s,0,0,'BK Migration',NOW())""", (schedule_uuid, order_uuid, UNIT_II_ID, UNIT_II_NAME, schedule["date"], schedule["qty"]))
            cur.execute("INSERT INTO sales_order_sheet_schedule_links VALUES (%s,%s,%s,%s)", (SHEET_ID, row["order"], slot, schedule_uuid))
            report["schedules_created"].append(row["order"])
        report["schedule_report"].append({
            "order": row["order"],
            "source_new_order_master_date": schedule["date"],
            "schedule_id": str(schedule_uuid),
            "saved_scheduled_date": schedule["date"],
            "qty": str(schedule["qty"]),
        })
        schedule_ids.append(schedule_uuid)
    return schedule_ids, fallback_item


def create_jobs(cur, source, job_rows, fallback_orders, report):
    if not source or not job_rows:
        return
    source_by_order = {str(row["order"]): row for row in source}
    seen_schedules = set()
    for job in job_rows:
        order = str(job["order"])
        if job.get("cancelled"):
            report["cancelled_job_rows"].append({"order": order, "job": job["jobcard"]})
            continue
        if not order or not job["jobcard"]:
            report["skipped"].append({"order": order, "reason": "blank Order Id or Job Card No."})
            continue
        if not job["date"] or not job["erp"]:
            report["skipped"].append({"order": order, "job": job["jobcard"], "reason": "missing date or ERP Code"})
            continue
        source_row = source_by_order.get(order)
        if not source_row:
            report["skipped"].append({"order": order, "job": job["jobcard"], "reason": "Order Id not found in New Order Master"})
            continue
        source_schedule_dates = sorted({
            schedule["date"]
            for schedule in source_row["schedules"]
            if not schedule.get("erp") or schedule["erp"] == job["erp"]
        })
        if not source_schedule_dates:
            report["skipped"].append({
                "order": order,
                "job": job["jobcard"],
                "reason": "No New Order Master column-I schedule for ERP Code",
            })
            continue
        if job["date"] in source_schedule_dates:
            schedule_date = job["date"]
        elif len(source_schedule_dates) == 1:
            schedule_date = source_schedule_dates[0]
        else:
            report["ambiguous"].append({
                "order": order,
                "job": job["jobcard"],
                "reason": "Daily date does not identify one New Order Master schedule",
                "daily_date": job["date"],
                "source_schedule_dates": source_schedule_dates,
            })
            continue
        matches = rows(cur, """SELECT s.id, s.scheduledDate, s.qty, o.orderNo, o.itemId, o.npdId,
          o.erpCode, o.firmId, o.firmName, c.name FROM orders_schedule s JOIN orders o ON o.id=s.orderId
          JOIN companies c ON c.id=o.companyId WHERE o.orderNo=%s AND o.erpCode=%s
          AND LEFT(s.scheduledDate,10)=%s""", (order, job["erp"], schedule_date))
        if len(matches) != 1:
            report["ambiguous" if len(matches) > 1 else "skipped"].append({"order": order, "job": job["jobcard"], "reason": "ambiguous schedule" if len(matches) > 1 else "schedule not found", "matches": len(matches)})
            continue
        sid, scheduled, qty, order, item_id, npd_id, erp, firm_id, firm_name, company_name = matches[0]
        if sid in seen_schedules:
            continue
        seen_schedules.add(sid)
        active = one(cur, "SELECT id, status FROM productions WHERE scheduleId=%s AND (cancelTimestamp IS NULL OR TRIM(cancelTimestamp)='') AND status<>'Cancelled' LIMIT 1", (sid,))
        if active:
            if s(active[1]).lower() != "completed":
                cur.execute("""UPDATE productions SET jobCardNo=%s, scheduledDate=%s, date=%s, qty=%s,
                  requiredQty=%s, plannedQty=%s, orderFirmId=%s, updatedBy='BK Migration', updateTimestamp=NOW()
                  WHERE id=%s""", (job["jobcard"], str(scheduled)[:10], str(scheduled)[:10], qty, qty, qty, firm_id, active[0]))
            report["already_covered"].append(str(order))
            report["tracking"].append((str(order), job["jobcard"]))
            continue
        fallback = str(order) in fallback_orders or not (item_id or npd_id)
        txn = f"JOB/{datetime.now().year % 100:02d}-{(datetime.now().year + 1) % 100:02d}/{uuid.uuid4().hex[:8].upper()}"
        # The deployed productions schema has orderFirmId, but not the legacy
        # firmId/firmName columns. itemId is NOT NULL, so fallback jobs retain
        # their generated legacy item while leaving npdId unresolved.
        cur.execute("""INSERT INTO productions (id, transactionNo, jobCardNo, date, scheduleId, itemSource, itemId, npdId,
          qty, requiredQty, plannedQty, uom, status, companyName, orderFirmId, scheduledDate,
          jobType, erpCode, remarks, updatedBy, updateTimestamp)
          VALUES (%s,%s,%s,%s,%s,'FG',%s,%s,%s,%s,%s,'PCS','Pending Consumption',%s,%s,%s,'REGULAR',%s,%s,'BK Migration',NOW())""",
          (str(uuid.uuid4()), txn, job["jobcard"], str(scheduled)[:10], sid, item_id, None if fallback else npd_id,
           qty, qty, qty, company_name, firm_id, str(scheduled)[:10], erp,
           "Fallback job: NPD item not found" if fallback else "Created from BK scheduled order"))
        report["jobs_fallback" if fallback else "jobs_created"].append(str(order))
        report["tracking"].append((str(order), job["jobcard"]))


def read_tracking():
    values = sheets_values()
    existing = values.get(spreadsheetId=SHEET_ID, range="'DBMIGRATIONS'!A:D").execute().get("values", [])
    completed = set()
    for row in existing:
        if len(row) < 2:
            continue
        order = s(row[0])
        job = s(row[1])
        if not order or not job or order.lower() == "order id":
            continue
        status = s(row[2]).upper() if len(row) > 2 else "COMPLETED"
        if status in {"", "COMPLETED"}:
            completed.add((order, job))
    return completed


def write_tracking(pairs):
    pairs = {(s(order), s(job)) for order, job in pairs if s(order) and s(job)}
    if not pairs:
        return 0
    values = sheets_values(write=True)
    existing = values.get(spreadsheetId=SHEET_ID, range="'DBMIGRATIONS'!A:D").execute().get("values", [])
    known = set()
    for row in existing:
        if len(row) < 2:
            continue
        order = s(row[0])
        job = s(row[1])
        if not order or not job or order.lower() == "order id":
            continue
        status = s(row[2]).upper() if len(row) > 2 else "COMPLETED"
        if status in {"", "COMPLETED"}:
            known.add((order, job))
    has_header = bool(existing and s(existing[0][0]).lower() == "order id")
    if not existing or (has_header and len(existing[0]) < 4):
        values.update(
            spreadsheetId=SHEET_ID,
            range="'DBMIGRATIONS'!A1:D1",
            valueInputOption="USER_ENTERED",
            body={"majorDimension": "ROWS", "values": [["Order Id", "Job Card No.", "Status", "Completed At"]]},
        ).execute()
    new_rows = [[order, job, "COMPLETED", datetime.now().isoformat(timespec="seconds")] for order, job in sorted(pairs - known)]
    if new_rows:
        values.append(
            spreadsheetId=SHEET_ID,
            range="'DBMIGRATIONS'!A:D",
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body={"majorDimension": "ROWS", "values": new_rows},
        ).execute()
    return len(new_rows)


def merge_report(target, batch_report):
    for key, values in batch_report.items():
        target[key].extend(values)


def main():
    dry_run = os.getenv("DRY_RUN", "true").lower() not in {"0", "false", "no"}
    bk, source, job_rows = sheet_rows()
    completed = read_tracking()
    pending_jobs = [job for job in job_rows if (job["order"], job["jobcard"]) not in completed]
    pending_orders = {job["order"] for job in pending_jobs}
    pending_source = [row for row in source if row["order"] in pending_orders]

    report = defaultdict(list)
    report["eligible_bk_ids"] = len(bk)
    report["source_rows"] = len(source)
    report["completed_tracking_rows_skipped"] = len(job_rows) - len(pending_jobs)
    report["pending_rows"] = len(pending_jobs)
    print(
        f"Eligible BK orders: {len(bk)}; pending jobs: {len(pending_jobs)}; "
        f"already completed: {report['completed_tracking_rows_skipped']}",
        flush=True,
    )

    if dry_run:
        report["would_process_orders"] = [row["order"] for row in pending_source]
        report["would_create_jobs_for"] = [
            job["jobcard"] for job in pending_jobs if job["order"] and job["jobcard"]
        ]
        print(json.dumps({"dry_run": True, **report}, indent=2, default=str))
        return

    print("Connecting to ERP database...", flush=True)
    db = connect()
    cur = db.cursor()
    try:
        report["database"] = database_preflight(cur, enforce=True)
        ensure_links(cur)
        for batch_number, batch in enumerate(chunks(pending_source), 1):
            print(f"Processing batch {batch_number} ({len(batch)} orders)...", flush=True)
            batch_report = defaultdict(list)
            batch_orders = {row["order"] for row in batch}
            batch_jobs = [job for job in pending_jobs if job["order"] in batch_orders]
            fallback_orders = set()
            try:
                # Reconnect before every independent transaction.  This keeps
                # a server-side idle timeout or dropped connection from
                # invalidating the batches that follow it.
                try:
                    db.ping(reconnect=True)
                except (pymysql.MySQLError, OSError):
                    db, cur = reopen_connection(db, cur)
                db.begin()
                for row in batch:
                    _, fallback_item = sync_one(cur, row, batch_report)
                    if fallback_item:
                        fallback_orders.add(row["order"])
                create_jobs(cur, batch, batch_jobs, fallback_orders, batch_report)
                db.commit()
            except Exception as exc:
                safe_rollback(db)
                report["failed_batches"].append({
                    "batch": batch_number,
                    "orders": sorted(batch_orders),
                    "error": str(exc),
                })
                print(f"Batch {batch_number} rolled back: {exc}", flush=True)
                # If the failure was a lost connection, rollback itself may
                # be impossible. Reopen now so later batches can continue.
                try:
                    db.ping(reconnect=True)
                except (pymysql.MySQLError, OSError):
                    db, cur = reopen_connection(db, cur)
                continue

            merge_report(report, batch_report)
            report["batches_committed"] = report.get("batches_committed", 0) + 1
            try:
                report["tracking_written"] = report.get("tracking_written", 0) + write_tracking(batch_report.get("tracking", []))
            except Exception as exc:
                report["tracking_errors"].append({"batch": batch_number, "error": str(exc)})
                print(f"Batch {batch_number} committed, but tracking write failed: {exc}", flush=True)
        print(json.dumps({"dry_run": False, **report}, indent=2, default=str))
    except Exception:
        safe_rollback(db)
        raise
    finally:
        cur.close()
        db.close()


if __name__ == "__main__":
    try:
        configure_cli()
        print(f"Migration batch size: {BATCH_SIZE}", flush=True)
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        raise


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        raise


