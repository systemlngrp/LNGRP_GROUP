"""Import Reel MRRs from REEL MANAGEMENT in resumable parent-MRR batches."""
import argparse, json, re, uuid
from collections import OrderedDict, defaultdict
from datetime import datetime, timezone
from migrate_daily_bk_orders_jobs import load_runtime_env, sheets_values, connect

SID='1MAZwiGb5bgNXyAW-Bv4LfrdBF6mtYLyNco5IUDPnCfQ'; CUTOFF='2026-04-01'
def s(v): return '' if v is None else str(v).strip()
def num(v):
    try: return float(s(v).replace(',','') or 0)
    except: return 0.0
def norm(v): return re.sub(r'\s+',' ',s(v)).casefold()
def chunks(xs,n): return [xs[i:i+n] for i in range(0,len(xs),n)]
def app_mrr_no(sheet_no):
    """Preserve the sheet number while matching the application's MRR format."""
    raw=s(sheet_no)
    return f'LNCB-1/MRR/26-27/{int(raw):05d}' if raw.isdigit() else f'LNCB-1/MRR/26-27/{raw}'

def load_source():
    mv=sheets_values().get(spreadsheetId=SID,range="'MRR FORM'!A1:S10000").execute().get('values',[])
    hv=sheets_values().get(spreadsheetId=SID,range="'HELPER SHEET'!A1:Q10043").execute().get('values',[])
    hm=defaultdict(list)
    for v in hv[1:]:
        if len(v)>1 and s(v[1]): hm[s(v[1])].append(v)
    parents=OrderedDict()
    for v in mv[1:]:
        if len(v)<3: continue
        no=s(v[2]); raw=s(v[1])
        if not no or no=='2' or no in parents: continue
        parts=raw.split('/'); iso=f'{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}' if len(parts)==3 and all(x.isdigit() for x in parts) else ''
        if iso<CUTOFF: continue
        rows=hm.get(no,[])
        if not rows: continue
        parents[no]={'no':no,'date':iso,'invoiceNo':s(v[4]),'supplier':s(v[16]),'rows':rows}
    return list(parents.values())

def firm(cur):
    cur.execute('SELECT id,firmName FROM firms ORDER BY firmName')
    return next((x for x in cur.fetchall() if re.search(r'unit\s*[- ]?i\b',s(x[1]),re.I) and not re.search(r'unit\s*[- ]?ii\b',s(x[1]),re.I)),None)

