"""Import Opening Reel Stock (1 Apr) from the local migration workbook.

Dry-run by default. Rows without ERP/material details are reported and skipped.
"""
from __future__ import annotations
import argparse, json, sys, uuid
from collections import defaultdict
from pathlib import Path
from openpyxl import load_workbook
sys.path.insert(0, str(Path(__file__).resolve().parent))
from migrate_daily_bk_orders_jobs import load_runtime_env, connect

WORKBOOK = Path(r"C:\Users\Admin\Downloads\LNGRP_Migration_Workbook.xlsx")

def s(v): return "" if v is None else str(v).strip()
def num(v):
    try: return float(str(v).replace(",", "") or 0)
    except (TypeError, ValueError): return 0.0
def firm_key(v): return "".join(c for c in s(v).lower() if c.isalnum())

def read_rows(path):
    ws = load_workbook(path, read_only=True, data_only=True)["Opening Reel Stock (1 Apr)"]
    return [row for row in ws.iter_rows(min_row=2, values_only=True) if s(row[0])]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--workbook", default=str(WORKBOOK))
    ap.add_argument("--batch-size", type=int, default=100)
    ap.add_argument("--start-batch", type=int, default=1)
    ap.add_argument("--max-batches", type=int, default=0)
    a = ap.parse_args()
    rows = read_rows(Path(a.workbook))
    db = connect(); cur = db.cursor()
    try:
        cur.execute("SELECT id,firmName FROM firms")
        firm = next((r for r in cur.fetchall() if firm_key(r[1]).endswith(("unit1","uniti"))), None)
        if not firm: raise RuntimeError("Unit-I firm not found")
        cur.execute("SELECT id,erpCode,type,uom,active FROM materials")
        mats = {s(r[1]): r for r in cur.fetchall()}
        cur.execute("SELECT id,ourReelNo,materialInId FROM material_in_packing_slips")
        slips = {s(r[1]): r for r in cur.fetchall() if s(r[1])}
        cur.execute("SELECT id,name FROM suppliers")
        suppliers = {s(r[1]).casefold(): r[0] for r in cur.fetchall()}
        eligible=[]; skipped=[]; seen=set()
        for n,row in enumerate(rows,2):
            reel, supplier_reel, erp, supplier = map(s, (row[0],row[1],row[2],row[3]))
            size,gsm,bf,opening,rate = map(num,(row[4],row[5],row[6],row[9],row[10]))
            if reel in seen: skipped.append((n,reel,"duplicate Our Reel No.")); continue
            seen.add(reel)
            if not erp or opening <= 0 or erp not in mats:
                skipped.append((n,reel,"missing ERP/material or non-positive opening quantity")); continue
            existing = slips.get(reel)
            if existing and s(existing[2]).upper() != 'OPENING':
                skipped.append((n,reel,"already linked to a real MRR; protected")); continue
            m=mats[erp]
            if s(m[2]).casefold()!="reel" or s(m[3]).upper() not in ("KG","KGS") or s(m[4]).casefold() in ("no","false","0"):
                skipped.append((n,reel,"material is not an active Reel")); continue
            eligible.append((n,reel,supplier_reel,erp,supplier,size,gsm,bf,opening,rate,m[0]))
        batches=[eligible[i:i+a.batch_size] for i in range(0,len(eligible),a.batch_size)]
        selected=batches[a.start_batch-1:]
        if a.max_batches: selected=selected[:a.max_batches]
        print(f"Workbook rows: {len(rows)}")
        print(f"Eligible opening Reels: {len(eligible)}")
        print(f"Opening quantity: {sum(x[8] for x in eligible):,.2f} kg")
        print(f"Skipped rows: {len(skipped)}")
        for x in skipped[:20]: print(f"  row={x[0]} reel={x[1]} reason={x[2]}")
        print(f"Batches: total={len(batches)} selected={len(selected)} size={a.batch_size}")
        for bn,batch in enumerate(selected,start=a.start_batch):
            if not a.apply: print(f"DRY-RUN batch={bn} rows={len(batch)}"); continue
            try:
                db.begin(); touched=set(); inserted=updated=0
                for row in batch:
                    _,reel,supplier_reel,erp,supplier,size,gsm,bf,weight,rate,mid=row
                    sid=suppliers.get(supplier.casefold()) if supplier else None
                    if not sid and supplier:
                        sid=str(uuid.uuid4()); cur.execute("INSERT INTO suppliers (id,name,active,updatedBy,updateTimestamp,firmId) VALUES (%s,%s,'Yes','Opening Stock Import',NOW(),%s)",(sid,supplier,firm[0])); suppliers[supplier.casefold()]=sid
                    existing=slips.get(reel)
                    if existing:
                        cur.execute("UPDATE material_in_packing_slips SET materialId=%s, supplierReelNo=%s, weightKg=%s, openingRate=%s, supplierId=%s, firmId=%s, updatedBy='Opening Stock Import', updateTimestamp=NOW() WHERE id=%s",(mid,supplier_reel or None,weight,rate,sid,firm[0],existing[0])); updated+=1
                    else:
                        iid=str(uuid.uuid4()); cur.execute("INSERT INTO material_in_packing_slips (id,materialInId,materialLineId,materialId,supplierReelNo,ourReelNo,weightKg,updatedBy,updateTimestamp,firmId,openingRate,supplierId) VALUES (%s,'OPENING',%s,%s,%s,%s,%s,'Opening Stock Import',NOW(),%s,%s,%s)",(iid,iid,mid,supplier_reel or None,reel,weight,firm[0],rate,sid)); inserted+=1
                    touched.add(mid)
                for mid in touched:
                    cur.execute("SELECT COALESCE(SUM(weightKg),0), COALESCE(SUM(weightKg*COALESCE(openingRate,0)),0) FROM material_in_packing_slips WHERE materialId=%s AND firmId=%s AND UPPER(TRIM(materialInId))='OPENING'",(mid,firm[0])); qty,val=cur.fetchone()
                    cur.execute("SELECT id FROM material_firm_openings WHERE materialId=%s AND firmId=%s LIMIT 1",(mid,firm[0])); old=cur.fetchone()
                    if old: cur.execute("UPDATE material_firm_openings SET openingQty=%s,openingValue=%s,updatedBy='Opening Stock Import',updateTimestamp=NOW() WHERE id=%s",(qty,val,old[0]))
                    else: cur.execute("INSERT INTO material_firm_openings (id,materialId,firmId,openingQty,openingValue,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,%s,'Opening Stock Import',NOW())",(str(uuid.uuid4()),mid,firm[0],qty,val))
                db.commit(); print(f"COMMITTED batch={bn} rows={len(batch)} inserted={inserted} updated={updated}")
            except Exception:
                db.rollback(); raise
        if not a.apply: print("DRY RUN: no database changes committed.")
    finally: db.close()
if __name__=='__main__': main()
