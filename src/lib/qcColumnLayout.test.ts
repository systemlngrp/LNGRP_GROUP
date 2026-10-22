import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQcColumnSelection, QC_REPORT_COLUMN_COUNTS, validQcColumnSelection } from "./qcColumnLayout";

test("QC report layouts remain separate and parse in display order", () => {
  assert.equal(QC_REPORT_COLUMN_COUNTS["qc-view"], 57);
  assert.equal(QC_REPORT_COLUMN_COUNTS["pdi-report"], 34);
  assert.deepEqual(parseQcColumnSelection("[3,1]", 5), [1, 3]);
});

test("missing or invalid saved layout shows all columns", () => {
  for (const value of [undefined, "not json", "[]", "[1,1]", "[99]", "[\"1\"]"]) {
    assert.deepEqual(parseQcColumnSelection(value, 3), [0, 1, 2]);
  }
});

test("PDI schema version ignores legacy layouts and accepts versioned layouts", () => {
  assert.deepEqual(parseQcColumnSelection("[0,1,18]", 34, 2), Array.from({ length: 34 }, (_, index) => index));
  assert.deepEqual(parseQcColumnSelection(JSON.stringify({ schemaVersion: 2, columns: [3, 1] }), 34, 2), [1, 3]);
});

test("save selection rejects empty, duplicate, and out-of-range columns", () => {
  assert.equal(validQcColumnSelection([0, 2], 3), true);
  assert.equal(validQcColumnSelection([], 3), false);
  assert.equal(validQcColumnSelection([0, 0], 3), false);
  assert.equal(validQcColumnSelection([3], 3), false);
});
