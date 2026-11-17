import { test } from "node:test";
import assert from "node:assert/strict";
import { getProductionWastageTotals } from "./wastageCalculations";
import { buildProductionWastageRows } from "./wastageReport";
import { completionStatusLabel } from "./productionProcessingProgress";

const production = { id: "p1", qty: 7160, totalPaperWeight: 716, actualPaperUsed: 800 } as any;
const part = { id: "a", productionId: "p1", machineName: "Corrugation Liner", completionStatus: "Part", qty: 3580, date: "2026-11-17" } as any;
const full = { id: "b", productionId: "p1", machineName: "Corrugation Liner", completionStatus: "Full", qty: 3580, warpageKg: 2, date: "2026-11-17" } as any;

test("In Progress entries count once the step is Job Complete", () => {
  const withBoth = getProductionWastageTotals(production, [part, full]);
  const singleFull = getProductionWastageTotals(production, [{ ...full, qty: 7160 }]);
  assert.deepEqual(withBoth, singleFull);
});

test("In Progress entries alone are not counted as a completed step", () => {
  const onlyPart = getProductionWastageTotals(production, [part]);
  const none = getProductionWastageTotals(production, []);
  assert.deepEqual(onlyPart, none);
});

test("wastage report uses the step total", () => {
  const [row] = buildProductionWastageRows([part, full], [production]);
  assert.equal(row.corrugationQty, 7160);
  assert.equal(row.id, "b");
  assert.equal(buildProductionWastageRows([part], [production]).length, 0);
});

test("completion labels", () => {
  assert.equal(completionStatusLabel("Part"), "In Progress");
  assert.equal(completionStatusLabel("Full"), "Job Complete");
  assert.equal(completionStatusLabel(undefined), "Job Complete");
});
