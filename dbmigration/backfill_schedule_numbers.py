"""Backfill blank orders_schedule.scheduleNo values.

Only scheduleNo is changed.  Dry-run is the default; --apply commits one
transaction and is safe to rerun because existing schedule numbers are never
overwritten.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import date, datetime

from migrate_daily_bk_orders_jobs import connect


NUMBER_RE = re.compile(r"^SCH/(\d{2}-\d{2})/(\d{5})$")


def financial_year(value: object) -> str:
    raw = str(value or "")[:10]
    try:
        parsed = datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        return ""
    if parsed.month >= 4:
        return f"{str(parsed.year)[-2:]}-{str(parsed.year + 1)[-2:]}"
    return f"{str(parsed.year - 1)[-2:]}-{str(parsed.year)[-2:]}"


def parse_args():
    parser = argparse.ArgumentParser(description="Backfill ERP schedule numbers")
    parser.add_argument("--apply", action="store_true", help="Commit updates; default is dry-run")
    return parser.parse_args()


def main():
    args = parse_args()
    db = connect()
    cur = db.cursor()
    try:
        cur.execute("SELECT COUNT(*) FROM orders_schedule")
        schedule_count_before = int(cur.fetchone()[0])
        cur.execute("""
            SELECT id, scheduledDate, scheduleNo
            FROM orders_schedule
            ORDER BY scheduledDate ASC, id ASC
        """)
        rows = cur.fetchall()

        used = defaultdict(set)
        next_number = defaultdict(int)
        for _schedule_id, _scheduled_date, schedule_no in rows:
            match = NUMBER_RE.fullmatch(str(schedule_no or "").strip())
            if not match:
                continue
            fy, serial = match.groups()
            number = int(serial)
            used[fy].add(number)
            next_number[fy] = max(next_number[fy], number)

        updates = []
        skipped = []
        for schedule_id, scheduled_date, schedule_no in rows:
            if str(schedule_no or "").strip():
                continue
            fy = financial_year(scheduled_date)
            if not fy:
                skipped.append({
                    "schedule_id": str(schedule_id),
                    "scheduled_date": str(scheduled_date or ""),
                    "reason": "invalid scheduledDate",
                })
                continue
            candidate = next_number[fy] + 1
            while candidate in used[fy]:
                candidate += 1
            used[fy].add(candidate)
            next_number[fy] = candidate
            updates.append({
                "schedule_id": str(schedule_id),
                "scheduled_date": str(scheduled_date)[:10],
                "schedule_no": f"SCH/{fy}/{candidate:05d}",
            })

        applied_updates = 0
        if args.apply and updates:
            # Stage the mapping once, then update all schedules in one SQL
            # statement. This keeps the required single transaction while
            # avoiding thousands of client/server round trips.
            cur.execute("""
                CREATE TEMPORARY TABLE schedule_no_backfill (
                    schedule_id VARCHAR(36) NOT NULL PRIMARY KEY,
                    schedule_no VARCHAR(50) NOT NULL
                )
            """)
            db.begin()
            cur.executemany(
                "INSERT INTO schedule_no_backfill (schedule_id, schedule_no) VALUES (%s, %s)",
                [(item["schedule_id"], item["schedule_no"]) for item in updates],
            )
            cur.execute("""
                UPDATE orders_schedule os
                INNER JOIN schedule_no_backfill b ON b.schedule_id=os.id
                SET os.scheduleNo=b.schedule_no
                WHERE COALESCE(TRIM(os.scheduleNo), '')=''
            """)
            applied_updates = int(cur.rowcount)
            db.commit()

        cur.execute("SELECT COUNT(*) FROM orders_schedule")
        schedule_count_after = int(cur.fetchone()[0])
        cur.execute("SELECT COUNT(*) FROM orders_schedule WHERE COALESCE(TRIM(scheduleNo), '')=''")
        blank_after = int(cur.fetchone()[0])
        cur.execute("""
            SELECT scheduleNo, COUNT(*) AS count
            FROM orders_schedule
            WHERE COALESCE(TRIM(scheduleNo), '')<>''
            GROUP BY scheduleNo
            HAVING COUNT(*) > 1
            ORDER BY count DESC, scheduleNo
        """)
        duplicate_numbers = [
            {"schedule_no": str(schedule_no), "count": int(count)}
            for schedule_no, count in cur.fetchall()
        ]

        result = {
            "dry_run": not args.apply,
            "schedules_before": schedule_count_before,
            "schedules_after": schedule_count_after,
            "blank_before": len(updates) + len(skipped),
            "planned_updates": len(updates),
            "applied_updates": applied_updates,
            "skipped": skipped,
            "blank_after": blank_after if args.apply else len(updates) + len(skipped),
            "duplicate_numbers": duplicate_numbers,
            "schedule_count_unchanged": schedule_count_before == schedule_count_after,
        }
        print(json.dumps(result, indent=2, default=str))
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
