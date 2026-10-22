import { test } from "node:test";
import assert from "node:assert/strict";
import { derivePdiResult, resolveCsStandard } from "./pdiResult";

const checks = {
  printingArtworkCheck: "OK",
  printingColorCheck: "OK",
  boxSquaringCheck: "OK",
  flapGapCheck: "OK",
  jointPastingDelaminationCheck: "OK",
};

test("passes when CS Actual is exactly 110 percent of CS Standard", () => {
  assert.equal(derivePdiResult({ ...checks, csAchieved: "198" }, "180"), "QC PASS");
});

test("fails when CS Actual is below 110 percent of CS Standard", () => {
  assert.equal(derivePdiResult({ ...checks, csAchieved: "197.9" }, "180"), "QC FAIL");
});

test("fails when a visual check is not OK", () => {
  assert.equal(derivePdiResult({ ...checks, printingColorCheck: "NOT OK", csAchieved: "198" }, "180"), "QC FAIL");
});

test("remains pending when CS Actual or Standard is missing", () => {
  assert.equal(derivePdiResult(checks, "180"), "Pending");
  assert.equal(derivePdiResult({ ...checks, csAchieved: "198" }, ""), "Pending");
});

test("uses the legacy stored CS value when the NPD value is unavailable", () => {
  assert.equal(resolveCsStandard("", "180"), 180);
  assert.equal(resolveCsStandard("190", "180"), 190);
});
