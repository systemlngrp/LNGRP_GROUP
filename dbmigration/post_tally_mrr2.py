from datetime import datetime, timezone
from migrate_daily_bk_orders_jobs import load_runtime_env, connect

def main():
    load_runtime_env(); db=connect()
    try:
        db.begin(); cur=db.cursor(); cur.execute("SELECT id,status FROM material_in WHERE transactionNo=%s FOR UPDATE",('2',)); row=cur.fetchone()
        if not row: raise RuntimeError('MRR 2 not found')
        now=datetime.now(timezone.utc).isoformat()
        cur.execute("UPDATE material_in SET status='Completed', tallyTimestamp=%s, updatedBy=%s, updateTimestamp=%s WHERE id=%s",(now,'Tally Posting',now,row[0]))
        db.commit(); print('MRR 2 marked Tally posted: status=Completed')
    except Exception:
        db.rollback(); raise
    finally: db.close()
if __name__=='__main__': main()
