"""Complete Reel Return Register import using database Reel specifications.

Dry-run by default; --apply inserts only missing rows.  Source specification
differences and over-issued weights are allowed.  Confirmed duplicate source
rows remain excluded.
"""
import argparse, sys, uuid
from collections import defaultdict
from decimal import Decimal
from openpyxl import load_workbook

sys.path.insert(0, r"D:\LNGRP\dbmigration")
from migrate_daily_bk_orders_jobs import load_runtime_env, connect
from import_reel_issue_register_batches import BOOK, s, n

UNIT = "aa3fba0d-fef9-4b6f-88c3-ba073b6f6388"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--batch-size", type=int, default=100)
    args = ap.parse_args()
    load_runtime_env(); db = connect(); cur = db.cursor()
    try:
        cur.execute("SELECT id, jobCardNo, transactionNo FROM productions")
        jobs = defaultdict(set)
        def job_keys(v):
            t = s(v); out = {t, t.lstrip("0") or "0"}
            if "/" in t:
                z = t.rsplit("/", 1)[-1]; out |= {z, z.lstrip("0") or "0"}
            return out
        for pid, jc, tr in cur.fetchall():
            for k in job_keys(jc) | job_keys(tr): jobs[k].add(pid)
        cur.execute("""SELECT ps.id, ps.ourReelNo, ps.materialId, ps.materialInId,
                              m.erpCode, m.size, m.gsm, m.bf, mi.transactionNo
                       FROM material_in_packing_slips ps
                       LEFT JOIN materials m ON m.id=ps.materialId
                       LEFT JOIN material_in mi ON mi.id=ps.materialInId""")
        slips = defaultdict(list)
        for row in cur.fetchall(): slips[s(row[1])].append(row)

        ws = load_workbook(BOOK, read_only=True, data_only=True)["Reel Return Register"]
        raw = []
        for row_no, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
            if not any(row): continue
            raw.append({"row": row_no, "rid": s(row[0]), "date": row[1].strftime("%Y-%m-%d"),
                        "job": s(row[2]), "reel": s(row[4]), "weight": n(row[9]), "rate": n(row[10]),
                        "transfer": s(row[12])})
        dup = defaultdict(list)
        for r in raw: dup[(r["date"], r["job"], r["reel"], r["weight"])].append(r)
        duplicate_rows = {v["row"] for vals in dup.values() if len({x["rid"] for x in vals}) > 1 for v in vals[1:]}
        rows = []
        for r in raw:
            if r["row"] in duplicate_rows: continue
            if r["weight"] <= 0 or len(jobs.get(r["job"], set())) != 1 or len(slips.get(r["reel"], [])) != 1: continue
            r["productionId"] = next(iter(jobs[r["job"]])); r["slip"] = slips[r["reel"]][0]; rows.append(r)

        dates = defaultdict(set)
        for r in rows: dates[r["rid"]].add(r["date"])
        groups = defaultdict(list)
        for r in rows: groups[(r["rid"], r["job"], r["date"])].append(r)
        cur.execute("SELECT id, returnNo FROM material_returns WHERE updatedBy='Reel Return Workbook Import'")
        headers = {s(no): rid for rid, no in cur.fetchall()}
        existing = set()
        cur.execute("""SELECT materialReturnId, ourReelNo FROM material_return_reel_lines
                       WHERE updatedBy='Reel Return Workbook Import'""")
        existing = {(str(a), s(b)) for a, b in cur.fetchall()}
        work = []
        for key, vals in groups.items():
            rid, job, dt = key
            ret_no = "RET-" + rid + (("-" + dt.replace("-", "")) if len(dates[rid]) > 1 else "")
            header_id = headers.get(ret_no)
            missing = [r for r in vals if not header_id or (str(header_id), r["reel"]) not in existing]
            if missing: work.append((key, ret_no, header_id, missing))
        total_rows = sum(len(x[3]) for x in work)
        print(f"Source rows: {len(raw)}; duplicate rows excluded: {len(duplicate_rows)}")
        print(f"Canonical rows eligible: {len(rows)}; missing rows to insert: {total_rows}; headers touched: {len(work)}")
        if not args.apply:
            for key, ret_no, header_id, vals in work[:10]: print("PREVIEW", ret_no, len(vals), "existing_header", bool(header_id))
            print("DRY RUN: no database changes committed."); return

        for start in range(0, len(work), max(1, args.batch_size)):
            batch = work[start:start + max(1, args.batch_size)]
            db.begin()
            try:
                for (rid, job, dt), ret_no, header_id, vals in batch:
                    if not header_id:
                        header_id = str(uuid.uuid4())
                        remarks = "Imported from Reel Return Register"
                        if any(v["transfer"].lower() == "yes" for v in vals): remarks += " | Source Job Transfer = Yes"
                        cur.execute("""INSERT INTO material_returns
                          (id,returnNo,date,returnType,productionId,jobNo,remarks,updatedBy,updateTimestamp,firmId)
                          VALUES (%s,%s,%s,'Job',%s,%s,%s,'Reel Return Workbook Import',NOW(),%s)""",
                                    (header_id, ret_no, dt, vals[0]["productionId"], job, remarks, UNIT))
                        headers[ret_no] = header_id
                    # Find/create one return line per material for this header.
                    bymat = defaultdict(list)
                    for v in vals: bymat[str(v["slip"][2])].append(v)
                    cur.execute("SELECT id,materialId FROM material_return_lines WHERE materialReturnId=%s", (header_id,))
                    line_map = {str(mid): lid for lid, mid in cur.fetchall()}
                    for mid, material_rows in bymat.items():
                        line_id = line_map.get(mid)
                        qty = sum(Decimal(str(v["weight"])) for v in material_rows)
                        amount = sum(Decimal(str(v["weight"])) * Decimal(str(v["rate"])) for v in material_rows)
                        if not line_id:
                            line_id = str(uuid.uuid4()); line_map[mid] = line_id
                            cur.execute("""INSERT INTO material_return_lines
                              (id,materialReturnId,materialId,qty,uom,rate,amount,updatedBy,updateTimestamp)
                              VALUES (%s,%s,%s,%s,'KG',%s,%s,'Reel Return Workbook Import',NOW())""",
                                        (line_id, header_id, mid, qty, amount / qty if qty else 0, amount))
                        for v in material_rows:
                            if (str(header_id), v["reel"]) in existing: continue
                            sl = v["slip"]
                            cur.execute("""INSERT INTO material_return_reel_lines
                              (id,materialReturnId,materialReturnLineId,materialId,packingSlipId,ourReelNo,
                               weightKg,productionId,jobNo,updatedBy,updateTimestamp,jobTransfer)
                              VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'Reel Return Workbook Import',NOW(),'No')""",
                                        (str(uuid.uuid4()), header_id, line_id, mid, sl[0], v["reel"], v["weight"], v["productionId"], job))
                            existing.add((str(header_id), v["reel"]))
                db.commit(); print(f"Committed batch {start // max(1,args.batch_size) + 1}: headers {start+1}-{start+len(batch)}")
            except Exception:
                db.rollback(); raise
        print("COMPLETE")
    finally: db.close()

if __name__ == "__main__": main()
