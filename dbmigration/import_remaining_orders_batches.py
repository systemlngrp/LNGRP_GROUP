"""Import remaining New Order Master rows as orders, schedules, and mapped FG jobs.
Dry-run by default; one database connection/transaction per batch.
"""
from __future__ import annotations
import argparse, re, uuid
from datetime import datetime, timedelta
from migrate_daily_bk_orders_jobs import SHEET_ID, connect, load_runtime_env, sheets_values

AFTER_EXTERNAL = 6758

def s(v): return "" if v is None else str(v).strip()
def date(v):
    raw=s(v)
    for f in ("%m/%d/%Y","%d/%m/%Y","%Y-%m-%d"):
        try: return datetime.strptime(raw,f).date().isoformat()
        except ValueError: pass
    return ""
def num(v):
    try: return float(s(v).replace(",",""))
    except: return 0
def norm(v): return re.sub(r"\s+"," ",s(v)).casefold()
def prefix(name): return re.sub(r"^-+|-+$","",re.sub(r"[^A-Z0-9-]+","-",s(name).upper())) or "LNGRP"
def chunks(xs,n): return [xs[i:i+n] for i in range(0,len(xs),n)]

def source_rows():
    vals=sheets_values().get(spreadsheetId=SHEET_ID,range="'New Order Master'!A1:I10000").execute().get("values",[])
    rows=[]
    for i,v in enumerate(vals[1:],2):
        if len(v)<9 or not s(v[0]) or not s(v[0]).isdigit() or int(float(s(v[0])))<=AFTER_EXTERNAL: continue
        rows.append(dict(sourceRow=i,externalOrderId=s(v[0]),orderDate=date(v[1]),companyName=s(v[2]),poNumber=s(v[3]),erpCode=s(v[4]),itemName=s(v[5]),qty=num(v[6]),rate=num(v[7]),scheduledDate=date(v[8])))
    return rows

def daily_map():
    got=sheets_values().batchGet(spreadsheetId=SHEET_ID,ranges=["'Daily Production Master'!B1:C12900","'Daily Production Master'!H1:H12900","'Daily Production Master'!BK1:BK12900"]).execute().get("valueRanges",[])
    a=(got[0].get("values",[]) if len(got)>0 else []); b=(got[1].get("values",[]) if len(got)>1 else [])
    c=(got[2].get("values",[]) if len(got)>2 else [])
    out={}
    for i in range(1,max(len(a),len(b))):
        oid=s(c[i][0]) if i<len(c) and c[i] else ""
        if oid: out[oid]=dict(jobCardNo=s(a[i][1]) if i<len(a) and len(a[i])>1 else "",date=date(a[i][0]) if i<len(a) and a[i] else "",planQty=num(b[i][0]) if i<len(b) and b[i] else 0)
    return out

