import sys
sys.path.insert(0, 'dbmigration')
from reel_db_stock import _load_runtime_env, _connect
_load_runtime_env(); db=_connect(); c=db.cursor(); db.begin()
try:
    formatted='LNCB-1/MRR/26-27/00002'
    c.execute("SELECT id,gateEntryId,transactionNo FROM material_in WHERE transactionNo=%s", ('2',)); row=c.fetchone()
    if not row: raise RuntimeError('Pilot MRR 2 not found')
    c.execute("SELECT id FROM material_in WHERE transactionNo=%s", (formatted,))
    if c.fetchone(): raise RuntimeError('Formatted MRR number already exists')
    c.execute("UPDATE material_in SET transactionNo=%s WHERE id=%s", (formatted,row['id']))
    c.execute("UPDATE gate_entries SET mrrNo=%s WHERE id=%s", (formatted,row['gateEntryId']))
    db.commit(); print('Updated:', formatted)
except Exception as e:
    db.rollback(); print('ERROR:', e); sys.exit(1)
finally: db.close()
