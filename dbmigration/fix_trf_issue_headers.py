import sys,json
from pathlib import Path
from datetime import datetime,date
sys.path.insert(0,'D:\\LNGRP\\dbmigration')
from migrate_daily_bk_orders_jobs import load_runtime_env,connect

UNIT='aa3fba0d-fef9-4b6f-88c3-ba073b6f6388'
load_runtime_env(); db=connect(); c=db.cursor()
try:
 c.execute("SELECT * FROM material_issues WHERE remarks=%s AND issueNo LIKE 'REEL-TRF-%%'",('Imported from Reel Issue Register TRF as ordinary issue',))
 rows=c.fetchall(); cols=[d[0] for d in c.description]
 if len(rows)!=37: raise RuntimeError(f'Expected 37 TRF issues, found {len(rows)}')
 out=Path('D:/LNGRP/dbmigration')/'trf_issue_header_backup.json'
 out.write_text(json.dumps([dict(zip(cols,r)) for r in rows],default=str,indent=2),encoding='utf-8')
 db.begin()
 try:
  for r in rows:
   iid=r[0]; raw=r[3]
   if isinstance(raw,datetime): d=raw.strftime('%Y-%m-%d')
   elif isinstance(raw,date): d=raw.strftime('%Y-%m-%d')
   else: d=str(raw)[:10]
   c.execute("UPDATE material_issues SET firmId=%s,date=%s WHERE id=%s",(UNIT,d,iid))
  db.commit()
 except: db.rollback(); raise
 print('updated',len(rows),'TRF issue headers')
 print('backup',out)
finally: db.close()
