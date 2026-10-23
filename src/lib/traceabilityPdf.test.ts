import assert from "node:assert/strict";
import test from "node:test";
import { calculateTraceabilityPdfSlices, traceabilityPdfFileName } from "./traceabilityPdf";

test("creates a safe traceability PDF filename", () => {
  assert.equal(traceabilityPdfFileName("LNKI/JOB/26-27/17"), "Traceability_LNKI_JOB_26-27_17.pdf");
  assert.equal(traceabilityPdfFileName("  "), "Traceability_traceability.pdf");
});

test("calculates continuous PDF slices without a trailing blank page", () => {
  const slices = calculateTraceabilityPdfSlices(2000, 1389 * 2, 285, 198);
  assert.deepEqual(slices, [
    { sourceY: 0, sourceHeight: 1389 },
    { sourceY: 1389, sourceHeight: 1389 },
  ]);
});

test("keeps a partial final PDF slice", () => {
  assert.deepEqual(calculateTraceabilityPdfSlices(2000, 1500, 285, 198), [
    { sourceY: 0, sourceHeight: 1389 },
    { sourceY: 1389, sourceHeight: 111 },
  ]);
});

test("returns no slices for invalid canvas dimensions", () => {
  assert.deepEqual(calculateTraceabilityPdfSlices(0, 100, 285, 198), []);
  assert.deepEqual(calculateTraceabilityPdfSlices(2000, 0, 285, 198), []);
});
