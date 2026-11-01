"""Add missing Reel material masters from ITEM MASTER.

Dry-run by default.  Uses one short database connection per 100-row batch;
does not create opening balances, suppliers, MRRs, or Reel slips.
"""
import argparse, os, re, sys, uuid
from datetime import datetime, timezone
from pathlib import Path
from migrate_daily_bk_orders_jobs import load_runtime_env, sheets_values, connect

SHEET_ID = "1MAZwiGb5bgNXyAW-Bv4LfrdBF6mtYLyNco5IUDPnCfQ"

def s(v): return "" if v is None else str(v).strip()
def norm(v): return re.sub(r"\s+", " ", s(v)).casefold()
def number(v):
    try: return float(s(v).replace(",", ""))
    except Exception: return None
def batches(xs, n): return [xs[i:i+n] for i in range(0, len(xs), n)]

def source_rows():
    """Build material masters from the Helper Sheet's Reel columns."""
    vals = sheets_values().get(spreadsheetId=SHEET_ID, range="'HELPER SHEET'!A1:Q10043").execute().get("values", [])
    out=[]; by_erp={}; conflicts={}
    for row_no, row in enumerate(vals[1:], 2):
        if len(row) < 13: continue
        erp=s(row[9]); size=number(row[10]); gsm=number(row[11]); bf=number(row[12])
        if not erp or size is None or gsm is None or bf is None: continue
        signature=(size,gsm,bf)
        prior=by_erp.get(erp)
        if prior and prior[3:6] != signature:
            conflicts.setdefault(erp, []).append(row_no)
            continue
        if prior: continue
        name=f"{erp} - Size: {size:g} CM X GSM: {gsm:g} X BF: {bf:g} Color - Natural"
        record=(row_no,erp,"",size,gsm,bf,name)
        by_erp[erp]=record; out.append(record)
    for erp, rows in conflicts.items():
        print(f"CONFLICT ERP {erp}: helper rows {rows}; skipped")
        out[:] = [r for r in out if r[1] != erp]
    return out

def find_firm(cur):
    cur.execute("SELECT id, firmName FROM firms ORDER BY firmName")
    for row in cur.fetchall():
        if re.search(r"unit\s*[- ]?i\b", s(row[1]), re.I) and not re.search(r"unit\s*[- ]?ii\b", s(row[1]), re.I): return row
    raise RuntimeError("Unit-I firm was not found")

def find_group(cur):
    cur.execute("SELECT id, name FROM material_groups ORDER BY name")
    rows=cur.fetchall()
    for row in rows:
        if norm(row[1]) == "reel": return row[0]
    for row in rows:
        if "reel" in norm(row[1]): return row[0]
    raise RuntimeError("Reel material group was not found")

def main():
    load_runtime_env(); p=argparse.ArgumentParser(); p.add_argument('--apply',action='store_true'); p.add_argument('--batch-size',type=int,default=100); p.add_argument('--start-batch',type=int,default=1); p.add_argument('--max-batches',type=int); a=p.parse_args()
    if a.batch_size < 1: raise SystemExit('--batch-size must be positive')
    rows=source_rows(); bs=batches(rows,a.batch_size); selected=bs[a.start_batch-1:(a.start_batch-1+a.max_batches if a.max_batches else None)]
    print(f"ITEM MASTER rows: {len(rows)}; batches: {len(bs)}; selected: {len(selected)}")
    if not a.apply:
        db=connect()
        try:
            cur=db.cursor(); firm=find_firm(cur); cur.execute("SELECT erpCode FROM materials WHERE firmId=%s AND LOWER(TRIM(COALESCE(type,'')))='reel'",(firm[0],)); existing={s(x[0]) for x in cur.fetchall()}
        finally: db.close()
        missing=[r for r in rows if r[1] not in existing]
        print(f"Unit-I firm: {firm[1]}; existing Reel ERPs: {len(existing)}; missing to add: {len(missing)}")
        print("DRY RUN: no database changes committed."); return
    total=0
    for bi,batch in enumerate(selected,a.start_batch):
        db=connect()
        try:
            db.begin(); cur=db.cursor(); firm=find_firm(cur); group=find_group(cur)
            cur.execute("SELECT erpCode FROM materials WHERE firmId=%s AND LOWER(TRIM(COALESCE(type,'')))='reel'",(firm[0],)); existing={s(x[0]) for x in cur.fetchall()}
            inserted=0; skipped=0; now=datetime.now(timezone.utc).isoformat()
            for row_no,erp,supplier,size,gsm,bf,name in batch:
                if erp in existing: skipped+=1; continue
                cur.execute("INSERT INTO materials (id,firmId,type,erpCode,name,uom,materialGroupId,color,size,gsm,bf,active,updatedBy,updateTimestamp) VALUES (%s,%s,'Reel',%s,%s,'KGS',%s,'Natural',%s,%s,%s,'Yes','ITEM MASTER Import',%s)",(str(uuid.uuid4()),firm[0],erp,name,group,size,gsm,bf,now)); inserted+=1; existing.add(erp)
            db.commit(); total+=inserted; print(f"Batch {bi} committed: source={len(batch)} inserted={inserted} skipped_existing={skipped}")
        except Exception:
            db.rollback(); raise
        finally: db.close()
    print(f"Completed: inserted={total}")
if __name__=='__main__': main()
