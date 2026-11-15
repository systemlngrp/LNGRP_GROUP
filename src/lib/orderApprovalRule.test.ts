import assert from "node:assert/strict";
import test from "node:test";
import { autoApprovalReasons } from "./orderApprovalRule";

test("passes when rate = last billed and RAPC >= chart", () => {
  assert.deepEqual(autoApprovalReasons({ rate: 10.47, billing1: 10.47, chartRate: 50, rapc1: 50 }), []);
});

test("lists every reason it fails", () => {
  assert.deepEqual(autoApprovalReasons({ rate: 10.5, billing1: 10.47, chartRate: 50, rapc1: 45.2 }), ["Rate 10.50 ≠ last billed 10.47", "RAPC 45.20 < chart 50.00"]);
  assert.deepEqual(autoApprovalReasons({ rate: 10 }), ["No billing history", "No realization chart for order date", "No RAPC history"]);
});
