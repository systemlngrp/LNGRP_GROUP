import json, sys
sys.path.insert(0, 'dbmigration')
from reel_db_stock import _load_runtime_env, _connect
_load_runtime_env(); db=_connect(); c=db.cursor(); c.execute("SELECT id,`lines` FROM material_in WHERE transactionNo=%s", ('LNCB-1/MRR/26-27/00002',)); row=c.fetchone()
if not row: raise SystemExit('Pilot MRR not found')
lines=json.loads(row['lines']) if isinstance(row['lines'], str) else row['lines']
for line in lines:
    qty=float(line.get('qty') or line.get('invoiceQty') or 0); rate=float(line.get('rate') or line.get('invoiceRate') or 0); value=round(qty*rate,2)
    line['value']=value; line['amount']=value
c.execute("UPDATE material_in SET `lines`=%s, totalActualValue=%s, totalAmount=%s WHERE id=%s", (json.dumps(lines), sum(float(x.get('value') or 0) for x in lines), sum(float(x.get('value') or 0) for x in lines), row['id']))
db.commit(); print('Updated line values:', len(lines)); db.close()
