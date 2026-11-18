import { test } from "node:test";
import assert from "node:assert/strict";
import { derivePdiResult, parsePdiCsMarginPercent, requiredPdiCs, resolveCsStandard } from "./pdiResult";

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

test("CS Achieved 0 means CS not tested: result follows the checks", () => {
  assert.equal(derivePdiResult({ ...checks, csAchieved: "0" }, "180"), "QC PASS");
  assert.equal(derivePdiResult({ ...checks, flapGapCheck: "NOT OK", csAchieved: "0" }, "180"), "QC FAIL");
  assert.equal(derivePdiResult({ ...checks, flapGapCheck: "", csAchieved: "0" }, "180"), "Pending");
});

test("CS margin comes from Settings: CS Std 120 needs 132 at 10%, 126 at 5%", () => {
  const ok = { printingArtworkCheck: "OK", printingColorCheck: "OK", boxSquaringCheck: "OK", flapGapCheck: "OK", jointPastingDelaminationCheck: "OK" };
  assert.equal(derivePdiResult({ ...ok, csAchieved: "127" }, "120"), "QC FAIL");
  assert.equal(derivePdiResult({ ...ok, csAchieved: "127" }, "120", 5), "QC PASS");
  assert.equal(derivePdiResult({ ...ok, csAchieved: "120" }, "120", 0), "QC PASS");
  assert.equal(parsePdiCsMarginPercent({ pdiCsMarginPercent: "" }), 10);
  assert.equal(parsePdiCsMarginPercent({ pdiCsMarginPercent: "5" }), 5);
  assert.equal(parsePdiCsMarginPercent(null), 10);
  assert.equal(requiredPdiCs("120", 10), 132);
});
