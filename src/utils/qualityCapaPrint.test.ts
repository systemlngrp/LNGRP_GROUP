import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQualityCapaPrintHtml } from "./qualityCapaPrint";
import type { QualityComplaint } from "../types";

const complaint = { capaNo: "CAPA/1", dateOfComplaint: "2026-10-05", partyName: "Customer", itemName: "Item", erpCode: "999", lotNo: "JOB/1", issueDetails: "Complaint", quantity: 10 } as QualityComplaint;

test("CAPA print follows the reference and escapes narrative text", () => {
  const html = buildQualityCapaPrintHtml(complaint, {
    rejectionDetails: "<unsafe>", productionFailureRootCause: "Production cause", detectionFailureRootCause: "Detection cause",
    correctiveAction: "Corrected", productionPreventiveAction: "Production plan", detectionPreventiveAction: "Detection plan",
    productionTargetDate: "2026-11-03", detectionTargetDate: "2026-11-04", preparedBy: "Maker", hodProduction: "Manager",
  }, { linkedDetails: { deliveryNo: "INV-2", vehicleNo: "TRUCK", invoiceDate: "2026-09-30", productionDate: "2026-09-24", dispatchDate: "2026-09-30" } });
  assert.match(html, /CORRECTIVE AND PREVENTIVE ACTION REPORT/);
  assert.match(html, /ANALYSIS AND ACTION PLAN FOR ABOVE NCR/);
  assert.match(html, /INV-2/);
  assert.match(html, /3\/11\/2026/);
  assert.match(html, /HOD Production/);
  assert.match(html, /&lt;unsafe&gt;/);
  assert.doesNotMatch(html, /<unsafe>/);
  assert.match(html, /Additional CAPA and complaint details/);
});

test("historical CAPA without new fields remains printable", () => {
  const html = buildQualityCapaPrintHtml(complaint, { targetDate: "2026-11-03" });
  assert.match(html, /3\/11\/2026/);
  assert.match(html, /Customer Name/);
});

test("an explicitly cleared invoice number is not replaced during printing", () => {
  const html = buildQualityCapaPrintHtml(complaint, { deliveryNo: "" }, {
    linkedDetails: { deliveryNo: "INV-2", vehicleNo: "", invoiceDate: "", productionDate: "", dispatchDate: "" },
  });
  assert.doesNotMatch(html, /INV-2/);
});
