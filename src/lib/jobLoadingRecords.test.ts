import assert from "node:assert/strict";
import test from "node:test";
import { buildJobLoadingRecords } from "./jobLoadingRecords";
import type { DispatchPlan, LoadingSlip, Production } from "../types";

const jobs = [
  { id: "job-1", transactionNo: "JOB-1" },
  { id: "job-2", transactionNo: "JOB-2" },
] as Production[];
const plans = [{ id: "plan-1", productionId: "job-1" }] as DispatchPlan[];
const slip = (id: string, date: string, lines: LoadingSlip["lines"], status: LoadingSlip["status"] = "Active") =>
  ({ id, slipNo: id, date, status, lines } as LoadingSlip);

test("job allocations take precedence over the plan and stay separate by job", () => {
  const records = buildJobLoadingRecords(jobs, [slip("LS-1", "2026-10-15", [{
    dispatchPlanId: "plan-1", loadedQty: 300, itemId: "fg-1", allocations: [
      { sourceType: "job", jobId: "job-1", jobNo: "JOB-1", qty: 100 },
      { sourceType: "job", jobId: "job-1", jobNo: "JOB-1", qty: 50 },
      { sourceType: "job", jobId: "job-2", jobNo: "JOB-2", qty: 150 },
    ],
  }])], plans);
  assert.equal(records.get("job-1")?.[0].qty, 150);
  assert.equal(records.get("job-2")?.[0].qty, 150);
  assert.deepEqual(records.get("job-1")?.[0].itemIds, ["fg-1"]);
});

test("job allocations work when a dispatch plan has no production link", () => {
  const records = buildJobLoadingRecords(jobs, [slip("LS-1", "2026-10-15", [{
    dispatchPlanId: "plan-without-job", loadedQty: 100,
    allocations: [{ sourceType: "job", jobId: "job-2", jobNo: "JOB-2", qty: 100 }],
  }])], [{ id: "plan-without-job" } as DispatchPlan]);
  assert.equal(records.get("job-2")?.[0].qty, 100);
  assert.equal(records.has("job-1"), false);
});

test("multiple lines in one slip make one record and loading slips sort by date", () => {
  const records = buildJobLoadingRecords(jobs, [
    slip("LS-2", "2026-10-16", [{ dispatchPlanId: "plan-1", loadedQty: 20, allocations: [{ sourceType: "job", jobId: "job-1", jobNo: "JOB-1", qty: 20 }] }]),
    slip("LS-1", "2026-10-15", [
      { dispatchPlanId: "plan-1", loadedQty: 10, allocations: [{ sourceType: "job", jobId: "job-1", jobNo: "JOB-1", qty: 10 }] },
      { dispatchPlanId: "plan-1", loadedQty: 5, allocations: [{ sourceType: "job", jobId: "job-1", jobNo: "JOB-1", qty: 5 }] },
    ]),
  ], plans).get("job-1");
  assert.deepEqual(records?.map((record) => [record.slip.slipNo, record.qty]), [["LS-1", 15], ["LS-2", 20]]);
});

test("legacy plan links work without allocations; cancelled and unlinked slips do not count", () => {
  const records = buildJobLoadingRecords(jobs, [
    slip("LS-1", "2026-10-15", [{ dispatchPlanId: "plan-1", loadedQty: 10 }]),
    slip("LS-2", "2026-10-16", [{ dispatchPlanId: "plan-1", loadedQty: 99 }], "Cancelled"),
    slip("LS-3", "2026-10-17", [{ dispatchPlanId: "unknown", loadedQty: 50 }]),
  ], plans);
  assert.equal(records.get("job-1")?.reduce((sum, record) => sum + record.qty, 0), 10);
  assert.equal(records.has("job-2"), false);
});
