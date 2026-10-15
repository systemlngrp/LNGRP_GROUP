import { test } from "node:test";
import assert from "node:assert/strict";
import { dateKey, jobDateCellClass, jobNumberCellClass, normalizeQcResult, qcResultCellClass, realizationCellClass } from "./jobCellColors";

const today = new Date(2026, 9, 9, 12);

test("job dates use the four requested backgrounds", () => {
  assert.match(jobDateCellClass("2026-10-06", today), /bg-\[#fff2cc\]/);
  assert.match(jobDateCellClass("08-10-2026", today), /bg-\[#f4cccc\]/);
  assert.match(jobDateCellClass("2026-10-09", today), /bg-\[#00ffff\]/);
  assert.match(jobDateCellClass("2026-10-10", today), /bg-\[#cee1f2\]/);
  assert.match(jobDateCellClass("2026-10-15", today), /bg-\[#cee1f2\]/);
  assert.match(jobDateCellClass("2026-10-09", today), /font-bold/);
  assert.equal(dateKey("2026-02-30"), "");
  assert.equal(jobDateCellClass("invalid", today), "");
});

test("QC results override the Job No. date color", () => {
  assert.match(jobNumberCellClass("2026-10-06", "QC PASS", today), /bg-\[#006100\]/);
  assert.match(jobNumberCellClass("2026-10-09", "QC HOLD", today), /bg-\[#006100\]/);
  assert.match(jobNumberCellClass("2026-10-09", "QC FAIL", today), /bg-\[#006100\]/);
  assert.match(qcResultCellClass("FAIL"), /bg-\[#006100\]/);
  assert.equal(normalizeQcResult("QC HOLD"), "QC FAIL");
  assert.equal(normalizeQcResult("Pending"), "Pending");
  assert.match(jobNumberCellClass("2026-10-06", "Pending", today), /bg-\[#ffff00\]/);
  assert.match(jobNumberCellClass("2026-10-08", "", today), /bg-\[#ffff00\]/);
  assert.match(jobNumberCellClass("2026-10-09", "", today), /bg-\[#00ffff\]/);
  assert.equal(jobNumberCellClass("invalid", "", today), "");
});

test("realization values use the configured target bands", () => {
  assert.match(realizationCellClass(43, 44), /bg-\[#ff0000\]/);
  assert.match(realizationCellClass(44, 44), /bg-\[#b6d7a8\]/);
  assert.match(realizationCellClass(50, 44), /bg-\[#b6d7a8\]/);
  assert.match(realizationCellClass(51, 44), /bg-\[#00ff00\]/);
  assert.equal(realizationCellClass("", 44), "");
  assert.equal(realizationCellClass("invalid", 44), "");
  assert.equal(realizationCellClass(44, ""), "");
});
