import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLiveStock, countsAfterCutoff, type LiveStockCutoff } from "./liveStockCompute.js";

const cutoff: LiveStockCutoff = {
  asOn: "2026-11-26T11:30:00.000Z",
  cutoffDate: "2026-11-26",
  preCutoffIds: { loading_slips: ["slip-before"], production_processing: ["print-before"] },
  jobBaselines: { "php-job-old": 500 },
};

test("cutoff day: ids saved before the cutoff are ignored, the rest count", () => {
  assert.equal(countsAfterCutoff(cutoff, "loading_slips", "slip-before", "2026-11-26"), false);
  assert.equal(countsAfterCutoff(cutoff, "loading_slips", "slip-night", "2026-11-26"), true);
  assert.equal(countsAfterCutoff(cutoff, "loading_slips", "any", "2026-11-25"), false);
  assert.equal(countsAfterCutoff(cutoff, "loading_slips", "any", "2026-11-27"), true);
});

test("live = opening + production + receipts - dispatched - loading wastage", () => {
  const rows = computeLiveStock({
    cutoff,
    openings: [{ itemType: "FG", erp: "90130167", itemName: "PML-ZB", qty: 800 }, { itemType: "FG", erp: "90130167", qty: 1440 }],
    movements: [
      { entity: "production_processing", id: "print-before", date: "2026-11-26", itemType: "FG", erp: "90130167", kind: "production", qty: 999 },
      { entity: "production_processing", id: "print-night", date: "2026-11-26", itemType: "FG", erp: "90130167", kind: "production", qty: 100 },
      { entity: "material_in", id: "mrr1", date: "2026-11-27", itemType: "FG", erp: "90130167", kind: "receiptRejection", qty: 20 },
      { entity: "loading_slips", id: "slip-before", date: "2026-11-26", itemType: "FG", erp: "90130167", kind: "dispatched", qty: 5580 },
      { entity: "loading_slips", id: "slip-night", date: "2026-11-26", itemType: "FG", erp: "90130167", kind: "dispatched", qty: 2240 },
      { entity: "loading_slips", id: "slip-night", date: "2026-11-26", itemType: "FG", erp: "90130167", kind: "loadingWastage", qty: 10 },
    ],
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(
    { opening: rows[0].opening, production: rows[0].production, rejection: rows[0].receiptRejection, dispatched: rows[0].dispatched, wastage: rows[0].loadingWastage, live: rows[0].live },
    { opening: 2240, production: 100, rejection: 20, dispatched: 2240, wastage: 10, live: 110 },
  );
  assert.equal(rows[0].movements.length, 4);
});

test("PHP job output counts only the change since the cutoff; new jobs count in full", () => {
  const rows = computeLiveStock({
    cutoff,
    openings: [{ itemType: "PHP", erp: "78000025", qty: 240 }],
    movements: [],
    jobOutputs: [
      { entity: "php_job_master", id: "php-job-old", date: "2026-11-20", itemType: "PHP", erp: "78000025", output: 700 },
      { entity: "php_job_master", id: "php-job-new", date: "2026-11-27", itemType: "PHP", erp: "78000025", output: 300 },
      { entity: "php_job_master", id: "php-job-unknown-old", date: "2026-11-10", itemType: "PHP", erp: "78000025", output: 900 },
    ],
  });
  assert.equal(rows[0].production, 500);
  assert.equal(rows[0].live, 740);
});

test("items with movements but no opening start from zero and can go negative (flagged in the view)", () => {
  const rows = computeLiveStock({
    cutoff,
    openings: [],
    movements: [{ entity: "loading_slips", id: "s9", date: "2026-11-28", itemType: "FG", erp: "99999999", kind: "dispatched", qty: 50 }],
  });
  assert.equal(rows[0].live, -50);
});
