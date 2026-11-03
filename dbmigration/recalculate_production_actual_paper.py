"""Recalculate productions.actualPaperUsed from Job issues minus Job returns."""
import json, os, sys
import argparse
from datetime import datetime
sys.path.insert(0, r"D:\LNGRP\dbmigration")
from migrate_daily_bk_orders_jobs import load_runtime_env, connect

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--apply', action='store_true'); ap.add_argument('--batch-size', type=int, default=100)
    args = ap.parse_args()
    load_runtime_env(); db = connect(); cur = db.cursor()
    backup = os.path.join(os.path.dirname(__file__), "production_actual_paper_backup_" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".json")
    try:
        cur.execute("SELECT id, actualPaperUsed, status FROM productions")
        before = [{"id": r[0], "actualPaperUsed": r[1], "status": r[2]} for r in cur.fetchall()]
        with open(backup, "w", encoding="utf-8") as f: json.dump(before, f, default=str, indent=2)
        cur.execute("""SELECT i.productionId, COALESCE(SUM(l.qty),0)
                       FROM material_issues i JOIN material_issue_lines l ON l.materialIssueId=i.id
                       WHERE i.issueType='Job' AND COALESCE(TRIM(i.productionId),'')<>''
                       GROUP BY i.productionId""")
        issues = {str(r[0]): float(r[1] or 0) for r in cur.fetchall()}
        cur.execute("""SELECT r.productionId, COALESCE(SUM(l.qty),0)
                       FROM material_returns r JOIN material_return_lines l ON l.materialReturnId=r.id
                       WHERE r.returnType='Job' AND COALESCE(TRIM(r.productionId),'')<>''
                       GROUP BY r.productionId""")
        returns = {str(r[0]): float(r[1] or 0) for r in cur.fetchall()}
        cur.execute("SELECT id, COALESCE(actualPaperUsed,0) FROM productions")
        rows = cur.fetchall(); changes=[]
        for pid, old in rows:
            value = max(0.0, round(issues.get(str(pid), 0.0) - returns.get(str(pid), 0.0), 5))
            if abs(float(old or 0) - value) > 0.000001:
                changes.append((value, pid, float(old or 0)))
        print(f"Productions scanned: {len(rows)}")
        print(f"Issue-linked productions: {len(issues)}; return-linked productions: {len(returns)}")
        print(f"Fields to update: {len(changes)}")
        for value,pid,old in changes[:10]: print(f"{pid}: {old} -> {value}")
        if not args.apply:
            print(f"DRY RUN: no changes committed. Backup: {backup}"); return
        batch_size = max(1, args.batch_size)
        for start in range(0, len(changes), batch_size):
            db.begin()
            try:
                for value,pid,_ in changes[start:start + batch_size]:
                    cur.execute("UPDATE productions SET actualPaperUsed=%s WHERE id=%s", (value, pid))
                db.commit()
                print(f"Committed batch {start // batch_size + 1}: {start + 1}-{min(start + batch_size, len(changes))}", flush=True)
            except Exception:
                db.rollback(); raise
        print(f"Applied actualPaperUsed updates: {len(changes)}")
        print(f"Backup: {backup}")
    finally: db.close()

if __name__ == "__main__": main()
