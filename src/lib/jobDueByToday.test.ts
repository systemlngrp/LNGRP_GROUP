import { test } from "node:test";
import assert from "node:assert/strict";
import { getJobDateKey, isJobDueByToday, isProductionPendingMaterialIssue } from "./productionStageFilters";

test("only jobs dated today or earlier are due", () => {
  const today = "2026-11-17";
  assert.equal(isJobDueByToday({ date: "2026-11-17" }, today), true);
  assert.equal(isJobDueByToday({ date: "2026-11-16" }, today), true);
  assert.equal(isJobDueByToday({ date: "2026-11-18" }, today), false);
  assert.equal(isJobDueByToday({ date: "2026-11-18 00:00:00" }, today), false);
  assert.equal(isJobDueByToday({ date: "" }, today), true);
  assert.equal(getJobDateKey("2026-11-17"), "2026-11-17");
});

test("Pending Material Issue hides future-dated jobs", () => {
  const future = new Date(Date.now() + 3 * 86400000);
  const date = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
  const job = { id: "j", scheduleId: "s", status: "Pending PH" } as any;
  assert.equal(isProductionPendingMaterialIssue({ ...job, date }), false);
  assert.equal(isProductionPendingMaterialIssue({ ...job, date: "2026-01-01" }), true);
});
