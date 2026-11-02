import sys
from datetime import datetime, timezone
sys.path.insert(0, 'dbmigration')
from reel_db_stock import _load_runtime_env, _connect
_load_runtime_env(); db=_connect(); c=db.cursor(); ts=datetime.now(timezone.utc).isoformat(); c.execute("UPDATE material_in SET status=%s, tallyTimestamp=%s WHERE transactionNo=%s", ('Completed', ts, '2')); db.commit(); print('Updated:', c.rowcount, 'tallyTimestamp:', ts); db.close()
