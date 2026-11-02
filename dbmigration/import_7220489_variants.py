"""Create 7220489 material variants and import the three blocked Reel MRRs."""
from __future__ import annotations
import sys, uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_reel_mrr_full_workflow import (load_runtime_env, connect, s,
    norm, find_unit_one, load_source, create_one, base_mrr_no)

def find_group(cur):
    cur.execute("SELECT id, name FROM material_groups ORDER BY name")
    rows = cur.fetchall()
    return next((r[0] for r in rows if norm(r[1]) == "reel"), rows[0][0] if rows else None)

SID = "1MAZwiGb5bgNXyAW-Bv4LfrdBF6mtYLyNco5IUDPnCfQ"
TARGETS = {"26-27/0616": "7220489", "26-27/0623": "7220489A", "26-27/0627": "7220489"}

def main():
    import argparse
    p = argparse.ArgumentParser(); p.add_argument("--apply", action="store_true")
    a = p.parse_args(); load_runtime_env()
    parents = {p["sourceNo"]: p for p in load_source() if p["sourceNo"] in TARGETS}
    if set(parents) != set(TARGETS): raise RuntimeError(f"Missing target source rows: {sorted(set(TARGETS)-set(parents))}")
    # The first sheet specification keeps the original ERP; the conflicting
    # 206 cm / 140 GSM specification is represented by the A variant.
    for source_no, erp in TARGETS.items():
        for row in parents[source_no]["rows"]:
            if erp == "7220489A": row[9] = erp
    db = connect()
    try:
        cur = db.cursor(); firm = find_unit_one(cur); group = find_group(cur)
        cur.execute("SELECT id,erpCode FROM materials WHERE firmId=%s AND LOWER(type)='reel'", (firm[0],))
        materials = {s(r[1]): r[0] for r in cur.fetchall()}
        specs = {
            "7220489": (220.5, 120, 18, "7220489 - Size: 220.5 CM X GSM: 120 X BF: 18 Color - Natural"),
            "7220489A": (206, 140, 18, "7220489A - Size: 206 CM X GSM: 140 X BF: 18 Color - Natural"),
        }
        print("Unit-I:", firm[1]); print("Targets:", ", ".join(f"{k}->{v}" for k,v in TARGETS.items()))
        for erp, (size, gsm, bf, name) in specs.items():
            print(f"MATERIAL {erp}: {'exists' if erp in materials else 'will create'}; {name}")
        for source_no, parent in parents.items():
            tx = base_mrr_no(source_no)
            cur.execute("SELECT id FROM material_in WHERE transactionNo=%s", (tx,))
            print(f"MRR {source_no}: {'already exists' if cur.fetchone() else 'will import'}; reels={len(parent['rows'])}")
        if not a.apply:
            print("DRY RUN: no database changes committed."); return
        db.begin(); now = datetime.now(timezone.utc).isoformat()
        for erp, (size, gsm, bf, name) in specs.items():
            if erp not in materials:
                mid = str(uuid.uuid4())
                cur.execute("INSERT INTO materials (id,firmId,type,erpCode,name,uom,materialGroupId,color,size,gsm,bf,active,updatedBy,updateTimestamp) VALUES (%s,%s,'Reel',%s,%s,'KGS',%s,'Natural',%s,%s,%s,'Yes','7220489 Variant Import',%s)", (mid, firm[0], erp, name, group, size, gsm, bf, now))
                materials[erp] = mid
        db.commit()
        suppliers = {}
        cur.execute("SELECT id,name FROM suppliers"); suppliers = {norm(r[1]): r[0] for r in cur.fetchall()}
        for source_no in ("26-27/0616", "26-27/0623", "26-27/0627"):
            tx = base_mrr_no(source_no)
            cur.execute("SELECT id FROM material_in WHERE transactionNo=%s", (tx,))
            if cur.fetchone():
                print(f"SKIPPED source={source_no} transactionNo={tx} (already exists)")
                continue
            db.begin()
            try:
                tx, ind, po, gate, reels = create_one(cur, firm, suppliers, materials, parents[source_no])
                db.commit(); print(f"COMMITTED source={source_no} transactionNo={tx} gate={gate} reels={reels}")
            except Exception:
                db.rollback(); raise
    finally: db.close()

if __name__ == "__main__": main()
