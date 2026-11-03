import sys,uuid
from collections import defaultdict
from datetime import date
from openpyxl import load_workbook
sys.path.insert(0,'D:\\LNGRP\\dbmigration')
from migrate_daily_bk_orders_jobs import load_runtime_env,connect
from import_reel_issue_register_batches import BOOK,s,n

UNIT='aa3fba0d-fef9-4b6f-88c3-ba073b6f6388'; BATCH=100
load_runtime_env(); db=connect(); c=db.cursor()
try:
 c.execute('SELECT id,jobCardNo,transactionNo FROM productions'); prods=c.fetchall()
 def keys(v):
  t=s(v); out={t,t.lstrip('0') or '0'}
  if '/' in t:
   z=t.rsplit('/',1)[-1]; out|={z,z.lstrip('0') or '0'}
  return out
 pmap=defaultdict(set)
 for p in prods:
  for k in keys(p[1])|keys(p[2]): pmap[k].add(p[0])
 c.execute('SELECT ps.id,ps.ourReelNo,ps.materialId,m.erpCode,m.size,m.gsm,m.bf FROM material_in_packing_slips ps LEFT JOIN materials m ON m.id=ps.materialId'); slips=defaultdict(list)
 for x in c.fetchall(): slips[s(x[1])].append(x)
 ws=load_workbook(BOOK,read_only=True,data_only=True)['Reel Return Register']; raw=[]
 for rn,row in enumerate(ws.iter_rows(min_row=2,values_only=True),2):
  if not any(row): continue
  d=row[1]; raw.append({'row':rn,'rid':s(row[0]),'date':d.strftime('%Y-%m-%d'),'job':s(row[2]),'reel':s(row[4]),'erp':s(row[5]),'size':n(row[6]),'gsm':n(row[7]),'bf':n(row[8]),'weight':n(row[9]),'rate':n(row[10]),'transfer':s(row[12])})
 dupkeys=defaultdict(list)
 for r in raw: dupkeys[(r['date'],r['job'],r['reel'],r['weight'])].append(r)
 keep=set(); duplicate_extras=set()
 for k,vals in dupkeys.items():
  if len({x['rid'] for x in vals})>1:
   keep.add(vals[0]['row']); duplicate_extras.update(x['row'] for x in vals[1:])
  else: keep.update(x['row'] for x in vals)
 valid=[]; excluded_mismatch=0
 for r in raw:
  if r['row'] in duplicate_extras: continue
  if len(pmap.get(r['job'],set()))!=1 or len(slips.get(r['reel'],[]))!=1 or r['weight']<=0: continue
  sl=slips[r['reel']][0]
  if not (s(sl[3])==r['erp'] and n(sl[4])==r['size'] and n(sl[5])==r['gsm'] and n(sl[6])==r['bf']): excluded_mismatch+=1; continue
  r['productionId']=next(iter(pmap[r['job']])); r['slip']=sl; valid.append(r)
 # return number suffix for IDs spanning dates
 dates=defaultdict(set)
 for r in valid: dates[r['rid']].add(r['date'])
 groups=defaultdict(list)
 for r in valid: groups[(r['rid'],r['job'],r['date'])].append(r)
 c.execute("SELECT returnNo FROM material_returns WHERE updatedBy='Reel Return Workbook Import'"); existing={s(x[0]) for x in c.fetchall()}
 pending=[]
 for k,vals in groups.items():
  rid,job,dt=k; rn='RET-'+rid+(('-'+dt.replace('-','')) if len(dates[rid])>1 else '')
  if rn not in existing: pending.append((k,vals,rn))
 print('valid_rows',len(valid),'excluded_duplicate_extras',len(duplicate_extras),'excluded_mismatches',excluded_mismatch,'headers',len(groups),'pending_headers',len(pending),'kg',sum(r['weight'] for r in valid),'value',sum(r['weight']*r['rate'] for r in valid))
 for start in range(0,len(pending),BATCH):
  db.begin()
  try:
   for (rid,job,dt),vals,rn in pending[start:start+BATCH]:
    retid=str(uuid.uuid4()); remarks='Imported from Reel Return Register'
    if any(v['transfer'].lower()=='yes' for v in vals): remarks+=' | Source Job Transfer = Yes'
    pid=vals[0]['productionId']; c.execute("INSERT INTO material_returns (id,returnNo,date,returnType,productionId,jobNo,remarks,updatedBy,updateTimestamp,firmId) VALUES (%s,%s,%s,'Job',%s,%s,%s,'Reel Return Workbook Import',NOW(),%s)",(retid,rn,dt,pid,job,remarks,UNIT))
    bymat=defaultdict(list)
    for r in vals: bymat[str(r['slip'][2])].append(r)
    for mid,rs in bymat.items():
     qty=sum(r['weight'] for r in rs); amt=sum(r['weight']*r['rate'] for r in rs); lid=str(uuid.uuid4())
     c.execute("INSERT INTO material_return_lines (id,materialReturnId,materialId,qty,uom,rate,amount,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,'KG',%s,%s,'Reel Return Workbook Import',NOW())",(lid,retid,mid,qty,amt/qty if qty else 0,amt))
     for r in rs:
      c.execute("INSERT INTO material_return_reel_lines (id,materialReturnId,materialReturnLineId,materialId,packingSlipId,ourReelNo,weightKg,productionId,jobNo,updatedBy,updateTimestamp,jobTransfer) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'Reel Return Workbook Import',NOW(),'No')",(str(uuid.uuid4()),retid,lid,mid,r['slip'][0],r['reel'],r['weight'],pid,job))
   db.commit(); print('committed return batch',start//BATCH+1)
  except: db.rollback(); raise
 print('COMPLETE')
finally: db.close()
