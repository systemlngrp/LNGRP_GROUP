"""Import the first ten nonblank New Order Master rows as Unit-II orders."""
from __future__ import annotations

import re
import uuid
from datetime import datetime
from pathlib import Path

from migrate_daily_bk_orders_jobs import SHEET_ID, connect, credentials, load_runtime_env, sheets_values

START_ROW = 5516
SCAN_END_ROW = 5530
TARGET_COUNT = 10


def text(value):
    return "" if value is None else str(value).strip()


def date_value(value):
    raw = text(value)
    for fmt in ("%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError(f"Invalid date: {raw}")


def norm(value):
    return re.sub(r"\s+", " ", text(value)).strip().casefold()


def read_source():
    result = sheets_values().get(
        spreadsheetId=SHEET_ID,
        range=f"'New Order Master'!A{START_ROW}:I{SCAN_END_ROW}",
    ).execute()
    rows = []
    for offset, values in enumerate(result.get("values", [])):
        if len(values) < 9 or not text(values[0]):
            continue
        rows.append({
            "sourceRow": START_ROW + offset,
            "externalOrderId": text(values[0]),
            "orderDate": date_value(values[1]),
            "companyName": text(values[2]),
            "poNumber": text(values[3]),
            "erpCode": text(values[4]),
            "itemName": text(values[5]),
            "qty": float(text(values[6]).replace(",", "")),
            "rate": float(text(values[7]).replace(",", "")),
            "scheduledDate": date_value(values[8]),
        })
        if len(rows) == TARGET_COUNT:
            break
    if len(rows) != TARGET_COUNT:
        raise RuntimeError(f"Only found {len(rows)} nonblank source orders; expected {TARGET_COUNT}.")
    if len({row["externalOrderId"].casefold() for row in rows}) != len(rows):
        raise RuntimeError("Duplicate sheet Order Id found in the selected rows.")
    return rows


def main():
    load_runtime_env()
    rows = read_source()
    db = connect()
    try:
        cur = db.cursor()
        cur.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS externalOrderId VARCHAR(100) NULL")
        cur.execute("SELECT id, firmName, shortName FROM firms")
        firms = cur.fetchall()
        unit_two = next((row for row in firms if re.search(r"unit\s*[- ]?ii\b", text(row[1]), re.I)), None)
        if not unit_two:
            raise RuntimeError("Unit-II firm was not found.")
        firm_id, firm_name, short_name = unit_two
        firm_prefix = re.sub(r"^-+|-+$", "", re.sub(r"[^A-Z0-9-]+", "-", text(short_name or firm_name).upper())) or "LNGRP"

        ext_ids = [row["externalOrderId"] for row in rows]
        placeholders = ",".join(["%s"] * len(ext_ids))
        cur.execute(f"SELECT externalOrderId FROM orders WHERE LOWER(TRIM(externalOrderId)) IN ({placeholders})", [x.casefold() for x in ext_ids])
        existing_external = {text(row[0]).casefold() for row in cur.fetchall()}
        cur.execute(f"SELECT orderNo FROM orders WHERE orderNo LIKE %s", ("%/ORD/26-27/%",))
        used_numbers = {text(row[0]) for row in cur.fetchall()}
        cur.execute("SELECT COALESCE(lastValue, 0) FROM transaction_counters WHERE counterKey = %s LIMIT 1", (f"{firm_prefix}/ORD/26-27",))
        next_number = int(cur.fetchone()[0] or 0) + 1

        for row in rows:
            if row["externalOrderId"].casefold() in existing_external:
                raise RuntimeError(f"Sheet Order Id {row['externalOrderId']} already exists in orders.")
            company = None
            cur.execute("SELECT id, name FROM companies WHERE LOWER(TRIM(name)) = %s LIMIT 1", (norm(row["companyName"]),))
            company = cur.fetchone()
            if not company:
                raise RuntimeError(f"Company not found for source row {row['sourceRow']}: {row['companyName']}")
            cur.execute("SELECT id, erp FROM npd WHERE TRIM(erp) = %s LIMIT 1", (row["erpCode"],))
            item = cur.fetchone()
            if not item:
                raise RuntimeError(f"ERP item not found for source row {row['sourceRow']}: {row['erpCode']}")
            order_no = f"{firm_prefix}/ORD/26-27/{next_number}"
            while order_no in used_numbers:
                next_number += 1
                order_no = f"{firm_prefix}/ORD/26-27/{next_number}"
            used_numbers.add(order_no)
            row.update({"firmId": firm_id, "firmName": firm_name, "companyId": company[0], "itemId": item[0], "orderNo": order_no})
            next_number += 1

        db.begin()
        for row in rows:
            order_id = str(uuid.uuid4())
            now = datetime.now().isoformat(sep=" ")
            amount = round(row["qty"] * row["rate"], 2)
            cur.execute("SELECT scheduleNo FROM orders_schedule WHERE scheduleNo LIKE %s ORDER BY CAST(SUBSTRING_INDEX(scheduleNo,'/',-1) AS UNSIGNED) DESC LIMIT 1", ("SCH/26-27/%",))
            last_schedule = str((cur.fetchone() or [""])[0] or "")
            schedule_no = f"SCH/26-27/{(int(last_schedule.rsplit('/', 1)[-1]) + 1 if last_schedule else 1):05d}"
            cur.execute("""INSERT INTO orders
              (id, firmId, firmName, orderNo, externalOrderId, orderDate, companyId, poNumber,
               erpCode, itemId, itemSource, npdId, qty, rate, orderAmount, status,
               approvedTimestamp, approvedEmail, updatedBy, updateTimestamp)
              VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'FG',%s,%s,%s,%s,'Scheduled',%s,%s,%s,%s)""",
              (order_id, row["firmId"], row["firmName"], row["orderNo"], row["externalOrderId"], row["orderDate"], row["companyId"], row["poNumber"], row["erpCode"], row["itemId"], row["itemId"], row["qty"], row["rate"], amount, now, "Bulk New Order Import", "Bulk New Order Import", now))
            cur.execute("""INSERT INTO orders_schedule
              (id, orderId, firmId, firmName, scheduleNo, scheduledDate, qty, producedQty, canceledQty, updatedBy, updateTimestamp)
              VALUES (%s,%s,%s,%s,%s,%s,%s,0,0,%s,%s)""",
              (str(uuid.uuid4()), order_id, row["firmId"], row["firmName"], schedule_no, row["scheduledDate"], row["qty"], "Bulk New Order Import", now))
        cur.execute("INSERT INTO transaction_counters (counterKey, lastValue) VALUES (%s,%s) ON DUPLICATE KEY UPDATE lastValue=GREATEST(lastValue, VALUES(lastValue))", (f"{firm_prefix}/ORD/26-27", next_number - 1))
        db.commit()
        print(f"Imported {len(rows)} orders and schedules for {firm_name}.")
        for row in rows:
            print(f"row={row['sourceRow']} externalOrderId={row['externalOrderId']} orderNo={row['orderNo']} qty={row['qty']} scheduledDate={row['scheduledDate']}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
