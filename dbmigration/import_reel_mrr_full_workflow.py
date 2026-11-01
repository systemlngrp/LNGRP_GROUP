"""Import Reel MRRs through the same workflow as the pilot.

Dry-run by default. Each selected MRR is one atomic transaction containing
Indent, PO, Gate Entry, MRR, Reel slips, and all approval timestamps.
"""
from __future__ import annotations
import argparse, json, re, sys, uuid
from collections import OrderedDict, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from migrate_daily_bk_orders_jobs import load_runtime_env, sheets_values, connect

SID = "1MAZwiGb5bgNXyAW-Bv4LfrdBF6mtYLyNco5IUDPnCfQ"
CUTOFF = "2026-04-01"
PILOT_SOURCE = "2"

def s(v): return "" if v is None else str(v).strip()
def n(v):
    try: return float(s(v).replace(",", "") or 0)
    except Exception: return 0.0
def norm(v): return re.sub(r"\s+", " ", s(v)).casefold()
def mrr_no(source):
    raw = s(source)
    if raw == "26-27/0602":
        return "LNCB-1/MRR/26-27/00602A"
    # The sheet contains both plain values (371) and values such as
    # 26-27/0374 or MI/26-27/00372. The application number uses only the
    # final segment, padded to the established five-digit format.
    suffix = raw.rsplit("/", 1)[-1].strip()
    return f"LNCB-1/MRR/26-27/{int(suffix):05d}" if suffix.isdigit() else f"LNCB-1/MRR/26-27/{suffix}"
def chunks(xs, size): return [xs[i:i + size] for i in range(0, len(xs), size)]
def next_no(cur, table, column, prefix):
    cur.execute(f"SELECT `{column}` FROM `{table}` WHERE `{column}` LIKE %s ORDER BY CAST(SUBSTRING_INDEX(`{column}`, '/', -1) AS UNSIGNED) DESC LIMIT 1", (prefix + "%",))
    row = cur.fetchone()
    return f"{prefix}{int(s(row[0]).split('/')[-1]) + 1:05d}" if row else f"{prefix}00001"

def load_source():
    mv = sheets_values().get(spreadsheetId=SID, range="'MRR FORM'!A1:S10000").execute().get("values", [])
    hv = sheets_values().get(spreadsheetId=SID, range="'HELPER SHEET'!A1:Q10043").execute().get("values", [])
    helpers = defaultdict(list)
    for row in hv[1:]:
        if len(row) > 1 and s(row[1]): helpers[s(row[1])].append(row)
    parents = OrderedDict()
    for row in mv[1:]:
        if len(row) < 5: continue
        source_no = s(row[2])
        if not source_no or source_no == PILOT_SOURCE or source_no in parents: continue
        raw_date = s(row[1]).replace("-", "/")
        parts = raw_date.split("/")
        if len(parts) != 3 or not all(x.isdigit() for x in parts): continue
        # Google Sheet dates are M/D/YYYY in this workbook.
        iso = f"{parts[2]}-{int(parts[0]):02d}-{int(parts[1]):02d}"
        if iso < CUTOFF or not helpers.get(source_no): continue
        parents[source_no] = {"sourceNo": source_no, "date": iso, "invoiceNo": s(row[4]), "invoiceValue": n(row[18]) if len(row) > 18 else 0, "truckNo": s(row[5]) if len(row) > 5 else "", "supplier": s(row[16]) if len(row) > 16 else "", "rows": helpers[source_no]}
    return list(parents.values())

def find_unit_one(cur):
    cur.execute("SELECT id,firmName FROM firms ORDER BY firmName")
    return next((r for r in cur.fetchall() if re.search(r"unit\s*[- ]?i\b", s(r[1]), re.I) and not re.search(r"unit\s*[- ]?ii\b", s(r[1]), re.I)), None)

