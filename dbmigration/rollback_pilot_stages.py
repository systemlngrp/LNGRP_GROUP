import sys
sys.path.insert(0, 'dbmigration')
from reel_db_stock import _load_runtime_env, _connect
_load_runtime_env(); db=_connect(); c=db.cursor(); db.begin()
try:
    c.execute("SELECT id FROM purchase_orders WHERE poNo='PO/26-27/00001'"); po=c.fetchone()
    c.execute("SELECT id FROM indents WHERE indentNo='IND/26-27/00001'"); ind=c.fetchone()
    c.execute("SELECT id FROM gate_entries WHERE gateEntryNo='GE/26-27/00001'"); gate=c.fetchone()
    if po: c.execute("DELETE FROM purchase_order_lines WHERE purchaseOrderId=%s", (po['id'],)); c.execute("DELETE FROM purchase_orders WHERE id=%s", (po['id'],))
    if ind: c.execute("DELETE FROM indent_lines WHERE indentId=%s", (ind['id'],)); c.execute("DELETE FROM indents WHERE id=%s", (ind['id'],))
    if gate: c.execute("DELETE FROM gate_entries WHERE id=%s", (gate['id'],))
    db.commit(); print('Rolled back pilot Indent, PO, and Gate Entry. MRR was already rolled back.')
except Exception as e: db.rollback(); print('ERROR:',e); sys.exit(1)
finally: db.close()