def main():
    load_runtime_env(); p=argparse.ArgumentParser(); p.add_argument('--apply',action='store_true'); p.add_argument('--batch-size',type=int,default=100); p.add_argument('--start-batch',type=int,default=1); p.add_argument('--max-batches',type=int); args=p.parse_args()
    rows=source_rows(); dmap=daily_map(); print(f"Remaining source orders: {len(rows)}; batches: {(len(rows)+args.batch_size-1)//args.batch_size}")
    if not rows: return
    db=connect()
    try:
        cur=db.cursor(); cur.execute("SELECT id,firmName,shortName FROM firms"); firm=next((x for x in cur.fetchall() if re.search(r"unit\s*[- ]?ii\b",s(x[1]),re.I)),None)
        if not firm: raise RuntimeError('Unit-II firm not found')
        firm_id,firm_name,short=firm; fp=prefix(short or firm_name)
        marks=','.join(['%s']*len(rows)); cur.execute(f"SELECT externalOrderId FROM orders WHERE externalOrderId IN ({marks})",[x['externalOrderId'] for x in rows]); existing={s(x[0]) for x in cur.fetchall()}
        rows=[x for x in rows if x['externalOrderId'] not in existing]; batches=chunks(rows,args.batch_size); selected=batches[args.start_batch-1:(args.start_batch-1+args.max_batches if args.max_batches else None)]
        print(f"Pending after duplicate check: {len(rows)}; selected batches: {len(selected)}")
        if not args.apply: print('DRY RUN: no database changes committed.'); return
        for bi,batch in enumerate(selected,args.start_batch):
            try:
                db.begin(); cur=db.cursor(); cur.execute("SELECT COALESCE(lastValue,0) FROM transaction_counters WHERE counterKey=%s",(f'{fp}/ORD/26-27',)); order_no=int((cur.fetchone() or [0])[0] or 0)+1
                cur.execute("SELECT COALESCE(lastValue,0) FROM transaction_counters WHERE counterKey=%s",(f'{fp}/JOB/26-27',)); job_no=int((cur.fetchone() or [0])[0] or 0)+1
                cur.execute("SELECT transactionNo FROM productions WHERE transactionNo LIKE %s",(f'{fp}/JOB/26-27/%',))
                for (existing_tno,) in cur.fetchall():
                    tail=s(existing_tno).rsplit('/',1)[-1]
                    if tail.isdigit(): job_no=max(job_no,int(tail)+1)
                for row in batch:
                    cur.execute("SELECT id FROM companies WHERE LOWER(TRIM(name))=%s LIMIT 1",(norm(row['companyName']),)); company=cur.fetchone()
                    cur.execute("SELECT id FROM npd WHERE TRIM(erp)=%s LIMIT 1",(row['erpCode'],)); item=cur.fetchone()
                    if not company or not item:
                        print(f"SKIP sourceRow={row['sourceRow']} externalOrderId={row['externalOrderId']} reason=company_or_ERP_not_found", flush=True)
                        continue
                    oid=str(uuid.uuid4()); now=datetime.now().isoformat(sep=' '); ono=f'{fp}/ORD/26-27/{order_no}'; sno=f'SCH/26-27/{order_no:05d}'
                    cur.execute("INSERT INTO orders (id,firmId,firmName,orderNo,externalOrderId,orderDate,companyId,poNumber,erpCode,itemId,itemSource,npdId,qty,rate,orderAmount,status,approvedTimestamp,approvedEmail,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'FG',%s,%s,%s,%s,'Scheduled',%s,%s,%s,%s)",(oid,firm_id,firm_name,ono,row['externalOrderId'],row['orderDate'],company[0],row['poNumber'],row['erpCode'],item[0],item[0],row['qty'],row['rate'],row['qty']*row['rate'],now,'Batch Import','Batch Import',now))
                    sid=str(uuid.uuid4()); cur.execute("INSERT INTO orders_schedule (id,orderId,firmId,firmName,scheduleNo,scheduledDate,qty,producedQty,canceledQty,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,%s,%s,%s,0,0,%s,%s)",(sid,oid,firm_id,firm_name,sno,row['scheduledDate'],row['qty'],'Batch Import',now))
                    dm=dmap.get(row['externalOrderId']);
                    if dm and dm.get('jobCardNo'):
                        while True:
                            tno=f'{fp}/JOB/26-27/{job_no}'
                            cur.execute("SELECT 1 FROM productions WHERE transactionNo=%s LIMIT 1",(tno,))
                            if not cur.fetchone(): break
                            job_no += 1
                        prod_qty=dm.get('planQty') or row['qty']; cur.execute("INSERT INTO productions (id,transactionNo,jobCardNo,date,scheduleId,planningId,itemSource,itemId,npdId,qty,requiredQty,plannedQty,uom,status,companyName,orderFirmId,scheduledDate,jobType,erpCode,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,%s,%s,'FG',%s,%s,%s,%s,%s,'PCS','Pending Consumption',%s,%s,%s,'REGULAR',%s,%s,%s)",(str(uuid.uuid4()),tno,dm['jobCardNo'],dm['date'] or row['orderDate'],sid,sid,item[0],item[0],prod_qty,prod_qty,prod_qty,row['companyName'],firm_id,row['scheduledDate'],row['erpCode'],'Batch Import',now)); job_no+=1
                    order_no+=1
                cur.execute("INSERT INTO transaction_counters (counterKey,lastValue) VALUES (%s,%s) ON DUPLICATE KEY UPDATE lastValue=GREATEST(lastValue,VALUES(lastValue))",(f'{fp}/ORD/26-27',order_no-1)); cur.execute("INSERT INTO transaction_counters (counterKey,lastValue) VALUES (%s,%s) ON DUPLICATE KEY UPDATE lastValue=GREATEST(lastValue,VALUES(lastValue))",(f'{fp}/JOB/26-27',job_no-1)); db.commit(); print(f'Batch {bi} committed: rows={len(batch)}')
            except Exception:
                db.rollback(); raise
    finally: db.close()
if __name__=='__main__': main()
