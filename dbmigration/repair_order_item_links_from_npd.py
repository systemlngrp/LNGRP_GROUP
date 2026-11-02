"""Repair FG order item links using the NPD ERP catalog.

Dry-run by default. Only orders.itemId and orders.npdId are changed, and only
when an exact ERP match exists in npd. Other order fields are untouched.
"""
from __future__ import annotations

import argparse
import os
from datetime import datetime

import pymysql

from migrate_daily_bk_orders_jobs import load_runtime_env

load_runtime_env()


def connect():
    return pymysql.connect(
        host=os.environ["DB_HOST"], port=int(os.getenv("DB_PORT", "3306")),
        user=os.environ["DB_USER"], password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"], charset="utf8mb4", autocommit=False,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--batch-size", type=int, default=100)
    args = parser.parse_args()
    db = connect()
    try:
        cur = db.cursor()
        cur.execute("""SELECT o.id,o.externalOrderId,o.erpCode,o.itemId,o.npdId,n.id,n.itemName
                       FROM orders o JOIN npd n ON TRIM(n.erp)=TRIM(o.erpCode)
                       WHERE o.itemSource='FG' ORDER BY o.externalOrderId""")
        rows = [r for r in cur.fetchall() if str(r[3] or '') != str(r[5] or '') or str(r[4] or '') != str(r[5] or '')]
        cur.execute("""SELECT DISTINCT o.externalOrderId,o.erpCode
                       FROM orders o LEFT JOIN npd n ON TRIM(n.erp)=TRIM(o.erpCode)
                       WHERE o.itemSource='FG' AND n.id IS NULL""")
        missing = cur.fetchall()
        print(f"FG orders scanned: {len(rows) + len(missing)}")
        print(f"NPD links needing repair: {len(rows)}")
        print(f"Orders without any NPD ERP match: {len(missing)}")
        for external, erp in missing:
            print(f"MISSING externalOrderId={external} erp={erp}")
        for row in rows[:10]:
            print(f"PREVIEW externalOrderId={row[1]} erp={row[2]} item={row[6]}")
        if not args.apply:
            print("DRY RUN: no database changes committed.")
            return
        total = 0
        for start in range(0, len(rows), args.batch_size):
            batch = rows[start:start + args.batch_size]
            db.begin()
            try:
                now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                for order_id, _external, _erp, _old_item, _old_npd, npd_id, _name in batch:
                    cur.execute("""UPDATE orders SET itemId=%s,npdId=%s,
                                  updatedBy='NPD Item Link Repair',updateTimestamp=%s
                                  WHERE id=%s""", (npd_id, npd_id, now, order_id))
                db.commit()
                total += len(batch)
                print(f"Batch {start // args.batch_size + 1} committed: {len(batch)}")
            except Exception:
                db.rollback()
                raise
        print(f"Updated orders: {total}")
    finally:
        db.close()


if __name__ == '__main__':
    main()