def create_one(cur, firm, suppliers, materials, parent):
    source_no = parent["sourceNo"]; tx = mrr_no(source_no)
    cur.execute("SELECT id FROM material_in WHERE transactionNo=%s", (tx,))
    if cur.fetchone(): raise RuntimeError(f"MRR already exists: {tx}")
    supplier_id = suppliers.get(norm(parent["supplier"]))
    if not supplier_id: raise RuntimeError(f"Supplier missing for MRR {source_no}: {parent['supplier']}")
    groups = OrderedDict()
    for row in parent["rows"]:
        erp = s(row[9]); material_id = materials.get(erp)
        if not material_id: raise RuntimeError(f"ERP material missing for MRR {source_no}: {erp}")
        g = groups.setdefault(erp, {"materialId": material_id, "qty": 0, "rate": n(row[14]), "reels": []})
        g["qty"] += n(row[13])
        g["reels"].append((s(row[7]), s(row[6]), n(row[13]), s(row[3])))
    indent_id, po_id, gate_id, mrr_id = [str(uuid.uuid4()) for _ in range(4)]
    now = datetime.now(timezone.utc).isoformat(); date = parent["date"]
    indent_no = next_no(cur, "indents", "indentNo", "IND/26-27/")
    po_no = next_no(cur, "purchase_orders", "poNo", "PO/26-27/")
    gate_no = next_no(cur, "gate_entries", "gateEntryNo", "GE/26-27/")
    indent_lines = []
    cur.execute("INSERT INTO indents (id,firmId,firmName,indentNo,requestedBy,requisitionDate,requiredDate,indentType,status,approvedTimestamp,approvedBy,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,'Sheet MRR Import',%s,%s,'Reel','Approved',%s,'Sheet MRR Import','Sheet MRR Import',%s)", (indent_id, firm[0], firm[1], indent_no, date, date, now, now))
    for erp, g in groups.items():
        lid = str(uuid.uuid4()); indent_lines.append((lid, erp, g))
        cur.execute("INSERT INTO indent_lines (id,indentId,erpCode,materialId,uom,qty,targetDeliveryDate,orderedQty,cancelledQty,balanceQty,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,'KG',%s,%s,0,0,%s,'Sheet MRR Import',%s)", (lid, indent_id, erp, g["materialId"], g["qty"], date, g["qty"], now))
    taxable = sum(g["qty"] * g["rate"] for _, _, g in indent_lines); gst = round(taxable * .05, 2)
    cur.execute("INSERT INTO purchase_orders (id,firmId,poNo,indentId,supplierId,poDate,requiredDate,totalQty,totalAmount,taxableAmount,cgst,sgst,igst,grandTotal,status,approvedBy,approvedTimestamp,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,0,%s,'Approved','Sheet MRR Import',%s,'Sheet MRR Import',%s)", (po_id, firm[0], po_no, indent_id, supplier_id, date, date, sum(g["qty"] for _, _, g in indent_lines), taxable + gst, taxable, gst / 2, gst / 2, taxable + gst, now, now))
    for lid, erp, g in indent_lines:
        plid = str(uuid.uuid4()); g["poLineId"] = plid; amount = round(g["qty"] * g["rate"], 2)
        cur.execute("INSERT INTO purchase_order_lines (id,purchaseOrderId,indentLineId,materialId,erpCode,uom,qty,rate,amount,gstRate,cgst,sgst,igst,lineTotal,targetDeliveryDate,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,%s,'KG',%s,%s,%s,5,%s,%s,0,%s,%s,'Sheet MRR Import',%s)", (plid, po_id, lid, g["materialId"], erp, g["qty"], g["rate"], amount, amount * .025, amount * .025, amount * 1.05, date, now))
    cur.execute("INSERT INTO gate_entries (id,gateEntryNo,firmId,firmName,date,supplierId,purpose,invoiceNo,invoiceValue,truckNo,status,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,%s,%s,'Material Receipt',%s,%s,%s,'Active','Sheet MRR Import',%s)", (gate_id, gate_no, firm[0], firm[1], date, supplier_id, parent["invoiceNo"], parent["invoiceValue"], parent["truckNo"], now))
    lines = []; total_actual = 0
    for erp, g in groups.items():
        lid = str(uuid.uuid4()); value = round(g["qty"] * g["rate"], 2); total_actual += value; reels = []
        for supplier_reel, our_reel, weight, supplier_po in g["reels"]:
            sid = str(uuid.uuid4())
            cur.execute("INSERT INTO material_in_packing_slips (id,firmId,supplierId,materialInId,materialLineId,materialId,supplierReelNo,ourReelNo,weightKg,openingRate,supplierPoNo,ourPoId,ourPoNo,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'Sheet MRR Import',%s)", (sid, firm[0], supplier_id, mrr_id, lid, g["materialId"], supplier_reel, our_reel, weight, g["rate"], supplier_po, g["poLineId"], po_no, now))
            reels.append({"supplierReelNo": supplier_reel, "ourReelNo": our_reel, "weightKg": weight, "ourPoId": g["poLineId"], "ourPoNo": po_no})
        lines.append({"id": lid, "itemId": g["materialId"], "itemSource": "MAT", "qty": g["qty"], "invoiceQty": g["qty"], "actualQty": g["qty"], "uom": "KG", "invoiceRate": g["rate"], "rate": g["rate"], "poRate": g["rate"], "invoiceValue": value, "actualValue": value, "gstRate": 5, "cgstRate": 2.5, "sgstRate": 2.5, "reels": reels})
    invoice_value = parent["invoiceValue"] or total_actual; gst = round(invoice_value * .05, 2); source_ref = f"Google Sheet MRR FORM: {source_no}"
    values = (mrr_id, tx, "Reel", gate_id, gate_no, now, "Sheet MRR Import", date, parent["invoiceNo"], date, supplier_id, taxable + gst, invoice_value, total_actual, gst / 2, gst / 2, 0, invoice_value + gst, 0, 0, 0, 0, 0, 0, invoice_value + gst, json.dumps(lines), now, "Sheet MRR Import", now, "Sheet MRR Import", now, "Sheet MRR Import", now, "Completed", source_ref, "Sheet MRR Import", now, firm[0])
    cur.execute("INSERT INTO material_in (id,transactionNo,mrrType,gateEntryId,gateEntryNo,timestamp,entryEmailId,date,invoiceNo,invDate,supplierId,totalPoValue,totalInvoiceValue,totalActualValue,totalCgst,totalSgst,totalIgst,totalInvoiceValueAfterGst,insurance,otherCharges,expenseCGST,expenseSGST,expenseIGST,roundOff,totalAmount,`lines`,phTimestamp,phEmailId,accTimestamp,accEmailId,mdTimestamp,mdEmailId,tallyTimestamp,status,mrrSource,updatedBy,updateTimestamp,firmId) VALUES (" + ",".join(["%s"] * len(values)) + ")", values)
    cur.execute("UPDATE gate_entries SET mrrId=%s,mrrDate=%s,mrrNo=%s WHERE id=%s", (mrr_id, date, tx, gate_id))
    return tx, indent_no, po_no, gate_no, sum(len(g["reels"]) for g in groups.values())

