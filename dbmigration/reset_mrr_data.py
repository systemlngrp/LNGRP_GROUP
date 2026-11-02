"""Reset material receipts for a fresh MRR import.

Dry-run by default. --apply deletes only material_in rows and their real-MRR
packing slips. Opening-stock slips (materialInId=OPENING) are never touched.
The script refuses to delete MRRs whose slips are already used by issue/return
transactions, so inventory history is not silently broken.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import pymysql


def load_env() -> None:
    for path in (Path.cwd() / ".env", Path(__file__).resolve().parents[1] / ".env"):
        if path.is_file():
            for raw in path.read_text(encoding="utf-8").splitlines():
                if "=" in raw and not raw.lstrip().startswith("#"):
                    key, value = raw.split("=", 1)
                    os.environ.setdefault(key.strip(), value.strip().strip("\"'"))
            return


def connect():
    load_env()
    return pymysql.connect(
        host=os.environ["DB_HOST"], port=int(os.getenv("DB_PORT", "3306")),
        user=os.environ["DB_USER"], password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"], connect_timeout=15, read_timeout=60,
        write_timeout=60, cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    db = connect()
    try:
        with db.cursor() as cur:
            cur.execute("SELECT id, transactionNo, date, status FROM material_in ORDER BY date, transactionNo")
            mrrs = cur.fetchall()
            cur.execute("SELECT COUNT(*) AS n FROM material_in_packing_slips WHERE UPPER(TRIM(materialInId)) <> 'OPENING'")
            slips = int(cur.fetchone()["n"])
            cur.execute("SELECT COUNT(*) AS n FROM material_in_packing_slips WHERE UPPER(TRIM(materialInId)) = 'OPENING'")
            opening = int(cur.fetchone()["n"])
            cur.execute("""SELECT COUNT(*) AS n
                FROM material_issue_reel_lines l
                JOIN material_in_packing_slips p ON p.id=l.packingSlipId
                WHERE UPPER(TRIM(p.materialInId)) <> 'OPENING'""")
            issued = int(cur.fetchone()["n"])
            cur.execute("""SELECT COUNT(*) AS n
                FROM material_return_reel_lines l
                JOIN material_in_packing_slips p ON p.id=l.packingSlipId
                WHERE UPPER(TRIM(p.materialInId)) <> 'OPENING'""")
            returned = int(cur.fetchone()["n"])
        print(f"MRR records: {len(mrrs)}")
        print(f"Real-MRR packing slips: {slips}")
        print(f"Opening-stock packing slips preserved: {opening}")
        print(f"Dependent issue lines: {issued}")
        print(f"Dependent return lines: {returned}")
        if not args.apply:
            print("DRY RUN: no database changes committed.")
            return 0
        if issued or returned:
            raise RuntimeError("Refusing to delete: real-MRR packing slips have issue/return history.")
        db.begin()
        with db.cursor() as cur:
            cur.execute("DELETE FROM material_in_packing_slips WHERE UPPER(TRIM(materialInId)) <> 'OPENING'")
            deleted_slips = cur.rowcount
            cur.execute("DELETE FROM material_in")
            deleted_mrrs = cur.rowcount
        db.commit()
        print(f"APPLIED: deleted MRRs={deleted_mrrs}; real-MRR packing slips={deleted_slips}")
        print("Preserved: materials, opening stock, orders, schedules, production plans, Google Sheets.")
        return 0
    except Exception as exc:
        db.rollback()
        print(f"ERROR: {exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
