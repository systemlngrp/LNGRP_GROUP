import assert from "node:assert/strict";
import test from "node:test";
import { traceabilityPdfFileName } from "./traceabilityPdf";

test("creates a safe traceability PDF filename", () => {
  assert.equal(traceabilityPdfFileName("LNKI/JOB/26-27/17"), "Traceability_LNKI_JOB_26-27_17.pdf");
  assert.equal(traceabilityPdfFileName("  "), "Traceability_traceability.pdf");
});
