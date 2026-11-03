import sys,json
from pathlib import Path
sys.path.insert(0,'D:\\LNGRP\\dbmigration')
from migrate_daily_bk_orders_jobs import load_runtime_env,connect
load_runtime_env(); db=connect(); c=db.cursor()
try:
 c.execute("SELECT * FROM material_issues WHERE updatedBy=%s",('Reel Issue Workbook Import',))
 rows=c.fetchall(); cols=[d[0] for d in c.description]
 if len(rows)!=5781: raise RuntimeError(f'Expected 5781 imported issues, found {len(rows)}')
 out=Path('D:/LNGRP/dbmigration/imported_issue_type_backup.json')
 out.write_text(json.dumps([dict(zip(cols,r)) for r in rows],default=str,indent=2),encoding='utf-8')
 db.begin()
 try:
  c.execute("UPDATE material_issues SET issueType='Job' WHERE updatedBy=%s",('Reel Issue Workbook Import',))
  if c.rowcount!=5781: raise RuntimeError(f'Expected 5781 updates, got {c.rowcount}')
  db.commit()
 except: db.rollback(); raise
 print('updated issueType to Job:',c.rowcount)
 print('backup:',out)
finally: db.close()