def main():
    load_runtime_env(); p=argparse.ArgumentParser(); p.add_argument('--apply',action='store_true'); p.add_argument('--batch-size',type=int,default=10); p.add_argument('--start-batch',type=int,default=1); p.add_argument('--max-batches',type=int); a=p.parse_args()
    source=load_source()
    print(f'Source MRRs after MRR 2: {len(source)}; size={a.batch_size}')
    db=connect()
    try:
        cur=db.cursor(); f=firm(cur)
        cur.execute("SELECT id,name FROM suppliers"); suppliers={norm(x[1]):x[0] for x in cur.fetchall()}
        cur.execute("SELECT id,erpCode FROM materials WHERE firmId=%s AND LOWER(type)='reel'",(f[0],)); mats={s(x[1]):x[0] for x in cur.fetchall()}
        cur.execute("SELECT transactionNo FROM material_in"); existing_mrr={s(x[0]) for x in cur.fetchall()}
        print(f'Unit-I firm={f[1]}; existing MRRs={len(existing_mrr)}; existing Reel materials={len(mats)}')
        plans=[]; skipped=[]
        for parent in source:
            if parent['no'] in existing_mrr: skipped.append((parent['no'],'already exists')); continue
            if norm(parent['supplier']) not in suppliers: skipped.append((parent['no'],'supplier missing')); continue
            erps={s(v[9]) for v in parent['rows']}; missing=sorted(e for e in erps if e not in mats)
            reels=[s(v[6]) for v in parent['rows']]
            if missing: skipped.append((parent['no'],'ERP missing '+','.join(missing))); continue
            if len(reels)!=len(set(reels)): skipped.append((parent['no'],'duplicate source Our Reel')); continue
            plans.append(parent)
        batches=chunks(plans,a.batch_size); selected=batches[a.start_batch-1:(a.start_batch-1+a.max_batches if a.max_batches else None)]
        print(f'Eligible MRRs={len(plans)}; skipped={len(skipped)}; batches={len(batches)}; selected={len(selected)}')
        for x in skipped[:20]: print('SKIP',x[0],x[1])
        if not a.apply: print('DRY RUN: no database changes committed.'); return
        for bi,batch in enumerate(selected,a.start_batch):
            db.begin(); cur=db.cursor(); inserted=0; slip_count=0
            try:
                for parent in batch:
                    if parent['no'] in existing_mrr: continue
                    supplier_id=suppliers[norm(parent['supplier'])]; parent_id=str(uuid.uuid4()); now=datetime.now(timezone.utc).isoformat(); groups=OrderedDict()
                    for v in parent['rows']:
                        erp=s(v[9]); g=groups.setdefault(erp,{'materialId':mats[erp],'qty':0,'rate':num(v[14]),'poRate':num(v[16]) or 0,'reels':[]}); g['qty']+=num(v[13]); g['reels'].append({'supplierReelNo':s(v[7]),'ourReelNo':s(v[6]),'weightKg':num(v[13]),'supplierPoNo':s(v[3]),'ourPoNo':s(v[2]).split(' - ')[0]})
                    lines=[]; total=0
                    for erp,g in groups.items():
                        lid=str(uuid.uuid4()); value=round(g['qty']*g['rate'],2); total+=value; lines.append({'id':lid,'itemId':g['materialId'],'itemSource':'MAT','qty':round(g['qty'],2),'invoiceQty':round(g['qty'],2),'actualQty':round(g['qty'],2),'uom':'KG','invoiceRate':g['rate'],'rate':g['rate'],'poRate':g['poRate'],'invoiceValue':value,'actualValue':value,'gstRate':5,'cgstRate':2.5,'sgstRate':2.5,'igstRate':0,'reels':g['reels']})
                        for r in g['reels']:
                            sid=str(uuid.uuid4()); cur.execute("INSERT INTO material_in_packing_slips (id,firmId,supplierId,materialInId,materialLineId,materialId,supplierReelNo,ourReelNo,weightKg,openingRate,supplierPoNo,ourPoNo,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",(sid,f[0],supplier_id,parent_id,lid,g['materialId'],r['supplierReelNo'],r['ourReelNo'],r['weightKg'],g['rate'],r['supplierPoNo'],r['ourPoNo'],'Sheet MRR Import',now)); slip_count+=1
                    gst=round(total*.05,2); tx=app_mrr_no(parent['no']); source_ref=f'Google Sheet MRR FORM: {parent["no"]}'; args=(parent_id,tx,'Reel',now,'sheet-import',parent['date'],parent['invoiceNo'],parent['date'],supplier_id,total,total,total,gst/2,gst/2,0,round(total+gst,2),0,0,0,0,0,0,round(total+gst,2),json.dumps(lines),'Completed',source_ref,'Sheet MRR Import',now,f[0]); q="INSERT INTO material_in (id,transactionNo,mrrType,timestamp,entryEmailId,date,invoiceNo,invDate,supplierId,totalPoValue,totalInvoiceValue,totalActualValue,totalCgst,totalSgst,totalIgst,totalInvoiceValueAfterGst,insurance,otherCharges,expenseCGST,expenseSGST,expenseIGST,roundOff,totalAmount,`lines`,status,mrrSource,updatedBy,updateTimestamp,firmId) VALUES ("+','.join(['%s']*len(args))+")"; cur.execute(q,args); cur.execute("UPDATE material_in SET phTimestamp=%s,phEmailId='migration-approval',accTimestamp=%s,accEmailId='migration-approval',mdTimestamp=%s,mdEmailId='migration-approval',tallyTimestamp=%s WHERE id=%s",(now,now,now,now,parent_id)); inserted+=1; existing_mrr.add(tx)
                db.commit(); print(f'Batch {bi} committed: mrrs={inserted}; reels={slip_count}')
            except Exception: db.rollback(); raise
    finally: db.close()
if __name__=='__main__': main()
