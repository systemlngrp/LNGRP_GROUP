import { test } from "node:test";
import assert from "node:assert/strict";
import { dateKey, jobDateCellClass, jobNumberCellClass } from "./jobCellColors";

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
  assert.match(jobNumberCellClass("2026-10-06", "QC PASS", today), /bg-\[#b7e1cd\]/);
  assert.match(jobNumberCellClass("2026-10-09", "QC HOLD", today), /bg-\[#f4cccc\]/);
  assert.match(jobNumberCellClass("2026-10-09", "QC FAIL", today), /bg-\[#f4cccc\]/);
  assert.match(jobNumberCellClass("2026-10-06", "Pending", today), /bg-\[#ffff00\]/);
  assert.match(jobNumberCellClass("2026-10-08", "", today), /bg-\[#ffff00\]/);
  assert.match(jobNumberCellClass("2026-10-09", "", today), /bg-\[#00ffff\]/);
  assert.equal(jobNumberCellClass("invalid", "", today), "");
});
