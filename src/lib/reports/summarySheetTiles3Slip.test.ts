import assert from "node:assert/strict";
import test from "node:test";
import { computeSummarySheetExtras, computeSummarySheetSections } from "./summarySheetTiles";

test("Sales tiles: invoice value before GST by invoice date; inter-firm and Megha scrap left out", () => {
  const lists = {
    companies: [{ id: "c", name: "Customer" }, { id: "m", name: "M/S MEGHA TRADING" }, { id: "own", name: "Unit-II" }],
    firms: [{ id: "f1", firmName: "Unit-I" }, { id: "f2", firmName: "Unit-II" }],
    invoices: [
      { id: "1", companyId: "c", firmId: "f1", date: "2026-11-22", totalBeforeGst: 1000, totalAfterGst: 1180 },
      { id: "2", companyId: "c", firmId: "f1", date: "2026-11-21", totalBeforeGst: 500, totalAfterGst: 590 },
      { id: "3", companyId: "m", firmId: "f1", date: "2026-11-22", totalBeforeGst: 40000, totalAfterGst: 42000 },
      { id: "4", companyId: "own", firmId: "f1", date: "2026-11-22", totalBeforeGst: 9000, totalAfterGst: 9500 },
      { id: "5", companyId: "c", firmId: "f1", date: "2026-10-30", totalBeforeGst: 700, totalAfterGst: 800 },
      { id: "6", companyId: "c", firmId: "f1", date: "2026-11-20", totalBeforeGst: 300, status: "Cancelled" },
    ],
  };
  const extras = computeSummarySheetExtras(lists, []);
  const rows = [{ Date: "2026-11-05", "PPR Used": 100 }];
  const tiles = computeSummarySheetSections(rows as any, [], { from: "2026-11-01", to: "2026-11-22" }, extras, undefined, false, null, new Date(2026, 10, 22))
    .flatMap((section) => section.tiles);
  const value = (id: string) => tiles.find((t) => t.id === id)?.value;
  assert.equal(value("todaySale"), 1000);
  assert.equal(value("yesterdaySale"), 500);
  assert.equal(value("rangeSale"), 1500);
  assert.equal(value("spPerKg"), 15);
  for (const removed of ["rangeSale3", "achievedPerDay", "targetPerDay", "revisedTargetPerDay", "shortSales"]) assert.equal(tiles.some((t) => t.id === removed), false);
  // Before the server figures arrive the sales tiles stay blank (not a wrong number).
  const loading = computeSummarySheetSections(rows as any, [], { from: "2026-11-01", to: "2026-11-22" }, null).flatMap((section) => section.tiles);
  assert.equal(loading.find((t) => t.id === "todaySale")?.value, null);
});
