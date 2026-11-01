"""Change migration-created Reel Indents from Raw Material to Reel."""
import argparse, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from migrate_daily_bk_orders_jobs import load_runtime_env, connect

def main():
    p = argparse.ArgumentParser(); p.add_argument('--apply', action='store_true'); args = p.parse_args()
    load_runtime_env(); db = connect()
    try:
        cur = db.cursor()
        cur.execute("SELECT id, indentNo, indentType, updatedBy FROM indents WHERE indentType='Raw Material' AND updatedBy IN ('Migration Pilot','Sheet MRR Import') ORDER BY indentNo")
        rows = cur.fetchall()
        print(f"Migration Reel Indents found: {len(rows)}")
        for row in rows: print(f"  {row[1]} | {row[2]} | {row[3]} | {row[0]}")
        if not args.apply:
            print('DRY RUN: no database changes committed.'); return
        db.begin()
        cur.execute("UPDATE indents SET indentType='Reel' WHERE indentType='Raw Material' AND updatedBy IN ('Migration Pilot','Sheet MRR Import')")
        changed = cur.rowcount; db.commit(); print(f'APPLIED: updated={changed}; indentType=Reel')
    except Exception as exc:
        db.rollback(); print(f'ERROR: {exc}'); raise
    finally: db.close()
if __name__ == '__main__': main()
