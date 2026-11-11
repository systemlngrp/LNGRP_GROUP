import test from "node:test";
import assert from "node:assert/strict";
import { buildScheduleConsumptionByScheduleId } from "./productionScheduleQty";
const P: any[] = [
  { id: "j1", scheduleId: "s1", qty: 1000, prodFromFFG: 900, status: "Pending PH" },
  { id: "j2", scheduleId: "s2", qty: 500, status: "Pending PH" },
];
const DP: any[] = [{ id: "d1", scheduleId: "s1" }, { id: "d3", scheduleId: "s3" }, { id: "d2", scheduleId: "s2" }];
const LS: any[] = [
  { status: "Active", lines: [{ dispatchPlanId: "d1", loadedQty: 1200, allocations: [{ sourceType: "job", jobId: "j1", qty: 900 }, { sourceType: "opening_stock", qty: 300 }] }] },
  { status: "Active", lines: [{ dispatchPlanId: "d3", loadedQty: 400, allocations: [{ sourceType: "opening_stock", qty: 400 }] }] },
  { status: "Cancelled", lines: [{ dispatchPlanId: "d2", loadedQty: 999, allocations: [{ sourceType: "opening_stock", qty: 999 }] }] },
];
test("without supply unchanged", () => {
  const m = buildScheduleConsumptionByScheduleId(P, [], []);
  assert.equal(m.get("s1")!.effectiveConsumedQty, 900);
  assert.equal(m.get("s3"), undefined);
});
test("own job + stock", () => {
  const m = buildScheduleConsumptionByScheduleId(P, [], [], { dispatchPlans: DP, loadingSlips: LS });
  assert.equal(m.get("s1")!.effectiveConsumedQty, 1200); // 900 own + 300 stock
  assert.equal(m.get("s3")!.effectiveConsumedQty, 400);  // stock only, no job
  assert.equal(m.get("s2")!.effectiveConsumedQty, 500);  // cancelled slip ignored
});
