import assert from "node:assert/strict";
import test from "node:test";
import { parseSalesTargetPayload } from "./salesTargets";

test("parses sheet values, including text with commas", () => {
  const parsed = parseSalesTargetPayload({ targetPerDay: 2123920, revisedTargetPerDay: "17,68,526.719", achievedPerDay: 1768526.7185, shortSales: "-4975505.94", reportDate: "2026-11-14" });
  assert.deepEqual(parsed, { targetPerDay: 2123920, revisedTargetPerDay: 1768526.72, achievedPerDay: 1768526.72, shortSales: -4975505.94, reportDate: "2026-11-14", source: "Sales Analysis" });
});

test("rejects a blank figure and a bad date", () => {
  assert.ok("error" in parseSalesTargetPayload({ targetPerDay: 1, revisedTargetPerDay: 1, achievedPerDay: 1, shortSales: "" }));
  assert.ok("error" in parseSalesTargetPayload({ targetPerDay: 1, revisedTargetPerDay: 1, achievedPerDay: 1, shortSales: 0, reportDate: "14/11/2026" }));
});
