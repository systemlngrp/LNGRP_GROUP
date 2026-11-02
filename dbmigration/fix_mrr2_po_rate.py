import json, sys
from migrate_daily_bk_orders_jobs import load_runtime_env, connect

def main():
    load_runtime_env(); db=connect()
    try:
        db.begin(); cur=db.cursor()
        cur.execute("SELECT id, `lines` FROM material_in WHERE transactionNo=%s FOR UPDATE", ('2',))
        row=cur.fetchone()
        if not row: raise RuntimeError('MRR 2 not found')
        lines=json.loads(row[1]) if isinstance(row[1], str) else row[1]
        po_rate=32.50; total_po=0
        for line in lines:
            qty=float(line.get('qty') or line.get('actualQty') or line.get('invoiceQty') or 0)
            line['poRate']=po_rate
            total_po += qty * po_rate
        cur.execute("UPDATE material_in SET `lines`=%s, totalPoValue=%s, updatedBy=%s, updateTimestamp=%s WHERE id=%s", (json.dumps(lines), round(total_po,2), 'PO Rate Correction', '2026-11-01T00:00:00+05:30', row[0]))
        db.commit(); print(f'MRR 2 corrected: lines={len(lines)} poRate={po_rate:.2f} totalPoValue={total_po:.2f}')
    except Exception:
        db.rollback(); raise
    finally: db.close()
if __name__=='__main__': main()
