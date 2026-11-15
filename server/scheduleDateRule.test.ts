import assert from "node:assert/strict";
import test from "node:test";
import { jobDateRuleError, scheduleDateRuleError } from "./scheduleDateRule";

test("schedule date must be on/after the order date and on/before its earliest job", () => {
  assert.equal(scheduleDateRuleError({ orderDate: "2026-11-01", scheduledDate: "2026-11-01" }), "");
  assert.equal(scheduleDateRuleError({ orderDate: "2026-11-01", scheduledDate: "2026-11-05", earliestJobDate: "2026-11-05" }), "");
  assert.match(scheduleDateRuleError({ orderDate: "2026-11-02", scheduledDate: "2026-11-01" }), /cannot be before the Order Date 02-11-2026/);
  assert.match(scheduleDateRuleError({ orderDate: "2026-11-01", scheduledDate: "2026-11-05", earliestJobDate: "2026-11-04" }), /cannot be after its job date 04-11-2026/);
});

test("job date must be on/after the schedule date", () => {
  assert.equal(jobDateRuleError({ jobDate: "2026-11-05", scheduledDate: "2026-11-05" }), "");
  assert.match(jobDateRuleError({ jobDate: "2026-11-04", scheduledDate: "2026-11-05" }), /cannot be before the order's Scheduled Date 05-11-2026/);
});

test("missing or non-ISO dates are not checked", () => {
  assert.equal(scheduleDateRuleError({ orderDate: "", scheduledDate: "2026-11-01" }), "");
  assert.equal(scheduleDateRuleError({ orderDate: "05/11/2026", scheduledDate: "2026-11-01" }), "");
  assert.equal(jobDateRuleError({ jobDate: "2026-11-01", scheduledDate: null }), "");
});
