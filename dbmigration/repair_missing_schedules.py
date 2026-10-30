"""Backfill missing schedules for existing database orders.

This migration is intentionally schedule-only.  It reads every row from
New Order Master, matches existing orders by Order Id + ERP Code, and creates
or updates schedules without creating or changing orders or production jobs.
Dry-run is the default; --apply commits one transaction.
"""
from __future__ import annotations

import argparse
import json
import sys
import uuid
from collections import defaultdict
from decimal import Decimal

import pymysql

from migrate_daily_bk_orders_jobs import (
    SHEET_ID,
    UNIT_II_ID,
    UNIT_II_NAME,
    connect,
    dec,
    database_preflight,
    one,
    rows,
    s,
    sheets_values,
    ymd,
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Backfill schedules for existing orders from New Order Master"
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Commit database changes; default is dry-run",
    )
    return parser.parse_args()


def source_rows():
    response = sheets_values().batchGet(
        spreadsheetId=SHEET_ID,
        ranges=["'New Order Master'!A:ZZ"],
    ).execute()
    value_ranges = response.get("valueRanges", [])
    raw = value_ranges[0].get("values", []) if value_ranges else []
    if not raw:
        raise RuntimeError("New Order Master is empty")

    headers = [s(value).rstrip() for value in raw[0]]
    required = {"Order Id", "ERP Code", "Qty", "Scheduled Date"}
    missing = sorted(required - set(headers))
    if missing:
        raise RuntimeError("Missing columns in New Order Master: " + ", ".join(missing))

    index = {header: position for position, header in enumerate(headers)}
    grouped = defaultdict(lambda: Decimal("0"))
    report = {
        "source_rows_scanned": 0,
        "invalid_rows": [],
        "blank_order_ids": [],
    }

    for row_number, values in enumerate(raw[1:], 2):
        report["source_rows_scanned"] += 1
        order = s(values[index["Order Id"]]) if index["Order Id"] < len(values) else ""
        erp = s(values[index["ERP Code"]]) if index["ERP Code"] < len(values) else ""
        qty_value = values[index["Qty"]] if index["Qty"] < len(values) else ""
        date_value = values[index["Scheduled Date"]] if index["Scheduled Date"] < len(values) else ""
        scheduled_date = ymd(date_value)
        quantity = dec(qty_value)

        if not order:
            report["blank_order_ids"].append({"row": row_number})
            continue
        if not erp or not scheduled_date or quantity <= 0:
            report["invalid_rows"].append({
                "row": row_number,
                "order": order,
                "erp": erp,
                "scheduled_date": scheduled_date,
                "qty": str(quantity),
                "reason": "missing ERP, invalid date, or non-positive quantity",
            })
            continue

        grouped[(order, erp, scheduled_date)] += quantity

    return grouped, report


def load_orders(cur):
    result = defaultdict(list)
    for order_id, order_no, erp_code in rows(
        cur,
        "SELECT id, orderNo, erpCode FROM orders ORDER BY orderNo, id",
    ):
        result[(s(order_no), s(erp_code))].append({
            "id": order_id,
            "order": s(order_no),
            "erp": s(erp_code),
        })
    return result


def load_schedules(cur):
    result = defaultdict(list)
    for schedule_id, order_id, scheduled_date, quantity, produced, cancelled in rows(
        cur,
        """
        SELECT id, orderId, scheduledDate, qty, producedQty, canceledQty
        FROM orders_schedule
        ORDER BY orderId, scheduledDate, id
        """,
    ):
        result[(order_id, str(scheduled_date)[:10])].append({
            "id": schedule_id,
            "date": str(scheduled_date)[:10],
            "qty": dec(quantity),
            "produced": dec(produced),
            "cancelled": dec(cancelled),
        })
    return result


