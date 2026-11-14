import assert from "node:assert/strict";
import test from "node:test";
import { computeSummarySheetSections } from "./summarySheetTiles";

const tile = (rows: any[], id: string) =>
  computeSummarySheetSections(rows, [], { from: "2026-10-01", to: "2026-10-31" }, null)
    .flatMap((section) => section.tiles)
    .find((t) => t.id === id)?.value;

test("Total Sale (3 slips) counts only the first 3 slips; Total Sale counts all", () => {
  const rows = [
    // Job with 5 slips: all-slip sale 50,880 × 16.09, 3-slip sale 33,400 × 16.09.
    { "Dispatch Date": "2026-10-16", "Sale Value": 818659.2, "Sale Value (3 slips)": 537406, "Invoice Date 1 incl. Pre-App": "2026-10-16", "Sale Value incl. Pre-App (3 slips)": 537406 },
    { "Dispatch Date": "2026-09-30", "Sale Value": 1000, "Sale Value (3 slips)": 1000, "Invoice Date 1 incl. Pre-App": "2026-09-30", "Sale Value incl. Pre-App (3 slips)": 1000 },
  ];
  assert.equal(tile(rows, "rangeSale"), 818659.2);
  assert.equal(tile(rows, "rangeSale3"), 537406);
});

test("Total Sale (3 slips) uses the pre-app first invoice month", () => {
  const rows = [{ "Dispatch Date": "2026-10-02", "Sale Value": 100, "Sale Value (3 slips)": 100, "Invoice Date 1 incl. Pre-App": "2026-09-28", "Sale Value incl. Pre-App (3 slips)": 300 }];
  assert.equal(tile(rows, "rangeSale"), 100);
  assert.equal(tile(rows, "rangeSale3"), 0);
});
