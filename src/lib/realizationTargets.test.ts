import assert from "node:assert/strict";
import test from "node:test";
import { findRealizationTargetForDate, parseRealizationTargets } from "./realizationTargets";

test("selects the realization target for the production date", () => {
  const targets = parseRealizationTargets(JSON.stringify([
    { dateFrom: "2026-10-01", dateTo: "2026-10-10", value: 44 },
    { dateFrom: "2026-10-11", dateTo: "2026-10-31", value: 48 },
  ]));

  assert.equal(findRealizationTargetForDate(targets, "2026-10-05")?.value, 44);
  assert.equal(findRealizationTargetForDate(targets, "2026-10-15")?.value, 48);
  assert.equal(findRealizationTargetForDate(targets, "2026-11-01"), null);
});
