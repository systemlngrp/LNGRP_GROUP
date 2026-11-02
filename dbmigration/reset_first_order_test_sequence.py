"""Replace the ten test imports 6749-6758 with Unit-II order numbers 1-10."""
from __future__ import annotations

import re
import uuid
from datetime import datetime

from import_first_new_order_rows import read_source
from migrate_daily_bk_orders_jobs import connect, load_runtime_env


def main():
    load_runtime_env()
    source = read_source()
    db = connect()
    try:
        cur = db.cursor()
        cur.execute("SELECT id, firmName, shortName FROM firms")
        firm = next((row for row in cur.fetchall() if re.search(r"unit\s*[- ]?ii\b", str(row[1]), re.I)), None)
        if not firm:
            raise RuntimeError("Unit-II firm not found")
        firm_id, firm_name, short_name = firm
        prefix = re.sub(r"^-+|-+$", "", re.sub(r"[^A-Z0-9-]+", "-", str(short_name or firm_name).upper()))
        external_ids = [row["externalOrderId"] for row in source]
        marks = ",".join(["%s"] * len(external_ids))
        cur.execute(f"SELECT id, externalOrderId, orderNo, firmId FROM orders WHERE externalOrderId IN ({marks}) FOR UPDATE", external_ids)
        existing = cur.fetchall()
        if len(existing) != 10:
            raise RuntimeError(f"Expected exactly 10 test orders, found {len(existing)}")
        if any(str(row[3]) != str(firm_id) or not re.fullmatch(rf"{re.escape(prefix)}/ORD/26-27/(?:2[0-9])", str(row[2])) for row in existing):
            raise RuntimeError("Target rows do not match the expected Unit-II test orders 20-29")
        order_ids = [row[0] for row in existing]
        order_marks = ",".join(["%s"] * len(order_ids))
        db.begin()
        cur.execute(f"DELETE FROM orders_schedule WHERE orderId IN ({order_marks})", order_ids)
        cur.execute(f"DELETE FROM orders WHERE id IN ({order_marks})", order_ids)
        for number, row in enumerate(source, 1):
            cur.execute("SELECT id, name FROM companies WHERE LOWER(TRIM(name)) = %s LIMIT 1", (re.sub(r"\s+", " ", row["companyName"]).strip().casefold(),))
            company = cur.fetchone()
            if not company:
                raise RuntimeError(f"Company not found: {row['companyName']}")
            cur.execute("SELECT id FROM npd WHERE TRIM(erp) = %s LIMIT 1", (row["erpCode"],))
            item = cur.fetchone()
            if not item:
                raise RuntimeError(f"ERP not found: {row['erpCode']}")
            order_id = str(uuid.uuid4())
            now = datetime.now().isoformat(sep=" ")
            order_no = f"{prefix}/ORD/26-27/{number}"
            schedule_no = f"SCH/26-27/{number:05d}"
            amount = round(row["qty"] * row["rate"], 2)
            cur.execute("""INSERT INTO orders
              (id, firmId, firmName, orderNo, externalOrderId, orderDate, companyId, poNumber, erpCode, itemId, itemSource, npdId, qty, rate, orderAmount, status, approvedTimestamp, approvedEmail, updatedBy, updateTimestamp)
              VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'FG',%s,%s,%s,%s,'Scheduled',%s,%s,%s,%s)""",
              (order_id, firm_id, firm_name, order_no, row["externalOrderId"], row["orderDate"], company[0], row["poNumber"], row["erpCode"], item[0], item[0], row["qty"], row["rate"], amount, now, "Bulk New Order Import", "Bulk New Order Import", now))
            cur.execute("""INSERT INTO orders_schedule
              (id, orderId, firmId, firmName, scheduleNo, scheduledDate, qty, producedQty, canceledQty, updatedBy, updateTimestamp)
              VALUES (%s,%s,%s,%s,%s,%s,%s,0,0,%s,%s)""",
              (str(uuid.uuid4()), order_id, firm_id, firm_name, schedule_no, row["scheduledDate"], row["qty"], "Bulk New Order Import", now))
        cur.execute("INSERT INTO transaction_counters (counterKey,lastValue) VALUES (%s,10) ON DUPLICATE KEY UPDATE lastValue=10", (f"{prefix}/ORD/26-27",))
        db.commit()
        print(f"Recreated 10 test orders for {firm_name}: {prefix}/ORD/26-27/1 through {prefix}/ORD/26-27/10")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
