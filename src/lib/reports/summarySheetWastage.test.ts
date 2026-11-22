import assert from "node:assert/strict";
import test from "node:test";
import { computeSummarySheetExtras, computeSummarySheetSections } from "./summarySheetTiles";

test("Total Wastage % = corrugated scrap sold to Megha Trading ÷ paper used × 100", () => {
  const lists = {
    companies: [{ id: "m", name: "M/S MEGHA TRADING" }, { id: "c", name: "Other" }],
    firms: [{ id: "f1", firmName: "Unit-I" }],
    invoices: [
      { id: "i1", companyId: "m", firmId: "f1", date: "2026-11-05" },
      { id: "i2", companyId: "m", firmId: "f1", date: "2026-10-30" },
      { id: "i3", companyId: "c", firmId: "f1", date: "2026-11-06" },
      { id: "i4", companyId: "m", firmId: "f1", date: "2026-11-07", status: "Cancelled" },
    ],
    invoiceLines: [
      { invoiceId: "i1", itemName: "CORRUGATED WASTAGE SCRAP", qty: "3000" },
      { invoiceId: "i1", itemName: "WASTAGE SCRAP CORE PIPE", qty: "500" },
      { invoiceId: "i2", itemName: "CORRUGATED WASTAGE SCRAP", qty: "9999" },
      { invoiceId: "i3", itemName: "CORRUGATED WASTAGE SCRAP", qty: "8888" },
      { invoiceId: "i4", itemName: "CORRUGATED WASTAGE SCRAP", qty: "7777" },
    ],
  };
  const extras = computeSummarySheetExtras(lists, []);
  assert.deepEqual(extras.scrapSales?.map((record) => record[5]), [3000, 9999]);
  const rows = [{ Date: "2026-11-02", "PPR Used": 20000 }, { Date: "2026-11-10", "PPR Used": 10000 }, { Date: "2026-10-10", "PPR Used": 50000 }];
  const tiles = computeSummarySheetSections(rows as any, [], { from: "2026-11-01", to: "2026-11-30" }, extras).flatMap((section) => section.tiles);
  assert.equal(tiles.find((t) => t.id === "totalProduction")?.value, 30000);
  assert.equal(tiles.find((t) => t.id === "totalWastage")?.value, 10);
  const noExtras = computeSummarySheetSections(rows as any, [], { from: "2026-11-01", to: "2026-11-30" }, null).flatMap((section) => section.tiles);
  assert.equal(noExtras.find((t) => t.id === "totalWastage")?.value, null);
});
