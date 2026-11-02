"""Split mixed-rate Reel MRR lines and apply the Helper Sheet Rate per reel."""
from __future__ import annotations
import argparse, json, sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_reel_mrr_full_workflow import load_runtime_env, sheets_values, connect, s, n

SID = "1MAZwiGb5bgNXyAW-Bv4LfrdBF6mtYLyNco5IUDPnCfQ"
TARGETS = {
    "26-27/0715": "00715", "CB1/26-27/0795": "00795",
    "26-27/0773": "00773", "CB1/26-27/0796": "00796",
    "177": "00177", "40": "00040",
}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--apply", action="store_true"); a = ap.parse_args()
    load_runtime_env()
    values = sheets_values().get(spreadsheetId=SID, range="'HELPER SHEET'!A1:Q10043").execute().get("values", [])
    rates = {(s(r[1]), s(r[6])): n(r[14]) for r in values[1:] if len(r) > 14 and s(r[1]) and s(r[6])}
    db = connect(); cur = db.cursor(); changes = []
    try:
        for source, suffix in TARGETS.items():
            tx = f"LNCB-1/MRR/26-27/{suffix}"
            cur.execute("SELECT id, `lines`, totalInvoiceValue, totalActualValue FROM material_in WHERE transactionNo=%s", (tx,))
            parent = cur.fetchone()
            if not parent: raise RuntimeError(f"Missing application MRR: {tx}")
            lines = json.loads(parent[1]) if isinstance(parent[1], str) else parent[1]
            new_lines = []
            parent_value = 0.0
            for line in lines:
                groups = defaultdict(list)
                for reel in line.get("reels", []):
                    our = s(reel.get("ourReelNo")); rate = rates.get((source, our), n(line.get("rate")))
                    groups[rate].append(reel)
                for rate, reels in groups.items():
                    item = dict(line); item["reels"] = reels
                    qty = round(sum(n(x.get("weightKg")) for x in reels), 2)
                    value = round(qty * rate, 2)
                    item["qty"] = item["invoiceQty"] = item["actualQty"] = qty
                    item["invoiceRate"] = item["rate"] = rate
                    item["invoiceValue"] = item["actualValue"] = value
                    if len(groups) > 1: item["id"] = __import__("uuid").uuid4().hex[:8] + "-" + __import__("uuid").uuid4().hex[:4] + "-" + __import__("uuid").uuid4().hex[:4] + "-" + __import__("uuid").uuid4().hex[:4] + "-" + __import__("uuid").uuid4().hex[:12]
                    new_lines.append(item); parent_value += value
            old_value = n(parent[3]); delta = round(parent_value - old_value, 2)
            if abs(delta) > .009 or len(new_lines) != len(lines): changes.append((source, tx, len(lines), len(new_lines), old_value, parent_value, delta))
            if a.apply:
                db.begin()
                try:
                    for line in new_lines:
                        for reel in line.get("reels", []):
                            our = s(reel.get("ourReelNo")); rate = rates.get((source, our), n(line.get("rate")))
                            cur.execute("UPDATE material_in_packing_slips SET openingRate=%s WHERE materialInId=%s AND ourReelNo=%s", (rate, parent[0], our))
                    gst = round(parent_value * .05, 2)
                    cur.execute("UPDATE material_in SET `lines`=%s,totalInvoiceValue=%s,totalActualValue=%s,totalCgst=%s,totalSgst=%s,totalInvoiceValueAfterGst=%s,totalAmount=%s WHERE id=%s", (json.dumps(new_lines), parent_value, parent_value, gst/2, gst/2, parent_value+gst, parent_value+gst, parent[0]))
                    db.commit()
                except Exception:
                    db.rollback(); raise
        print("RATE CORRECTION PREVIEW")
        for x in changes: print(f"{x[0]}: lines {x[2]} -> {x[3]}, value {x[4]:.2f} -> {x[5]:.2f}, delta {x[6]:+.2f}")
        print(f"MRRs changed: {len(changes)}")
        print("APPLIED" if a.apply else "DRY RUN: no database changes committed.")
    finally: db.close()

if __name__ == "__main__": main()
