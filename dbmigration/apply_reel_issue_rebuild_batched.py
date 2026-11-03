import sys, uuid, json
from pathlib import Path
from collections import defaultdict
from openpyxl import load_workbook
sys.path.insert(0,'D:\\LNGRP\\dbmigration')
from migrate_daily_bk_orders_jobs import load_runtime_env,connect
from import_reel_issue_register_batches import BOOK,s,n

BATCH=100; MAP=Path('D:/LNGRP/dbmigration/reel_issue_line_map.json')
load_runtime_env(); db=connect(); c=db.cursor()
try:
 c.execute('SELECT id,materialIssueId,materialId,packingSlipId,ourReelNo,weightKg,productionId,jobNo FROM material_issue_reel_lines'); reels=c.fetchall()
 c.execute('SELECT id,ourReelNo,openingRate FROM material_in_packing_slips'); slips={s(r[1]):r for r in c.fetchall()}
 c.execute('SELECT id FROM material_issue_lines'); old=[str(r[0]) for r in c.fetchall()]
 groups=defaultdict(list)
 for r in reels: groups[(str(r[1]),str(r[2]))].append(r)
 mp=json.loads(MAP.read_text()) if MAP.exists() else {}
 # create replacement lines, committing every batch
 todo=[]
 for k,items in groups.items():
  if k in mp: continue
  qty=sum(float(x[5] or 0) for x in items); amt=0
  for x in items:
   sl=slips.get(s(x[4])); amt+=float(x[5] or 0)*(float(sl[2] or 0) if sl else 0)
  todo.append((k,items,qty,amt))
 for start in range(0,len(todo),BATCH):
  batch=todo[start:start+BATCH]; db.begin()
  try:
   for (iid,mid),items,qty,amt in batch:
    lid=str(uuid.uuid4()); rate=amt/qty if qty else 0
    c.execute("INSERT INTO material_issue_lines (id,materialIssueId,materialId,qty,uom,rate,amount,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,'KG',%s,%s,'Reel Issue Item Rebuild',NOW())",(lid,iid,mid,qty,rate,amt)); mp[f'{iid}|{mid}']=lid
   db.commit(); MAP.write_text(json.dumps(mp),encoding='utf-8'); print('created batch',start//BATCH+1,'/',(len(todo)+BATCH-1)//BATCH)
  except: db.rollback(); raise
 # repoint reel lines in batches
 for start in range(0,len(reels),BATCH):
  db.begin()
  try:
   for r in reels[start:start+BATCH]: c.execute('UPDATE material_issue_reel_lines SET materialIssueLineId=%s WHERE id=%s',(mp[f'{r[1]}|{r[2]}'],r[0]))
   db.commit(); print('repointed batch',start//BATCH+1,'/',(len(reels)+BATCH-1)//BATCH)
  except: db.rollback(); raise
 # delete old lines only after all reel references moved
 for start in range(0,len(old),BATCH):
  db.begin()
  try:
   for lid in old[start:start+BATCH]: c.execute('DELETE FROM material_issue_lines WHERE id=%s',(lid,))
   db.commit(); print('deleted old batch',start//BATCH+1,'/',(len(old)+BATCH-1)//BATCH)
  except: db.rollback(); raise
 print('REBUILD COMPLETE replacement_lines',len(mp),'reel_lines',len(reels),'old_deleted',len(old))
finally: db.close()
