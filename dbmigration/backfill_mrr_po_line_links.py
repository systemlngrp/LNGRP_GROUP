"""Backfill missing material_in.lines[].poLineId links.

Dry-run by default.  Only unambiguous matches are eligible for update.
The script changes the JSON linkage only; quantities, rates, GST, values,
reel data, and parent MRR fields are preserved.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).resolve().parent))
from migrate_daily_bk_orders_jobs import load_runtime_env, connect


def text(value):
    return "" if value is None else str(value).strip()


def number(value):
    try:
        return float(text(value).replace(",", "") or 0)
    except ValueError:
        return 0.0


def norm(value):
    return text(value).casefold()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--start-batch", type=int, default=1)
    parser.add_argument("--max-batches", type=int)
    args = parser.parse_args()
    if args.batch_size < 1 or args.start_batch < 1:
        raise SystemExit("batch-size and start-batch must be positive")

    load_runtime_env()
    db = connect()
    try:
        cur = db.cursor()
        cur.execute("""
            SELECT id, firmId, supplierId, date, transactionNo, `lines`
            FROM material_in
            WHERE `lines` IS NOT NULL
            ORDER BY date, id
        """)
        receipts = cur.fetchall()
        cur.execute("""
            SELECT pol.id, pol.purchaseOrderId, pol.materialId, pol.erpCode,
                   pol.qty, po.firmId, po.supplierId, po.poDate, po.status,
                   po.poNo
            FROM purchase_order_lines pol
            JOIN purchase_orders po ON po.id = pol.purchaseOrderId
            WHERE COALESCE(po.status, '') <> 'Rejected'
            ORDER BY po.poDate, pol.id
        """)
        po_rows = cur.fetchall()
        cur.execute("SELECT id, erpCode FROM materials")
        erp_by_material = {text(row[0]): text(row[1]) for row in cur.fetchall()}
        cur.execute("""
            SELECT materialInId, materialLineId, ourReelNo, ourPoId, ourPoNo
            FROM material_in_packing_slips
            WHERE COALESCE(ourPoId, '') <> ''
        """)
        slip_po_by_line = {}
        slip_po_by_reel = {}
        for row in cur.fetchall():
            line_key = (text(row[0]), text(row[1]))
            reel_key = text(row[2])
            value = text(row[3])
            if line_key in slip_po_by_line and slip_po_by_line[line_key] != value:
                slip_po_by_line[line_key] = "AMBIGUOUS"
            else:
                slip_po_by_line[line_key] = value
            if reel_key:
                if reel_key in slip_po_by_reel and slip_po_by_reel[reel_key] != value:
                    slip_po_by_reel[reel_key] = "AMBIGUOUS"
                else:
                    slip_po_by_reel[reel_key] = value

        candidates_by_key = defaultdict(list)
        for row in po_rows:
            # Candidate key deliberately includes firm and supplier so an MRR
            # cannot be attached to another firm's or supplier's PO.
            key = (text(row[5]), text(row[6]), text(row[2]), norm(row[3]))
            candidates_by_key[key].append(row)

        plans = []
        stats = defaultdict(int)
        for receipt in receipts:
            try:
                lines = json.loads(receipt[5])
            except (TypeError, json.JSONDecodeError):
                stats["invalid_json"] += 1
                continue
            if not isinstance(lines, list):
                stats["invalid_json"] += 1
                continue
            changed = False
            planned_lines = []
            for index, line in enumerate(lines):
                if not isinstance(line, dict):
                    stats["invalid_lines"] += 1
                    continue
                if text(line.get("poLineId")):
                    stats["already_linked_lines"] += 1
                    continue
                material_id = text(line.get("itemId") or line.get("materialId"))
                erp = text(line.get("erpCode") or line.get("materialErpCode") or erp_by_material.get(material_id))
                qty = number(line.get("actualQty") or line.get("invoiceQty") or line.get("qty"))
                key = (text(receipt[1]), text(receipt[2]), material_id, norm(erp))
                exact_po_ids = set()
                # Reel-level linkage is the strongest available evidence.
                # The JSON line id and packing-slip materialLineId were not
                # always preserved identically during the original import.
                reel_po_ids = set()
                for reel in line.get("reels") or []:
                    if isinstance(reel, dict):
                        reel_no = text(reel.get("ourReelNo"))
                        if reel_no and reel_no in slip_po_by_reel:
                            reel_po_ids.add(slip_po_by_reel[reel_no])
                if "AMBIGUOUS" in reel_po_ids:
                    reel_po_ids = set()
                if reel_po_ids and len(reel_po_ids) == 1:
                    exact_po_ids = reel_po_ids
                for slip_key, slip_po_id in slip_po_by_line.items():
                    if not exact_po_ids and slip_key[0] == text(receipt[0]) and slip_key[1] == text(line.get("id")):
                        exact_po_ids.add(slip_po_id)
                if "AMBIGUOUS" in exact_po_ids:
                    matches = []
                elif exact_po_ids:
                    matches = [r for r in po_rows if text(r[0]) in exact_po_ids]
                else:
                    matches = candidates_by_key.get(key, [])
                # If materialId is absent in the JSON, ERP-only matching is
                # allowed, but only when it produces one candidate.
                if not material_id:
                    matches = [r for r in po_rows if text(r[5]) == text(receipt[1]) and text(r[6]) == text(receipt[2]) and norm(r[3]) == norm(erp)]
                if not matches:
                    stats["unmatched_lines"] += 1
                    continue
                if len(matches) != 1:
                    stats["ambiguous_lines"] += 1
                    continue
                po = matches[0]
                if qty > number(po[4]):
                    stats["quantity_exceeds_po"] += 1
                    continue
                planned_lines.append((index, text(po[0]), qty, text(po[9])))
                changed = True
            if changed:
                plans.append((text(receipt[0]), text(receipt[4]), lines, planned_lines))

        batches = [plans[i:i + args.batch_size] for i in range(0, len(plans), args.batch_size)]
        selected = batches[args.start_batch - 1:]
        if args.max_batches is not None:
            selected = selected[:args.max_batches]

        print(f"MRRs scanned: {len(receipts)}")
        print(f"MRRs with eligible updates: {len(plans)}")
        print(f"Batches: total={len(batches)} selected={len(selected)} size={args.batch_size}")
        print(f"Already linked lines: {stats['already_linked_lines']}")
        print(f"Unmatched lines: {stats['unmatched_lines']}")
        print(f"Ambiguous lines: {stats['ambiguous_lines']}")
        print(f"Quantity exceeds PO: {stats['quantity_exceeds_po']}")
        for batch_no, batch in enumerate(selected, start=args.start_batch):
            print(f"Batch {batch_no}: MRRs={len(batch)}")
            for mrr_id, tx, lines, links in batch[:10]:
                for index, po_line_id, qty, po_no in links:
                    print(f"  {tx} line={index} qty={qty:g} -> poLineId={po_line_id} ({po_no})")
            if not args.apply:
                continue
            try:
                db.begin()
                updated_lines = 0
                for mrr_id, _tx, lines, links in batch:
                    next_lines = [dict(line) for line in lines]
                    for index, po_line_id, _qty, _po_no in links:
                        next_lines[index]["poLineId"] = po_line_id
                        updated_lines += 1
                    cur.execute("UPDATE material_in SET `lines`=%s, updatedBy=%s, updateTimestamp=NOW() WHERE id=%s", (json.dumps(next_lines), "PO Link Backfill", mrr_id))
                db.commit()
                print(f"COMMITTED batch={batch_no} mrrs={len(batch)} lines={updated_lines}")
            except Exception:
                db.rollback()
                raise
        if not args.apply:
            print("DRY RUN: no database changes committed.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
