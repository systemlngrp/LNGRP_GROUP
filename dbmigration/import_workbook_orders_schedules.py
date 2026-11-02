"""Import workbook Orders plus eligible schedules.

Dry-run by default. Orders with unresolved ERP mappings are held in the
workbook's Missing ERP sheet and are never inserted by this script.
"""
from __future__ import annotations

import argparse
import os
import re
import uuid
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import pymysql
from openpyxl import load_workbook

from migrate_daily_bk_orders_jobs import load_runtime_env

load_runtime_env()

WORKBOOK = Path(r"C:\Users\Admin\Downloads\LNGRP_Migration_Workbook_with_Missing_ERP.xlsx")
UNIT_II_ID = "334aa279-b7f3-450d-8b34-ee538a70e802"
UNIT_II_NAME = "Laxmi Narayan Corrugated Boards LLP (Unit-II)"
MANUAL_ERP = {
    "6262": "90740065",
    "7505": "94960090",
    "7952": "94960124",
    "7957": "94960124",
    "8027": "99970030",
    "9777": "91610001",
}


def text(value):
    return "" if value is None else str(value).strip()


def norm(value):
    return re.sub(r"\s+", " ", text(value)).casefold()


def date_value(value):
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d")
    raw = text(value)
    for fmt in ("%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return ""


def number(value):
    try:
        return float(text(value).replace(",", ""))
    except ValueError:
        return 0.0


def db_connect():
    return pymysql.connect(
        host=os.environ["DB_HOST"], port=int(os.getenv("DB_PORT", "3306")),
        user=os.environ["DB_USER"], password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"], charset="utf8mb4", autocommit=False,
    )


def read_workbook():
    wb = load_workbook(WORKBOOK, read_only=True, data_only=True)
    orders_sheet = wb["Orders"]
    jobs_sheet = wb["Jobs"]
    dispatch_sheet = wb["Dispatch"]

    def read(sheet):
        rows = sheet.iter_rows(values_only=True)
        headers = [text(x) for x in next(rows)]
        return headers, [dict(zip(headers, row)) for row in rows]

    _, order_rows = read(orders_sheet)
    _, job_rows = read(jobs_sheet)
    _, dispatch_rows = read(dispatch_sheet)

    jobs_by_order = defaultdict(list)
    for row in job_rows:
        order = text(row.get("Order Id"))
        dt = date_value(row.get("Job Date"))
        if order and dt:
            jobs_by_order[order].append(dt)
    dispatch_by_order = defaultdict(list)
    for row in dispatch_rows:
        order = text(row.get("Order Id"))
        dt = date_value(row.get("Dispatch Date"))
        if order and dt:
            dispatch_by_order[order].append(dt)

    out = []
    for source_row, row in enumerate(order_rows, start=2):
        external = text(row.get("Order Id"))
        if not external:
            continue
        erp = text(row.get("ERP Code")) or MANUAL_ERP.get(external, "")
        out.append({
            "source_row": source_row, "external": external,
            "order_date": date_value(row.get("Order Date")),
            "company": text(row.get("Company Name")),
            "po": text(row.get("PO Number")), "erp": erp,
            "item": text(row.get("Item")), "qty": number(row.get("Qty")),
            "rate": number(row.get("Rate")),
            "jobs": sorted(jobs_by_order.get(external, [])),
            "dispatch": sorted(dispatch_by_order.get(external, [])),
        })
    return out


def financial_year(order_date):
    return "26-27" if order_date >= "2026-04-01" else "25-26"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--start-batch", type=int, default=1)
    parser.add_argument("--max-batches", type=int)
    args = parser.parse_args()
    if args.batch_size <= 0:
        raise SystemExit("--batch-size must be positive")

    source = read_workbook()
    held = {"7623", "7925", "10340"}
    source = [row for row in source if row["external"] not in held]
    scheduled = [row for row in source if row["jobs"] or row["dispatch"]]
    batches = [source[i:i + args.batch_size] for i in range(0, len(source), args.batch_size)]
    selected = batches[args.start_batch - 1:]
    if args.max_batches:
        selected = selected[:args.max_batches]

    db = db_connect()
    try:
        cur = db.cursor()
        cur.execute("SELECT id, name FROM companies")
        companies = {norm(name): company_id for company_id, name in cur.fetchall()}
        companies[norm("ITC  (INTEGRATED FOODS)")] = companies.get(norm("ITC LIMITED FOODS DIVISION - (INTEGRATED FOODS)"), companies.get(norm("ITC (INTEGRATED FOODS)")))
        companies[norm("M/S PAWAN INDUSTRIES, JAGDISH PRASAD")] = companies.get(norm("M/S PAWAN INDUSTRIES"))
        cur.execute("SELECT id, erp, itemName FROM npd WHERE LOWER(COALESCE(syncStatus,''))='active'")
        items = {text(erp): (item_id, text(name)) for item_id, erp, name in cur.fetchall() if text(erp)}
        # Legacy FG masters are stored in `items`; use them when the ERP is
        # absent from active NPD, without changing either master table.
        cur.execute("SELECT id, erp, name FROM items WHERE COALESCE(TRIM(erp),'')<>''")
        for item_id, erp, name in cur.fetchall():
            items.setdefault(text(erp), (item_id, text(name)))
        cur.execute("SELECT externalOrderId FROM orders")
        existing = {text(x[0]) for x in cur.fetchall()}

        invalid = []
        pending = []
        for row in source:
            if row["external"] in existing:
                continue
            if row["external"] in held:
                continue
            if not row["erp"] or row["erp"] not in items:
                invalid.append((row, "ERP not found in active NPD"))
            elif norm(row["company"]) not in companies:
                invalid.append((row, "company not found"))
            else:
                pending.append(row)

        print(f"Workbook orders scanned: {len(source) + len(held)}")
        print(f"Held Missing ERP orders: {len(held)} ({', '.join(sorted(held))})")
        print(f"Orders with Jobs or Dispatch: {len(scheduled)}")
        print(f"Orders eligible for import: {len(pending)}")
        print(f"Schedules to create: {len([row for row in pending if row['jobs'] or row['dispatch']])}")
        print(f"Batches selected: {len(selected)}; batch size: {args.batch_size}")
        if invalid:
            for row, reason in invalid[:20]:
                print(f"INVALID sourceRow={row['source_row']} orderId={row['external']} reason={reason}")
            raise SystemExit(f"Validation failed for {len(invalid)} rows")
        if not args.apply:
            print("DRY RUN: no database changes committed.")
            return

        for batch_number, batch in enumerate(selected, start=args.start_batch):
            db.begin()
            try:
                created_orders = 0
                created_schedules = 0
                for row in batch:
                    if row["external"] in existing:
                        continue
                    company_id = companies[norm(row["company"])]
                    item_id = items[row["erp"]][0]
                    fy = financial_year(row["order_date"])
                    order_id = str(uuid.uuid4())
                    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    order_no = f"LNCB-2/ORD/{fy}/{row['external']}"
                    amount = row["qty"] * row["rate"]
                    cur.execute("""INSERT INTO orders
                      (id, firmId, firmName, orderNo, externalOrderId, orderDate,
                       companyId, poNumber, erpCode, itemId, itemSource, npdId,
                       qty, rate, orderAmount, status, approvedTimestamp,
                       approvedEmail, updatedBy, updateTimestamp)
                      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'FG',%s,%s,%s,%s,
                              'Scheduled',%s,%s,%s,%s)""",
                        (order_id, UNIT_II_ID, UNIT_II_NAME, order_no, row["external"],
                         row["order_date"], company_id, row["po"], row["erp"], item_id,
                         item_id, row["qty"], row["rate"], amount, now,
                         "Workbook Order Import", "Workbook Order Import", now))
                    if row["jobs"] or row["dispatch"]:
                        schedule_date = min(row["jobs"] or row["dispatch"])
                        schedule_no = f"SCH/{fy}/{row['external']}"
                        cur.execute("""INSERT INTO orders_schedule
                          (id, orderId, firmId, firmName, scheduleNo, scheduledDate,
                           qty, producedQty, canceledQty, updatedBy, updateTimestamp)
                          VALUES (%s,%s,%s,%s,%s,%s,%s,0,0,%s,%s)""",
                            (str(uuid.uuid4()), order_id, UNIT_II_ID, UNIT_II_NAME,
                             schedule_no, schedule_date, row["qty"],
                             "Workbook Schedule Import", now))
                        created_schedules += 1
                    existing.add(row["external"])
                    created_orders += 1
                db.commit()
                print(f"Batch {batch_number} committed: orders={created_orders}, schedules={created_schedules}", flush=True)
            except Exception:
                db.rollback()
                raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
