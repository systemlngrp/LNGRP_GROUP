from datetime import datetime, timezone
from migrate_daily_bk_orders_jobs import load_runtime_env, connect

def main():
    load_runtime_env(); db=connect()
    try:
        db.begin(); cur=db.cursor(); cur.execute("SELECT id,status FROM material_in WHERE transactionNo=%s FOR UPDATE",('2',)); row=cur.fetchone()
        if not row: raise RuntimeError('MRR 2 not found')
        now=datetime.now(timezone.utc).isoformat(); email='migration-approval'
        cur.execute("UPDATE material_in SET status='Pending Tally', phTimestamp=%s, phEmailId=%s, accTimestamp=%s, accEmailId=%s, mdTimestamp=%s, mdEmailId=%s, updatedBy=%s, updateTimestamp=%s WHERE id=%s",(now,email,now,email,now,email,'Migration Approval',now,row[0]))
        db.commit(); print('MRR 2 approved: Plant Head -> Accounts -> MD; status=Pending Tally')
    except Exception:
        db.rollback(); raise
    finally: db.close()
if __name__=='__main__': main()