def main():
    args = parse_args()
    grouped, report = source_rows()
    report.update({
        "dry_run": not args.apply,
        "database_orders_scanned": 0,
        "source_matches": 0,
        "schedules_created": [],
        "schedules_updated": [],
        "schedules_already_present": [],
        "missing_source_orders": [],
        "unmatched_order_ids": [],
        "ambiguous_matches": [],
        "orphan_schedules": None,
        "orders_before": None,
        "orders_after": None,
        "schedules_before": None,
        "schedules_after": None,
    })

    db = connect()
    cur = db.cursor()
    try:
        identity = database_preflight(cur, enforce=True)
        report["database"] = identity
        report["database_orders_scanned"] = identity["orders"]
        report["orders_before"] = identity["orders"]
        report["schedules_before"] = identity["schedules"]
        orders = load_orders(cur)
        schedules = load_schedules(cur)
        source_order_keys = {(order, erp) for order, erp, _date in grouped}
        for order_key, matches in sorted(orders.items()):
            if order_key not in source_order_keys:
                report["missing_source_orders"].append({
                    "order": order_key[0],
                    "erp": order_key[1],
                    "database_order_ids": [str(item["id"]) for item in matches],
                })

        if args.apply:
            db.begin()

        for key, quantity in sorted(grouped.items()):
            order_no, erp, scheduled_date = key
            matches = orders.get((order_no, erp), [])
            if not matches:
                report["unmatched_order_ids"].append({
                    "order": order_no,
                    "erp": erp,
                    "scheduled_date": scheduled_date,
                    "qty": str(quantity),
                })
                continue
            if len(matches) > 1:
                report["ambiguous_matches"].append({
                    "order": order_no,
                    "erp": erp,
                    "scheduled_date": scheduled_date,
                    "database_order_ids": [str(item["id"]) for item in matches],
                })
                continue

            report["source_matches"] += 1
            order_id = matches[0]["id"]
            candidates = schedules.get((order_id, scheduled_date), [])
            if not candidates:
                schedule_id = str(uuid.uuid4())
                entry = {
                    "order": order_no,
                    "erp": erp,
                    "order_id": str(order_id),
                    "schedule_id": schedule_id,
                    "scheduled_date": scheduled_date,
                    "qty": str(quantity),
                }
                report["schedules_created"].append(entry)
                if args.apply:
                    cur.execute(
                        """
                        INSERT INTO orders_schedule
                          (id, orderId, firmId, firmName, scheduledDate, qty,
                           producedQty, canceledQty, updatedBy, updateTimestamp)
                        VALUES (%s,%s,%s,%s,%s,%s,0,0,'Schedule Repair',NOW())
                        """,
                        (schedule_id, order_id, UNIT_II_ID, UNIT_II_NAME,
                         scheduled_date, quantity),
                    )
                    schedules[(order_id, scheduled_date)].append({
                        "id": schedule_id,
                        "date": scheduled_date,
                        "qty": quantity,
                        "produced": Decimal("0"),
                        "cancelled": Decimal("0"),
                    })
                continue

            if len(candidates) == 1:
                candidate = candidates[0]
            else:
                exact = [item for item in candidates if item["qty"] == quantity]
                if len(exact) != 1:
                    report["ambiguous_matches"].append({
                        "order": order_no,
                        "erp": erp,
                        "scheduled_date": scheduled_date,
                        "candidate_schedule_ids": [str(item["id"]) for item in candidates],
                        "reason": "multiple schedules; quantity did not identify one",
                    })
                    continue
                candidate = exact[0]

            if candidate["qty"] == quantity:
                report["schedules_already_present"].append({
                    "order": order_no,
                    "erp": erp,
                    "schedule_id": str(candidate["id"]),
                    "scheduled_date": scheduled_date,
                    "qty": str(quantity),
                })
            else:
                entry = {
                    "order": order_no,
                    "erp": erp,
                    "order_id": str(order_id),
                    "schedule_id": str(candidate["id"]),
                    "scheduled_date": scheduled_date,
                    "old_qty": str(candidate["qty"]),
                    "qty": str(quantity),
                    "produced_qty_unchanged": str(candidate["produced"]),
                    "canceled_qty_unchanged": str(candidate["cancelled"]),
                }
                report["schedules_updated"].append(entry)
                if args.apply:
                    cur.execute(
                        """
                        UPDATE orders_schedule
                        SET qty=%s, updatedBy='Schedule Repair', updateTimestamp=NOW()
                        WHERE id=%s
                        """,
                        (quantity, candidate["id"]),
                    )

        if args.apply:
            db.commit()

        cur.execute("SELECT COUNT(*) FROM orders")
        report["orders_after"] = int(cur.fetchone()[0])
        cur.execute("SELECT COUNT(*) FROM orders_schedule")
        report["schedules_after"] = int(cur.fetchone()[0])
        report["orphan_schedules"] = int(one(
            cur,
            """
            SELECT COUNT(*)
            FROM orders_schedule s
            LEFT JOIN orders o ON o.id=s.orderId
            WHERE o.id IS NULL
            """,
        )[0])
        report["order_count_unchanged"] = report["orders_before"] == report["orders_after"]
        report["schedule_count_delta"] = report["schedules_after"] - report["schedules_before"]
        print(json.dumps(report, indent=2, default=str))
    except Exception:
        if args.apply:
            try:
                db.rollback()
            except Exception:
                pass
        raise
    finally:
        cur.close()
        db.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        raise
