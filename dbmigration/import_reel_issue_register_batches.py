"""Import Reel Issue Register into material issue tables.

Reads the local migration workbook. Dry-run by default; --apply commits batches.
Stock shortages are allowed by design. Missing jobs/Reels are skipped.
"""
from __future__ import annotations
import argparse, re, sys, uuid
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from openpyxl import load_workbook
sys.path.insert(0, str(Path(__file__).resolve().parent))
from migrate_daily_bk_orders_jobs import load_runtime_env, connect

BOOK=Path(r"C:\Users\Admin\Downloads\LNGRP_Migration_Workbook.xlsx")
def s(v): return "" if v is None else str(v).strip()
def n(v):
    try:return float(str(v).replace(',','') or 0)
    except:return 0.0
def job_keys(v):
    t=s(v); out={t}; m=re.search(r'/([^/]+)$',t)
    if m: out.add(m.group(1).lstrip('0') or '0'); out.add(m.group(1))
    if t.isdigit(): out.add(t.lstrip('0') or '0')
    return out

def read_rows(path):
    ws=load_workbook(path,read_only=True,data_only=True)['Reel Issue Register']
    out=[]
    for rownum,row in enumerate(ws.iter_rows(min_row=2,values_only=True),2):
        if s(row[13]).casefold()!='issue': continue
        out.append({'row':rownum,'issue_id':s(row[0]),'date':row[1],'job':s(row[2]),'reel':s(row[4]),'erp':s(row[6]),'weight':n(row[10]),'rate':n(row[11])})
    return out

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--apply',action='store_true'); ap.add_argument('--workbook',default=str(BOOK)); ap.add_argument('--batch-size',type=int,default=100); ap.add_argument('--start-batch',type=int,default=1); ap.add_argument('--max-batches',type=int,default=0); a=ap.parse_args()
    rows=read_rows(Path(a.workbook)); db=connect(); cur=db.cursor()
    try:
        cur.execute('SELECT id,jobCardNo,transactionNo FROM productions'); prod={}
        for r in cur.fetchall():
            for k in job_keys(r[1])|job_keys(r[2]): prod[k]=r
        cur.execute('SELECT id,ourReelNo,materialId,firmId,openingRate FROM material_in_packing_slips'); slips={s(r[1]):r for r in cur.fetchall() if s(r[1])}
        cur.execute("SELECT id,firmName FROM firms"); firm=next((r for r in cur.fetchall() if ''.join(c for c in s(r[1]).lower() if c.isalnum()).endswith(('unit1','uniti'))),None)
        if not firm: raise RuntimeError('Unit-I firm not found')
        cur.execute('SELECT issueNo,jobNo,productionId FROM material_issues'); existing={(s(r[0]),s(r[1]),s(r[2])) for r in cur.fetchall()}
        accepted=[]; skipped=[]; seen=set()
        for r in rows:
            key=(r['issue_id'],r['job'],r['reel'])
            if key in seen: skipped.append((r,'duplicate source issue/job/reel')); continue
            seen.add(key)
            p=prod.get(next(iter(job_keys(r['job'])),''))
            if not p:
                # deterministic lookup across all normalized keys
                p=next((v for k,v in prod.items() if k in job_keys(r['job'])),None)
            if not p: skipped.append((r,'production job not found')); continue
            slip=slips.get(r['reel'])
            if not slip: skipped.append((r,'Our Reel not found')); continue
            issue_no='REEL-'+r['issue_id']
            if (issue_no,r['job'],s(p[0])) in existing: skipped.append((r,'issue already exists')); continue
            accepted.append((r,p,slip))
        groups=[]; grouped={}
        for item in accepted:
            r,p,slip=item; gkey=(r['issue_id'],r['job'],s(p[0]))
            grouped.setdefault(gkey,[]).append(item)
        for group in grouped.values(): groups.extend([group])
        batches=[]; current=[]; current_rows=0
        for group in groups:
            if current and current_rows + len(group) > a.batch_size:
                batches.append(current); current=[]; current_rows=0
            current.extend(group); current_rows += len(group)
        if current: batches.append(current)
        selected=batches[a.start_batch-1:]
        if a.max_batches:selected=selected[:a.max_batches]
        print(f'Issue rows read: {len(rows)}'); print(f'Eligible rows: {len(accepted)}'); print(f'Skipped rows: {len(skipped)}'); print(f'Batches: total={len(batches)} selected={len(selected)} size={a.batch_size}')
        counts=defaultdict(int)
        for r,reason in skipped: counts[reason]+=1
        for k,v in counts.items(): print(f'  skipped {k}: {v}')
        for bn,batch in enumerate(selected,start=a.start_batch):
            print(f'Batch {bn}: rows={len(batch)} jobs={len({x[0]["job"] for x in batch})} weight={sum(x[0]["weight"] for x in batch):,.2f}')
            if not a.apply: continue
            db.begin()
            try:
                parents={}; line_ids={}; inserted=0
                for r,p,slip in batch:
                    pk=(r['issue_id'],r['job'],s(p[0])); issue_no='REEL-'+r['issue_id']
                    if pk not in parents:
                        iid=str(uuid.uuid4()); parents[pk]=iid
                        date=r['date'].strftime('%Y-%m-%d') if hasattr(r['date'],'strftime') else s(r['date'])
                        cur.execute("INSERT INTO material_issues (id,issueNo,date,issueType,productionId,jobNo,remarks,updatedBy,updateTimestamp,firmId,autoGenerated) VALUES (%s,%s,%s,'Reel',%s,%s,'Imported from Reel Issue Register','Reel Issue Workbook Import',NOW(),%s,'No')",(iid,issue_no,date,p[0],r['job'],firm[0]))
                    iid=parents[pk]; mid=slip[2]
                    if mid not in line_ids:
                        lid=str(uuid.uuid4()); line_ids[mid]=lid
                        cur.execute("INSERT INTO material_issue_lines (id,materialIssueId,materialId,qty,uom,rate,amount,updatedBy,updateTimestamp) VALUES (%s,%s,%s,0,'KG',%s,0,'Reel Issue Workbook Import',NOW())",(lid,iid,mid,r['rate'] or slip[4] or 0))
                    lid=line_ids[mid]; cur.execute("UPDATE material_issue_lines SET qty=qty+%s,amount=amount+%s WHERE id=%s",(r['weight'],r['weight']*(r['rate'] or slip[4] or 0),lid))
                    cur.execute("INSERT INTO material_issue_reel_lines (id,materialIssueId,materialIssueLineId,materialId,packingSlipId,ourReelNo,weightKg,productionId,jobNo,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'Reel Issue Workbook Import',NOW())",(str(uuid.uuid4()),iid,lid,mid,slip[0],r['reel'],r['weight'],p[0],r['job']))
                    inserted+=1
                db.commit(); print(f'COMMITTED batch={bn} child_rows={inserted} parents={len(parents)}')
            except Exception:
                db.rollback(); raise
        if not a.apply: print('DRY RUN: no database changes committed.')
    finally: db.close()
if __name__=='__main__': main()
