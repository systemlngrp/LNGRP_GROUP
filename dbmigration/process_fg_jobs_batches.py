"""Idempotently migrate safe FG jobs from the migration workbook.

PHP/Plate jobs and source rows that cannot be linked to a real order/schedule
or item are reported and skipped. Dry-run is the default.
"""
from __future__ import annotations

import argparse, os, re, sys, uuid
from datetime import datetime, date
from decimal import Decimal
from pathlib import Path

import pymysql
from openpyxl import load_workbook

WORKBOOK = Path(r"C:\Users\Admin\Downloads\LNGRP_Migration_Workbook.xlsx")
UNIT_II = "334aa279-b7f3-450d-8b34-ee538a70e802"
PREFIX = "JOB/26-27/"
START_DATE = date(2026, 4, 1)

def env():
    for p in (Path.cwd()/".env", Path(__file__).resolve().parent/".env", Path(__file__).resolve().parents[1]/".env"):
        if p.is_file():
            for line in p.read_text(encoding="utf-8").splitlines():
                if "=" in line and line.strip() and not line.lstrip().startswith("#"):
                    k,v=line.split("=",1); os.environ.setdefault(k.strip(), v.strip().strip("\"'"))
            return
env()

def text(v): return "" if v is None else str(v).strip()
def dec(v):
    try: return Decimal(text(v).replace(",", ""))
    except Exception: return Decimal("0")
def job_no(v):
    s=text(v)
    return str(int(float(s))) if re.fullmatch(r"\d+\.0+",s) else s
def ymd(v):
    if isinstance(v, datetime): return v.date().isoformat()
    if isinstance(v, date): return v.isoformat()
    s=text(v)
    for f in ("%Y-%m-%d","%m/%d/%Y","%d/%m/%Y","%m-%d-%Y","%d-%m-%Y"):
        try: return datetime.strptime(s[:10], f).date().isoformat()
        except ValueError: pass
    return ""
def conn():
    return pymysql.connect(host=os.environ["DB_HOST"], port=int(os.getenv("DB_PORT","3306")), user=os.environ["DB_USER"], password=os.environ["DB_PASSWORD"], database=os.environ["DB_NAME"], connect_timeout=15, read_timeout=180, write_timeout=180, autocommit=False, cursorclass=pymysql.cursors.Cursor)
def chunks(xs,n):
    for i in range(0,len(xs),n): yield xs[i:i+n]

def load_jobs():
    wb=load_workbook(WORKBOOK, read_only=True, data_only=True)
    ws=wb["Jobs"]
    headers=[text(c.value) for c in ws[1]]; ix={h:i for i,h in enumerate(headers)}
    rows=[]; skipped=[]
    for rn, values in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        def g(name): return values[ix[name]] if ix[name] < len(values) else ""
        order=text(g("Order Id")); j=job_no(g("Job Card No.")); d=ymd(g("Job Date")); erp=text(g("ERP CODE")); linked=text(g("Linked PHP/Plate Job"))
        if not order or not j: skipped.append((rn,j,"blank order/job")); continue
        if d and d < START_DATE.isoformat(): continue
        if linked or erp.startswith(("75","77","78")):
            skipped.append((rn,j,"PHP/Plate")); continue
        rows.append({"source_row":rn,"order":order,"job":j,"date":d,"erp":erp,"item":text(g("Item Name")),"company":text(g("Company Name")),"qty":dec(g("Plan QTY")),"parts":g("No. of Parts"),"ups":g("UPS"),"length":g("Length"),"breadth":g("Bredth"),"height":g("Height"),"ply":g("PLY"),"flute":g("FLUTE"),"l1":g("L1"),"f1":g("F1"),"l2":g("L2"),"f2":g("F2"),"l3":g("L3"),"gsm":g("GSM"),"sheet_weight":g("SHEET WEIGHT"),"paper_weight":g("TOTAL Paper WEIGHT"),"rate":dec(g("RATE")),"sheet_plant":g("Production from Sheet Plant"),"ffg":g("Production from FFG"),"remarks":text(g("REMARK"))})
    return rows, skipped

def one(c,q,p=()): c.execute(q,p); return c.fetchone()
def existing(c):
    c.execute("SELECT jobCardNo, transactionNo FROM productions WHERE jobCardNo IS NOT NULL AND TRIM(jobCardNo)<>''")
    return {(text(a),text(b)) for a,b in c.fetchall()}

