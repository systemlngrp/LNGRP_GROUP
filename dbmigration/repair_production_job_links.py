"""Repair production-job -> schedule -> order links.

This is intentionally separate from the normal BK migration.  It never creates
orders or jobs; it only repairs production rows whose schedule link is missing
or no longer points to a valid order.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime

from migrate_daily_bk_orders_jobs import (
    BATCH_SIZE,
    SHEET_ID,
    UNIT_II_ID,
    UNIT_II_NAME,
    chunks,
    connect,
    database_preflight,
    dec,
    ensure_links,
    one,
    rows,
    s,
    safe_rollback,
    reopen_connection,
    sheet_rows,
    sheets_values,
)


def parse_args():
    parser = argparse.ArgumentParser(description="Repair existing production job schedule links")
    parser.add_argument("--apply", action="store_true", help="Commit repairs; default is dry-run")
    return parser.parse_args()


def load_productions(cur):
    return rows(cur, """
        SELECT id, scheduleId, jobCardNo, erpCode, qty, requiredQty, plannedQty,
               orderFirmId, date, scheduledDate, status
        FROM productions
        ORDER BY id
    """)


def production_dict(row):
    keys = (
        "id", "schedule_id", "job_card", "erp", "qty", "required_qty",
        "planned_qty", "firm_id", "daily_date", "scheduled_date", "status",
    )
    return dict(zip(keys, row))


def report_entry(job, status, **extra):
    result = {
        "job_id": s(job.get("id")),
        "job_card_no": s(job.get("job_card")),
        "order_id": extra.pop("order_id", ""),
        "order_database_id": extra.pop("order_database_id", ""),
        "schedule_id": extra.pop("schedule_id", ""),
        "source_column_i_date": extra.pop("source_column_i_date", ""),
        "saved_schedule_date": extra.pop("saved_schedule_date", ""),
        "status": status,
    }
    result.update(extra)
    return result


def add_sheet_status(report, entry, status):
    report["sheet_tracking"].append({
        "order": s(entry.get("order_id")),
        "job": s(entry.get("job_card_no")),
        "status": status,
    })


def daily_candidates(job, daily_by_job):
    candidates = daily_by_job.get(s(job.get("job_card")), [])
    # Multiple Daily rows for the same card are safe only when they describe
    # the same order, ERP, and date.
    unique = {(s(x.get("order")), s(x.get("erp")), s(x.get("date"))) for x in candidates}
    return [dict(order=o, erp=e, date=d) for o, e, d in sorted(unique)]


def choose_schedule_source(job, source_by_order, daily_by_job):
    candidates = daily_candidates(job, daily_by_job)
    if not candidates:
        return None, "Job Card No. is not mapped in Daily Production Master", []
    if len(candidates) > 1:
        return None, "Job Card No. maps to multiple Daily Production rows", candidates

    daily = candidates[0]
    source = source_by_order.get(daily["order"])
    if not source:
        return None, "Order Id is not present in eligible New Order Master rows", []

    erp = daily["erp"] or s(job.get("erp"))
    schedules = [x for x in source.get("schedules", []) if not x.get("erp") or x.get("erp") == erp]
    dates = sorted({s(x.get("date")) for x in schedules if s(x.get("date"))})
    if not dates:
        return None, "No New Order Master column-I schedule for ERP Code", []
    if daily["date"] in dates:
        chosen = daily["date"]
    elif len(dates) == 1:
        chosen = dates[0]
    else:
        return None, "Multiple New Order Master column-I dates are ambiguous", dates

    selected = [x for x in schedules if s(x.get("date")) == chosen]
    quantity = sum((dec(x.get("qty")) for x in selected), dec(0))
    if quantity <= 0:
        quantity = dec(job.get("qty"))
    return {
        "order": daily["order"],
        "erp": erp,
        "daily_date": daily["date"],
        "date": chosen,
        "qty": quantity,
    }, "", []


def repair_one(cur, job, source_by_order, daily_by_job, report, apply):
    schedule_id = s(job.get("schedule_id"))
    if schedule_id:
        linked = one(cur, """
            SELECT s.id, s.orderId, o.orderNo, o.erpCode, s.scheduledDate
            FROM orders_schedule s
            JOIN orders o ON o.id = s.orderId
            WHERE s.id = %s
        """, (schedule_id,))
        if linked:
            entry = report_entry(
                job, "already_linked", order_id=linked[2], order_database_id=linked[1],
                schedule_id=linked[0], saved_schedule_date=str(linked[4])[:10],
            )
            report["already_linked"].append(entry)
            add_sheet_status(report, entry, "ALREADY_LINKED")
            return

    if s(job.get("status")).lower() == "cancelled":
        entry = report_entry(job, "skipped", reason="production job is Cancelled")
        report["skipped"].append(entry)
        add_sheet_status(report, entry, "SKIPPED: production job is Cancelled")
        return

    chosen, reason, candidates = choose_schedule_source(job, source_by_order, daily_by_job)
    if not chosen:
        entry = report_entry(job, "skipped", reason=reason, candidates=candidates)
        report["skipped"].append(entry)
        add_sheet_status(report, entry, f"SKIPPED: {reason}")
        return

    order_matches = rows(cur, """
        SELECT id, firmId, firmName, companyId
        FROM orders
        WHERE orderNo = %s AND erpCode = %s
    """, (chosen["order"], chosen["erp"]))
    if len(order_matches) != 1:
        reason = "Order database row is missing" if not order_matches else "Multiple order database rows match"
        entry = report_entry(
            job, "skipped", order_id=chosen["order"], reason=reason,
            matches=len(order_matches), source_column_i_date=chosen["date"],
        )
        report["skipped"].append(entry)
        add_sheet_status(report, entry, f"SKIPPED: {reason}")
        return

    order_db_id, firm_id, firm_name, _company_id = order_matches[0]
    firm_id = firm_id or UNIT_II_ID
    firm_name = firm_name or UNIT_II_NAME
    existing = rows(cur, """
        SELECT id, scheduledDate, qty
        FROM orders_schedule
        WHERE orderId = %s AND LEFT(scheduledDate, 10) = %s
        ORDER BY id
    """, (order_db_id, chosen["date"]))
    if len(existing) == 1:
        repaired_schedule_id, saved_date, _saved_qty = existing[0]
    elif len(existing) > 1:
        exact_qty = [x for x in existing if dec(x[2]) == chosen["qty"]]
        if len(exact_qty) != 1:
            entry = report_entry(
                job, "skipped", order_id=chosen["order"], order_database_id=order_db_id,
                source_column_i_date=chosen["date"], reason="Multiple matching schedules are ambiguous",
                candidate_schedule_ids=[str(x[0]) for x in existing],
            )
            report["skipped"].append(entry)
            add_sheet_status(report, entry, "SKIPPED: Multiple matching schedules are ambiguous")
            return
        repaired_schedule_id, saved_date, _saved_qty = exact_qty[0]
    else:
        repaired_schedule_id = str(__import__("uuid").uuid4())
        saved_date = chosen["date"]
        if apply:
            cur.execute("""
                INSERT INTO orders_schedule
                  (id, orderId, firmId, firmName, scheduledDate, qty, producedQty,
                   canceledQty, updatedBy, updateTimestamp)
                VALUES (%s,%s,%s,%s,%s,%s,0,0,'BK Repair',NOW())
            """, (repaired_schedule_id, order_db_id, firm_id, firm_name,
                  chosen["date"], chosen["qty"]))

    result = report_entry(
        job, "repaired" if apply else "would_repair", order_id=chosen["order"],
        order_database_id=order_db_id, schedule_id=repaired_schedule_id,
        source_column_i_date=chosen["date"], saved_schedule_date=str(saved_date)[:10],
        quantity=str(chosen["qty"]),
    )
    add_sheet_status(report, result, "REPAIRED")
    if apply:
        cur.execute("""
            UPDATE productions
            SET scheduleId=%s, updatedBy='BK Repair', updateTimestamp=NOW()
            WHERE id=%s
        """, (repaired_schedule_id, job["id"]))
        cur.execute("""
            INSERT INTO production_schedule_repair_links
              (productionId, scheduleId, sourceOrderId, jobCardNo, updatedAt)
            VALUES (%s,%s,%s,%s,NOW())
            ON DUPLICATE KEY UPDATE
              scheduleId=VALUES(scheduleId), sourceOrderId=VALUES(sourceOrderId),
              jobCardNo=VALUES(jobCardNo), updatedAt=NOW()
        """, (job["id"], repaired_schedule_id, chosen["order"], job["job_card"]))
        report["tracking"].append((chosen["order"], job["job_card"]))
    report["repaired"].append(result)


def run_repair(apply):
    # Repair uses the complete Daily Production Master reference, not the
    # normal migration's date/cancellation eligibility filter.
    _bk, source, daily_jobs = sheet_rows(include_all_daily=True)
    source_by_order = {s(x["order"]): x for x in source}
    daily_by_job = defaultdict(list)
    for row in daily_jobs:
        daily_by_job[s(row.get("jobcard"))].append(row)

    db = connect()
    cur = db.cursor()
    report = defaultdict(list)
    try:
        report["database"] = database_preflight(cur, enforce=True)
        if apply:
            # Create the repair metadata table before the first transaction;
            # MySQL DDL can implicitly commit an open transaction.
            ensure_links(cur)
        jobs = [production_dict(row) for row in load_productions(cur)]
        report["jobs_scanned"] = len(jobs)
        for batch_no, batch in enumerate(chunks(jobs), 1):
            print(f"Repair batch {batch_no} ({len(batch)} jobs)...", flush=True)
            batch_report = defaultdict(list)
            try:
                try:
                    db.ping(reconnect=True)
                except Exception:
                    db, cur = reopen_connection(db, cur)
                if apply:
                    db.begin()
                for job in batch:
                    repair_one(cur, job, source_by_order, daily_by_job, batch_report, apply)
                if apply:
                    db.commit()
            except Exception as exc:
                if apply:
                    safe_rollback(db)
                report["failed_batches"].append({"batch": batch_no, "error": str(exc)})
                print(f"Repair batch {batch_no} rolled back: {exc}", flush=True)
                try:
                    db.ping(reconnect=True)
                except Exception:
                    db, cur = reopen_connection(db, cur)
                continue
            merge_report(report, batch_report)
            report["batches_committed"] = report.get("batches_committed", 0) + 1
            if apply:
                try:
                    report["repair_status_written"] = report.get("repair_status_written", 0) + write_repair_status(batch_report.get("sheet_tracking", []))
                except Exception as exc:
                    report["tracking_errors"].append({"batch": batch_no, "error": str(exc)})
        print(json.dumps({"dry_run": not apply, **report}, indent=2, default=str))
    finally:
        cur.close()
        db.close()


def write_repair_status(records):
    """Update DBMIGRATIONS column E without duplicating A/B job rows."""
    status_by_job = {}
    for record in records:
        order = s(record.get("order"))
        job = s(record.get("job"))
        if job:
            status_by_job[(order, job)] = s(record.get("status"))
    if not status_by_job:
        return 0

    values = sheets_values(write=True)
    existing = values.get(
        spreadsheetId=SHEET_ID,
        range="'DBMIGRATIONS'!A:E",
    ).execute().get("values", [])

    header = ["Order Id", "Job Card No.", "Status", "Completed At", "Repair Status"]
    existing_by_job = {}
    for row_number, row in enumerate(existing, 1):
        if row and s(row[0]).lower() == "order id":
            continue
        if len(row) >= 2 and s(row[1]):
            existing_by_job[(s(row[0]), s(row[1]))] = row_number

    updates = []
    new_rows = []
    timestamp = datetime.now().isoformat(timespec="seconds")
    for key, repair_status in sorted(status_by_job.items()):
        row_number = existing_by_job.get(key)
        if row_number:
            updates.append({
                "range": f"'DBMIGRATIONS'!E{row_number}",
                "values": [[repair_status]],
            })
        else:
            base_status = "REPAIR_SKIPPED" if repair_status.startswith("SKIPPED:") else "COMPLETED"
            new_rows.append([key[0], key[1], base_status, timestamp, repair_status])

    if existing and s(existing[0][0]).lower() == "order id":
        if len(existing[0]) < 5 or s(existing[0][4]) != "Repair Status":
            updates.append({"range": "'DBMIGRATIONS'!E1", "values": [["Repair Status"]]})
    elif not existing:
        new_rows.insert(0, header)
    else:
        updates.append({"range": "'DBMIGRATIONS'!E1", "values": [["Repair Status"]]})

    if updates:
        values.batchUpdate(
            spreadsheetId=SHEET_ID,
            body={"valueInputOption": "USER_ENTERED", "data": updates},
        ).execute()
    if new_rows:
        values.append(
            spreadsheetId=SHEET_ID,
            range="'DBMIGRATIONS'!A:E",
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body={"majorDimension": "ROWS", "values": new_rows},
        ).execute()
    return len(updates) + len(new_rows)


def merge_report(target, batch_report):
    for key, values in batch_report.items():
        target[key].extend(values)


if __name__ == "__main__":
    args = parse_args()
    os.environ["DRY_RUN"] = "false" if args.apply else "true"
    print(f"Repair batch size: {BATCH_SIZE}", flush=True)
    try:
        run_repair(args.apply)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        raise
