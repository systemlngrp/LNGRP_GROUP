from datetime import datetime, timezone
from migrate_daily_bk_orders_jobs import load_runtime_env, connect

def main():
    load_runtime_env(); db=connect()
    try:
        db.begin(); cur=db.cursor(); now=datetime.now(timezone.utc).isoformat()
        cur.execute("UPDATE material_in SET status='Completed', phTimestamp=COALESCE(phTimestamp,%s), phEmailId=COALESCE(phEmailId,'migration-approval'), accTimestamp=COALESCE(accTimestamp,%s), accEmailId=COALESCE(accEmailId,'migration-approval'), mdTimestamp=COALESCE(mdTimestamp,%s), mdEmailId=COALESCE(mdEmailId,'migration-approval'), tallyTimestamp=COALESCE(tallyTimestamp,%s), updatedBy='Migration Approval', updateTimestamp=%s WHERE updatedBy='Sheet MRR Import' AND status <> 'Completed'",(now,now,now,now,now))
        db.commit(); print(f'Completed approvals and Tally posting for {cur.rowcount} MRRs')
    except Exception: db.rollback(); raise
    finally: db.close()
if __name__=='__main__': main()