def main():
    p = argparse.ArgumentParser(); p.add_argument("--apply", action="store_true"); p.add_argument("--batch-size", type=int, default=1); p.add_argument("--start-batch", type=int, default=1); p.add_argument("--max-batches", type=int); p.add_argument("--through-mrr", type=int); p.add_argument("--source-mrr"); p.add_argument("--pause-seconds", type=float, default=3); a = p.parse_args()
    if a.batch_size < 1: raise SystemExit("--batch-size must be positive")
    load_runtime_env(); source = load_source()
    if a.through_mrr is not None:
        source = [row for row in source if row["sourceNo"].isdigit() and int(row["sourceNo"]) <= a.through_mrr]
    if a.source_mrr:
        source = [row for row in source if row["sourceNo"] == a.source_mrr]
    db = connect()
    try:
        cur = db.cursor(); firm = find_unit_one(cur)
        if not firm: raise RuntimeError("Unit-I firm not found")
        cur.execute("SELECT id,name FROM suppliers"); suppliers = {norm(r[1]): r[0] for r in cur.fetchall()}
        cur.execute("SELECT id,erpCode FROM materials WHERE firmId=%s AND LOWER(type)='reel' AND LOWER(COALESCE(uom,'')) IN ('kg','kgs')", (firm[0],)); materials = {s(r[1]): r[0] for r in cur.fetchall()}
        cur.execute("SELECT transactionNo FROM material_in"); existing = {s(r[0]) for r in cur.fetchall()}
        plans = []; skipped = []
        for parent in source:
            tx = mrr_no(parent["sourceNo"]); erps = {s(r[9]) for r in parent["rows"]}; reels = [s(r[6]) for r in parent["rows"]]; missing = sorted(e for e in erps if e not in materials)
            if tx in existing: skipped.append((parent["sourceNo"], "already exists")); continue
            if missing: skipped.append((parent["sourceNo"], "ERP missing " + ",".join(missing))); continue
            if len(reels) != len(set(reels)): skipped.append((parent["sourceNo"], "duplicate Our Reel")); continue
            if not suppliers.get(norm(parent["supplier"])): skipped.append((parent["sourceNo"], "supplier missing")); continue
            plans.append(parent)
        batches = chunks(plans, a.batch_size); selected = batches[a.start_batch - 1:(a.start_batch - 1 + a.max_batches if a.max_batches else None)]
        print(f"Eligible MRRs={len(plans)}; skipped={len(skipped)}; batches={len(batches)}; selected={len(selected)}")
        for row in skipped[:20]: print("SKIP", row[0], row[1])
        if not a.apply: print("DRY RUN: no database changes committed."); return
        import time
        for bi, batch in enumerate(selected, a.start_batch):
            for parent in batch:
                db.begin()
                try:
                    tx, ind, po, gate, reels = create_one(cur, firm, suppliers, materials, parent); db.commit()
                    print(f"Batch {bi}: committed source_mrr={parent['sourceNo']} transactionNo={tx} indent={ind} po={po} gate={gate} reels={reels}")
                except Exception:
                    db.rollback(); raise
                if a.pause_seconds: time.sleep(a.pause_seconds)
    finally: db.close()
if __name__ == "__main__": main()
