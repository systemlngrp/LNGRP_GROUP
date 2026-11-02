import json, sys
from datetime import datetime, timezone
sys.path.insert(0, 'dbmigration')
from reel_db_stock import _load_runtime_env, _connect
_load_runtime_env(); db=_connect(); c=db.cursor(); c.execute("SELECT `lines` FROM material_in WHERE transactionNo=%s", ('LNCB-1/MRR/26-27/00002',)); row=c.fetchone()
if not row: raise SystemExit('Pilot MRR not found')
lines=json.loads(row['lines']) if isinstance(row['lines'], str) else row['lines']; ids=[str(x.get('itemId')) for x in lines if x.get('itemId')]; ts=datetime.now(timezone.utc).isoformat(); db.begin()
try:
    for material_id in ids:
        c.execute("UPDATE materials SET color=%s, name=REPLACE(name, 'Color - LG', 'Color - Natural'), updatedBy=%s, updateTimestamp=%s WHERE id=%s", ('Natural','Natural Color Migration',ts,material_id))
    db.commit(); print('Updated pilot materials:', c.rowcount)
except Exception as e: db.rollback(); print('ERROR:', e); raise
finally: db.close()
