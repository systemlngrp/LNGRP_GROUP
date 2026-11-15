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

test("Sales Analysis figures fill Target / Revised / Achieved / Short", () => {
  const figures = { targetPerDay: 2123920, revisedTargetPerDay: 1768526.72, achievedPerDay: 1768526.72, shortSales: -4975505.94, reportDate: "2026-11-14" };
  const tiles = computeSummarySheetSections([], [], { from: "2026-11-01", to: "2026-11-30" }, null, undefined, false, null, new Date(), figures)
    .flatMap((section) => section.tiles);
  const value = (id: string) => tiles.find((t) => t.id === id)?.value;
  assert.equal(value("targetPerDay"), 2123920);
  assert.equal(value("revisedTargetPerDay"), 1768526.72);
  assert.equal(value("achievedPerDay"), 1768526.72);
  assert.equal(value("shortSales"), -4975505.94);
  // Without figures the target tiles stay blank.
  const blank = computeSummarySheetSections([], [], { from: "2026-11-01", to: "2026-11-30" }, null).flatMap((section) => section.tiles);
  assert.equal(blank.find((t) => t.id === "targetPerDay")?.value, null);
});
