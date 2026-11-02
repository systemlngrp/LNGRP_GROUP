"""Clear persisted material opening balances; dry-run unless --apply is given."""
from __future__ import annotations
import argparse, os
from pathlib import Path
import pymysql

def load_env():
    for path in (Path.cwd()/'.env', Path(__file__).resolve().parents[1]/'.env'):
        if path.is_file():
            for raw in path.read_text(encoding='utf-8').splitlines():
                if '=' in raw and not raw.lstrip().startswith('#'):
                    k, v = raw.split('=', 1); os.environ.setdefault(k.strip(), v.strip().strip('"\''))
            return

def main():
    p = argparse.ArgumentParser(); p.add_argument('--apply', action='store_true'); a = p.parse_args()
    load_env()
    db = pymysql.connect(host=os.environ['DB_HOST'], port=int(os.getenv('DB_PORT','3306')), user=os.environ['DB_USER'], password=os.environ['DB_PASSWORD'], database=os.environ['DB_NAME'], cursorclass=pymysql.cursors.DictCursor, autocommit=False)
    try:
        with db.cursor() as c:
            c.execute('SELECT COUNT(*) n, COALESCE(SUM(openingQty),0) qty, COALESCE(SUM(openingValue),0) val FROM material_firm_openings')
            before = c.fetchone(); print(f"Rows: {before['n']}; openingQty={before['qty']}; openingValue={before['val']}")
        if not a.apply:
            print('DRY RUN: no database changes committed.'); return 0
        db.begin()
        with db.cursor() as c:
            c.execute('UPDATE material_firm_openings SET openingQty=0, openingRate=0, openingValue=0, updatedBy=%s, updateTimestamp=%s', ('Opening Balance Reset', '2026-11-01T00:00:00+05:30'))
            print(f'Updated rows: {c.rowcount}')
        db.commit()
        with db.cursor() as c:
            c.execute('SELECT COALESCE(SUM(openingQty),0) qty, COALESCE(SUM(openingValue),0) val FROM material_firm_openings')
            after = c.fetchone(); print(f"Verified: openingQty={after['qty']}; openingValue={after['val']}")
        return 0
    except Exception as e:
        db.rollback(); print(f'ERROR: {e}'); return 1
    finally: db.close()

if __name__ == '__main__': raise SystemExit(main())
