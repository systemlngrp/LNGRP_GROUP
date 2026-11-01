"""Safely remove the ten direct-import MRRs created after the pilot.

Dry-run by default. Only the explicitly listed transaction numbers are targeted;
the pilot MRR is protected by an assertion and opening-stock slips are untouched.
"""
import argparse
import sys

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from migrate_daily_bk_orders_jobs import load_runtime_env, connect

TARGETS = ("969", "994", "995", "1009", "1012", "1014", "1022", "1026", "1038", "1039")
PILOT = "LNCB-1/MRR/26-27/00002"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    load_runtime_env()
    db = connect()
    placeholders = ",".join(["%s"] * len(TARGETS))
    try:
        cur = db.cursor()
        cur.execute(
            f"SELECT id, transactionNo, date, status FROM material_in WHERE transactionNo IN ({placeholders}) ORDER BY transactionNo",
            TARGETS,
        )
        rows = cur.fetchall()
        cur.execute("SELECT id FROM material_in WHERE transactionNo=%s", (PILOT,))
        if not cur.fetchone():
            raise RuntimeError("Pilot MRR was not found; refusing to delete anything.")
        ids = [r[0] for r in rows]
        slip_count = 0
        dependent = 0
        if ids:
            ip = ",".join(["%s"] * len(ids))
            cur.execute(f"SELECT COUNT(*) FROM material_in_packing_slips WHERE materialInId IN ({ip})", ids)
            slip_count = int(cur.fetchone()[0])
            cur.execute(
                f"""SELECT COUNT(*) FROM material_issue_reel_lines l
                    JOIN material_in_packing_slips p ON p.id=l.packingSlipId
                    WHERE p.materialInId IN ({ip})""",
                ids,
            )
            dependent += int(cur.fetchone()[0])
            cur.execute(
                f"""SELECT COUNT(*) FROM material_return_reel_lines l
                    JOIN material_in_packing_slips p ON p.id=l.packingSlipId
                    WHERE p.materialInId IN ({ip})""",
                ids,
            )
            dependent += int(cur.fetchone()[0])
        print(f"Target MRRs found: {len(rows)}/{len(TARGETS)}")
        for row in rows:
            print(f"  {row[1]} | {row[2]} | {row[3]} | {row[0]}")
        print(f"Related real-MRR slips: {slip_count}")
        print(f"Dependent issue/return lines: {dependent}")
        if len(rows) != len(TARGETS):
            raise RuntimeError("Not all expected post-pilot MRRs were found; refusing to delete.")
        if dependent:
            raise RuntimeError("Dependent issue/return history exists; refusing to delete.")
        if not args.apply:
            print("DRY RUN: no database changes committed.")
            return 0
        db.begin()
        cur.execute(f"DELETE FROM material_in_packing_slips WHERE materialInId IN ({placeholders})", ids)
        deleted_slips = cur.rowcount
        cur.execute(f"DELETE FROM material_in WHERE id IN ({placeholders})", ids)
        deleted_mrrs = cur.rowcount
        db.commit()
        print(f"APPLIED: deleted MRRs={deleted_mrrs}; real-MRR slips={deleted_slips}")
        print("Preserved: pilot MRR, materials, opening stock, orders, schedules, and Google Sheets.")
        return 0
    except Exception as exc:
        db.rollback()
        print(f"ERROR: {exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
