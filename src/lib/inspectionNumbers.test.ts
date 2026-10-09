import { test } from "node:test";
import assert from "node:assert/strict";
import type { PreDispatchInspection } from "../types";
import { INSPECTION_NUMBER_FIELDS, inspectionDraftForJob, invalidInspectionNumberField, isPositiveDecimal } from "./inspectionNumbers";

const valid = Object.fromEntries(INSPECTION_NUMBER_FIELDS.map(([field]) => [field, "1.25"])) as Partial<PreDispatchInspection>;

test("accepts positive whole and decimal values", () => {
  for (const value of [1, "42", "1.25", ".5", "0.0001", " 2.5 "]) {
    assert.equal(isPositiveDecimal(value), true, String(value));
  }
  assert.equal(invalidInspectionNumberField(valid), undefined);
});

test("rejects blank, zero, negative, units, and other text in each inspection number field", () => {
  for (const value of ["", " ", 0, "0.0", "-2", "987inch", "65inch", "abc", "1e3", "Infinity"]) {
    assert.equal(isPositiveDecimal(value), false, String(value));
  }
  for (const [field, label] of INSPECTION_NUMBER_FIELDS) {
    assert.equal(invalidInspectionNumberField({ ...valid, [field]: "987inch" }), label);
  }
});

test("old invalid values remain identifiable until corrected", () => {
  const stored = { ...valid, gsmAchieved: "987inch" };
  assert.equal(stored.gsmAchieved, "987inch");
  assert.equal(invalidInspectionNumberField(stored), "GSM Achieved");
  assert.equal(invalidInspectionNumberField({ ...stored, gsmAchieved: "987" }), undefined);
});
test("job selection leaves new measurements blank and preserves saved manual values", () => {
  const job = { productionId: "production-1", jobNo: "JOB-1", plannedQty: 500, firmName: "Firm" };
  const fresh = inspectionDraftForJob(job);
  for (const field of ["bGsm", "lengthId", "widthId", "heightId"] as const) assert.equal(fresh[field], undefined);
  const saved = { productionId: "production-1", jobNo: "JOB-1", plannedQty: 400, bGsm: "987inch", lengthId: "430", widthId: "300", heightId: "120", csRequired: "190", lotNo: "old-lot" } as PreDispatchInspection;
  const reopened = inspectionDraftForJob(job, saved);
  assert.equal(reopened.bGsm, "987inch");
  assert.equal(reopened.lengthId, "430");
  assert.equal(reopened.widthId, "300");
  assert.equal(reopened.heightId, "120");
  assert.equal(reopened.plannedQty, 400);
  assert.equal(reopened.csRequired, "190");
  assert.equal(reopened.lotNo, "old-lot");
  assert.equal(invalidInspectionNumberField({ ...valid, bGsm: reopened.bGsm }), "B.GSM");
  assert.equal(invalidInspectionNumberField({ ...valid, csRequired: "old text" }), undefined);
});
