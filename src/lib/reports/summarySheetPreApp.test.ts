import assert from "node:assert/strict";
import test from "node:test";
import { computeSummarySheetRows } from "./summarySheet";
import type { SummarySheetLists } from "./summarySheet";

const baseLists = (extra: Partial<SummarySheetLists> = {}): SummarySheetLists => ({
  productions: [{ id: "job-6899", transactionNo: "JOB/25-26/6899", jobCardNo: "JOB/25-26/6899", rate: 9.06, plannedQty: 50000, status: "Active" } as any],
  processing: [], orders: [], schedules: [], plans: [],
  slips: [{
    id: "ls-5", slipNo: "LNCB-2/LS/26-27/00005", date: "2026-04-01", status: "Active", invoiceId: "inv-1",
    lines: [{ dispatchPlanId: "p", loadedQty: 4350, allocations: [{ sourceType: "job", jobId: "job-6899", jobNo: "JOB/25-26/6899", qty: 4350 }] }],
  } as any],
  invoices: [{ id: "inv-1", invoiceNo: "LNCB-2/26-27/00002", date: "2026-04-02", totalAfterGst: 100 } as any],
  invoiceLines: [], trucks: [], companies: [], firms: [],
  ...extra,
});

test("without pre-app rows the app columns are unchanged and the incl. columns copy them", () => {
  const [row] = computeSummarySheetRows(baseLists(), []);
  assert.equal(row["Dispatched Qty (3 slips)"], 4350);
  assert.equal(row["Sale Value (3 slips)"], 39411);
  assert.equal(row["Dispatched Qty incl. Pre-App (3 slips)"], 4350);
  assert.equal(row["Invoice Date 1 incl. Pre-App"], "2026-04-02");
  assert.equal(row["Pre-App Dispatched Qty"], undefined);
});

test("a pre-app loading counts first and moves the job to its earlier invoice month", () => {
  const [row] = computeSummarySheetRows(baseLists({
    preAppDispatches: [{ id: "pre-1", jobCardNo: "JOB/25-26/6899", slipRef: "LS-002278", date: "2026-03-31", qty: 45000, invoiceNo: "4143", invoiceDate: "2026-03-31" }],
  }), []);
  // App-only columns stay as they were.
  assert.equal(row["Dispatched Qty (3 slips)"], 4350);
  assert.equal(row["Invoice Date 1"], "2026-04-02");
  // New columns.
  assert.equal(row["Pre-App Dispatched Qty"], 45000);
  assert.equal(row["Pre-App Sale Value"], 407700);
  assert.equal(row["Pre-App Loading No"], "LS-002278");
  assert.equal(row["Dispatched Qty incl. Pre-App (3 slips)"], 49350);
  assert.equal(row["Sale Value incl. Pre-App (3 slips)"], 447111);
  assert.equal(row["Invoice Date 1 incl. Pre-App"], "2026-03-31");
});

test("pre-app rows match by production id and count toward the first three slips", () => {
  const slips = [1, 2, 3].map((k) => ({
    id: `ls-${k}`, slipNo: `S${k}`, date: `2026-04-0${k}`, status: "Active",
    lines: [{ dispatchPlanId: "p", loadedQty: 10, allocations: [{ sourceType: "job", jobId: "job-6899", qty: 10 }] }],
  })) as any[];
  const [row] = computeSummarySheetRows(baseLists({
    slips,
    invoices: [],
    preAppDispatches: [{ id: "pre-1", productionId: "job-6899", jobCardNo: "", date: "2026-03-20", qty: 100 }],
  }), []);
  assert.equal(row["Dispatched Qty (3 slips)"], 30);
  assert.equal(row["Dispatched Qty incl. Pre-App (3 slips)"], 120);
  assert.equal(row["Invoice Date 1 incl. Pre-App"], "2026-03-20");
});
