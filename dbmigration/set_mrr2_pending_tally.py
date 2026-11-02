import sys
sys.path.insert(0, 'dbmigration')
from reel_db_stock import _load_runtime_env, _connect
_load_runtime_env(); db=_connect(); c=db.cursor(); c.execute("UPDATE material_in SET status=%s, tallyTimestamp=NULL WHERE transactionNo=%s", ('Pending Tally','2')); db.commit(); print('Updated:', c.rowcount); db.close()
