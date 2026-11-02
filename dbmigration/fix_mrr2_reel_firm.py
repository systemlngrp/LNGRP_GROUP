from migrate_daily_bk_orders_jobs import load_runtime_env, connect
import re

def main():
    load_runtime_env(); db=connect()
    try:
        db.begin(); cur=db.cursor(); cur.execute("SELECT id,firmName FROM firms ORDER BY firmName")
        firm=next(x for x in cur.fetchall() if re.search(r'unit\s*[- ]?i\b',str(x[1]),re.I) and not re.search(r'unit\s*[- ]?ii\b',str(x[1]),re.I))
        cur.execute("UPDATE material_in_packing_slips SET firmId=%s, updatedBy=%s, updateTimestamp=%s WHERE materialInId=(SELECT id FROM material_in WHERE transactionNo=%s)",(firm[0],'Firm Ownership Correction','2026-11-01T00:00:00+05:30','2'))
        db.commit(); print(f'Updated MRR 2 Reel slips: {cur.rowcount}; firm={firm[1]}')
    except Exception:
        db.rollback(); raise
    finally: db.close()
if __name__=='__main__': main()
