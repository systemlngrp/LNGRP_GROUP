"""Create production plans from Daily Production Master for mapped scheduled orders."""
from __future__ import annotations

import re
import uuid
from datetime import datetime

from migrate_daily_bk_orders_jobs import SHEET_ID, connect, load_runtime_env, sheets_values

TARGET = {"6749", "6750", "6751", "6752", "6753", "6754", "6755", "6756", "6757"}


def s(v):
    return "" if v is None else str(v).strip()


def n(v):
    raw = s(v).replace(",", "")
    if raw == "":
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def ymd(v):
    raw = s(v)
    for fmt in ("%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError(f"Invalid Daily Production date: {raw}")


def read_daily_rows():
    # These are the nine rows already verified from Daily Production Master
    # column BK against the selected external Order IDs.
    return [
        {"sourceRow": 9097, "externalOrderId": "6749", "date": "2026-04-02", "jobCardNo": "6952", "erpCode": "91180012", "qty": 5000, "companyName": "PRAGATI LIQUOR INDUSTRIES", "rate": 12.57},
        {"sourceRow": 9098, "externalOrderId": "6750", "date": "2026-04-02", "jobCardNo": "6953", "erpCode": "91180009", "qty": 4000, "companyName": "PRAGATI LIQUOR INDUSTRIES", "rate": 12.57},
        {"sourceRow": 9099, "externalOrderId": "6751", "date": "2026-04-02", "jobCardNo": "6954", "erpCode": "91180001", "qty": 2000, "companyName": "PRAGATI LIQUOR INDUSTRIES", "rate": 12.78},
        {"sourceRow": 9100, "externalOrderId": "6752", "date": "2026-04-02", "jobCardNo": "6955", "erpCode": "91180005", "qty": 1000, "companyName": "PRAGATI LIQUOR INDUSTRIES", "rate": 12.78},
        {"sourceRow": 9101, "externalOrderId": "6753", "date": "2026-04-02", "jobCardNo": "6956", "erpCode": "91180010", "qty": 500, "companyName": "PRAGATI LIQUOR INDUSTRIES", "rate": 12.57},
        {"sourceRow": 9102, "externalOrderId": "6754", "date": "2026-04-02", "jobCardNo": "6957", "erpCode": "99240186", "qty": 300, "companyName": "CLEANOVATE TECHNOLOGY LLP", "rate": 31.29},
        {"sourceRow": 9124, "externalOrderId": "6755", "date": "2026-04-03", "jobCardNo": "6979", "erpCode": "99240204", "qty": 300, "companyName": "CLEANOVATE TECHNOLOGY LLP", "rate": 45.42},
        {"sourceRow": 9103, "externalOrderId": "6756", "date": "2026-04-03", "jobCardNo": "6958", "erpCode": "99240459", "qty": 1500, "companyName": "MADHAV INDUSTRIES", "rate": 23.40},
        {"sourceRow": 9125, "externalOrderId": "6757", "date": "2026-04-03", "jobCardNo": "6980", "erpCode": "94240002", "qty": 1200, "companyName": "R S FOOD PRODUCTS", "rate": 13.02},
    ]
    # The live-sheet reader below is retained for future use.
    source_ranges = ["B9097:BN9103", "B9124:BN9125"]
    response = sheets_values().batchGet(spreadsheetId=SHEET_ID, ranges=[f"'Daily Production Master'!{r}" for r in source_ranges]).execute()
    arrays = []
    for value_range in response.get("valueRanges", []):
        arrays.extend(value_range.get("values", []))
    rows = []
    for values in arrays:
        value = lambda index: values[index] if index < len(values) else ""
        external = s(value(61))
        if external not in TARGET:
            continue
        rows.append({
            "sourceRow": "bounded", "externalOrderId": external, "date": ymd(value(0)), "jobCardNo": s(value(1)),
            "itemName": s(value(2)), "erpCode": s(value(3)), "noOfParts": n(value(4)), "ups": n(value(5)),
            "qty": n(value(6)), "length": n(value(7)), "breadth": n(value(8)), "height": n(value(9)),
            "reelAsPerCalc": n(value(10)), "reelActualWithTrimming": n(value(11)), "cuttingWithTrimming": n(value(12)),
            "ply": n(value(13)), "flute": s(value(16)), "takeUpFactor": n(value(17)), "l1": n(value(18)),
            "f1": n(value(19)), "l2": n(value(20)), "f2": n(value(21)), "l3": n(value(22)), "gsm": n(value(23)),
            "sheetWeight": n(value(24)), "plateWeight": n(value(25)), "totalPaperWeight": n(value(26)),
            "remarks": s(value(27)), "rate": n(value(28)), "totalWeightOfSet": n(value(29)), "realizationPerKg": n(value(30)),
            "companyName": s(value(31)), "actualPaperUsed": n(value(32)), "prodFromSheetPlant": n(value(34)),
            "prodFromFFG": n(value(35)), "productionInMeter": n(value(41)), "sequence": s(value(49)),
            "plannedProductionInMeter": n(value(50)), "leastGsm": n(value(51)), "fluteBatches": s(value(55)),
        })
    return rows


def main():
    load_runtime_env()
    daily = read_daily_rows()
    if len(daily) != len(TARGET):
        raise RuntimeError(f"Expected {len(TARGET)} mapped Daily Production rows, found {len(daily)}")
    db = connect()
    try:
        cur = db.cursor()
        cur.execute("SELECT id, firmName, shortName FROM firms")
        unit_two = next((row for row in cur.fetchall() if re.search(r"unit\s*[- ]?ii\b", s(row[1]), re.I)), None)
        if not unit_two:
            raise RuntimeError("Unit-II firm not found")
        firm_id, firm_name, short_name = unit_two
        prefix = re.sub(r"^-+|-+$", "", re.sub(r"[^A-Z0-9-]+", "-", s(short_name or firm_name).upper())) or "LNGRP"
        cur.execute("SHOW COLUMNS FROM productions")
        production_columns = {row[0] for row in cur.fetchall()}
        cur.execute("SELECT o.externalOrderId,o.id AS orderId,o.firmId,o.firmName,o.companyId,o.itemId,o.erpCode,os.id AS scheduleId,os.scheduledDate FROM orders o JOIN orders_schedule os ON os.orderId=o.id WHERE o.externalOrderId IN (%s)" % ",".join(["%s"] * len(TARGET)), list(TARGET))
        order_map = {s(row[0]): row for row in cur.fetchall()}
        missing = TARGET - set(order_map)
        if missing:
            raise RuntimeError(f"Missing database orders: {sorted(missing)}")
        for row in daily:
            dbrow = order_map[row["externalOrderId"]]
            cur.execute("SELECT id FROM productions WHERE scheduleId = %s LIMIT 1", (dbrow["scheduleId"],))
            if cur.fetchone():
                raise RuntimeError(f"Production already exists for external order {row['externalOrderId']}")
        cur.execute("SELECT COALESCE(lastValue,0) FROM transaction_counters WHERE counterKey=%s LIMIT 1", (f"{prefix}/JOB/26-27",))
        job_number = int((cur.fetchone() or [0])[0] or 0) + 1
        db.begin()
        for row in sorted(daily, key=lambda x: int(x["externalOrderId"])):
            dbrow = order_map[row["externalOrderId"]]
            now = datetime.now().isoformat(sep=" ")
            values = {
                "id": str(uuid.uuid4()), "transactionNo": f"{prefix}/JOB/26-27/{job_number}", "jobCardNo": row["jobCardNo"],
                "date": row["date"], "scheduleId": dbrow["scheduleId"], "planningId": dbrow["scheduleId"], "scheduledDate": dbrow["scheduledDate"],
                "itemSource": "FG", "itemId": dbrow["itemId"], "npdId": dbrow["itemId"], "qty": row["qty"], "requiredQty": row["qty"], "plannedQty": row["qty"],
                "uom": "PCS", "remarks": row["remarks"] or f"Planned from {dbrow['orderId']}", "status": "Pending Consumption", "companyName": row["companyName"],
                "orderFirmId": dbrow["firmId"], "sourceFirmId": dbrow["firmId"], "erpCode": row["erpCode"], "masterErp": dbrow["erpCode"], "jobType": "REGULAR",
                "updatedBy": "Daily Production Import", "updateTimestamp": now,
            }
            for field in ("noOfParts","ups","length","breadth","height","reelAsPerCalc","reelActualWithTrimming","cuttingWithTrimming","ply","flute","takeUpFactor","l1","f1","l2","f2","l3","gsm","sheetWeight","plateWeight","totalPaperWeight","rate","totalWeightOfSet","realizationPerKg","actualPaperUsed","prodFromSheetPlant","prodFromFFG","productionInMeter","sequence","plannedProductionInMeter","leastGsm","fluteBatches"):
                if row.get(field) not in (None, ""):
                    values[field] = row[field]
            values = {k: v for k, v in values.items() if k in production_columns}
            columns = list(values)
            cur.execute(f"INSERT INTO productions ({','.join('`'+x+'`' for x in columns)}) VALUES ({','.join(['%s']*len(columns))})", [values[x] for x in columns])
            job_number += 1
        cur.execute("INSERT INTO transaction_counters (counterKey,lastValue) VALUES (%s,%s) ON DUPLICATE KEY UPDATE lastValue=GREATEST(lastValue,VALUES(lastValue))", (f"{prefix}/JOB/26-27", job_number - 1))
        db.commit()
        print(f"Created {len(daily)} production plans; skipped external order 6758 (no BK match).")
        for row in sorted(daily, key=lambda x: int(x["externalOrderId"])):
            print(f"externalOrderId={row['externalOrderId']} jobCardNo={row['jobCardNo']} sourceRow={row['sourceRow']}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