def process(batch, c, dry, seen):
    created=updated=skipped=0; details=[]
    for r in batch:
        txn=PREFIX+r["job"]
        if (r["job"],txn) in seen: skipped+=1; continue
        if one(c,"SELECT id FROM productions WHERE jobCardNo=%s OR transactionNo=%s LIMIT 1",(r["job"],txn)):
            skipped+=1; continue
        order=one(c,"SELECT o.id,o.itemId,o.npdId,o.firmId,o.firmName,o.companyId,o.erpCode,s.id,s.scheduledDate,s.qty FROM orders o JOIN orders_schedule s ON s.orderId=o.id WHERE (o.externalOrderId=%s OR o.orderNo=%s) AND o.erpCode=%s ORDER BY s.scheduledDate LIMIT 2",(r["order"],r["order"],r["erp"]))
        if not order:
            details.append((r["source_row"],r["job"],"missing order/schedule")); continue
        # If there are multiple schedules, use the one matching the sheet job date.
        order=one(c,"SELECT o.id,o.itemId,o.npdId,o.firmId,o.firmName,o.companyId,o.erpCode,s.id,s.scheduledDate,s.qty FROM orders o JOIN orders_schedule s ON s.orderId=o.id WHERE (o.externalOrderId=%s OR o.orderNo=%s) AND o.erpCode=%s AND LEFT(s.scheduledDate,10)=%s LIMIT 1",(r["order"],r["order"],r["erp"],r["date"])) or order
        item_id=order[1]
        if not item_id:
            details.append((r["source_row"],r["job"],"missing item")); continue
        vals=(str(uuid.uuid4()),txn,r["job"],r["date"] or str(order[8])[:10],order[7],item_id,order[2],r["qty"],r["qty"],r["qty"],r["company"],order[3],r["date"] or str(order[8])[:10],r["erp"],r["remarks"] or "Created from migration workbook")
        if not dry:
            c.execute("""INSERT INTO productions (id,transactionNo,jobCardNo,date,scheduleId,itemSource,itemId,npdId,qty,requiredQty,plannedQty,uom,status,companyName,orderFirmId,scheduledDate,jobType,erpCode,remarks,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,%s,'FG',%s,%s,%s,%s,%s,'PCS','Pending Consumption',%s,%s,%s,'REGULAR',%s,%s,'Migration',NOW())""",vals)
        created+=1; details.append((r["source_row"],r["job"],"would create" if dry else "created"))
    return created,updated,skipped,details

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--apply",action="store_true"); ap.add_argument("--batch-size",type=int,default=100); ap.add_argument("--start-batch",type=int,default=1); ap.add_argument("--max-batches",type=int); a=ap.parse_args()
    if a.batch_size<1: raise SystemExit("--batch-size must be positive")
    jobs, skipped=load_jobs(); db=conn(); c=db.cursor()
    try:
        # Resolve blocked source rows before writes, and keep a stable ordered list.
        c.execute("SELECT externalOrderId,orderNo,erpCode FROM orders o")
        order_rows=c.fetchall()
        order_keys={(text(x),text(z)) for x,y,z in order_rows} | {(text(y),text(z)) for x,y,z in order_rows}
        safe=[]; blocked=[]
        for r in jobs:
            if (r["order"],r["erp"]) not in order_keys: blocked.append((r["source_row"],r["job"],"order not in database")); continue
            # Item must already exist through order linkage; missing NPD/FG item rows remain blocked.
            q=one(c,"SELECT o.itemId FROM orders o WHERE (o.externalOrderId=%s OR o.orderNo=%s) AND o.erpCode=%s LIMIT 1",(r["order"],r["order"],r["erp"]))
            if not q or not q[0]: blocked.append((r["source_row"],r["job"],"item not in database")); continue
            safe.append(r)
        batches=list(chunks(safe,a.batch_size)); end=len(batches) if a.max_batches is None else min(len(batches),a.start_batch-1+a.max_batches)
        seen=existing(c)
        print(f"safe={len(safe)}; skipped PHP/Plate/blank={len(skipped)}; blocked={len(blocked)}; batches={len(batches)}; mode={'apply' if a.apply else 'dry-run'}",flush=True)
        for n in range(a.start_batch,end+1):
            b=batches[n-1]
            try:
                if a.apply: db.begin()
                cr,up,sk,details=process(b,c,not a.apply,seen)
                seen.update((r["job"],PREFIX+r["job"]) for r in b[:cr])
                if a.apply: db.commit()
                print(f"batch {n}/{len(batches)}: rows={len(b)} created={cr} skipped_existing={sk} committed={a.apply}",flush=True)
            except Exception:
                if a.apply: db.rollback()
                raise
        print(f"blocked rows: {blocked}",flush=True)
        if not a.apply: print("DRY RUN: no database changes committed.",flush=True)
    finally: c.close(); db.close()
if __name__=="__main__":
    try: main()
    except Exception as e: print(f"ERROR: {e}",file=sys.stderr); raise
