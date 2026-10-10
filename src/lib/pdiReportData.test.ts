import { test } from "node:test";
import assert from "node:assert/strict";
import type { PreDispatchInspection, PrintingQcCheck, Production, QualityComplaint } from "../types";
import { buildPdiReportRow, dimensionRange, findLatestInspection, findLatestPreviousComplaint, formatPreviousComplaint, type NpdPdiItem } from "./pdiReportData";

const production = {
  id: "production-1",
  transactionNo: "JOB-1",
  date: "2026-10-09",
  companyName: "Customer",
  erpCode: "12345",
} as unknown as Production;

const item = {
  id: "npd-1",
  name: "Carton",
  lengthId: "430",
  breadthId: "310",
  heightId: "120",
  ply: 5,
  csKgStd: "180",
  artwork: "https://example.com/artwork",
} as unknown as NpdPdiItem;

const inspection = {
  id: "inspection-1",
  productionId: "production-1",
  jobNo: "JOB-1",
  inspectionDate: "2026-10-09T12:30:00.000Z",
  updateTimestamp: "2026-10-09T12:31:00.000Z",
  lengthId: "431",
  widthId: "311",
  heightId: "121",
  csRequired: "999",
  csAchieved: "185",
  bGsm: "320",
  boxWeightGrams: "440",
  printingArtworkCheck: "OK",
  printingColorCheck: "NOT OK",
  boxSquaringCheck: "OK",
  flapGapCheck: "OK",
  jointPastingDelaminationCheck: "OK",
  remarks: "Review color",
  frontPhoto: "front.jpg",
  backPhoto: "back.jpg",
  result: "QC HOLD",
  qcPerson: "Inspector",
} as PreDispatchInspection;

test("prefers the latest inspection for the production ID over a job fallback", () => {
  const old = { ...inspection, id: "old", updateTimestamp: "2026-10-08T10:00:00.000Z" };
  const wrongProduction = { ...inspection, id: "other", productionId: "other-id", updateTimestamp: "2026-10-10T10:00:00.000Z" };
  assert.equal(findLatestInspection([old, wrongProduction, inspection], "production-1", "JOB-1")?.id, "inspection-1");
  assert.equal(findLatestInspection([wrongProduction], "missing", "JOB-1")?.id, "other");
  assert.equal(findLatestInspection([wrongProduction], "missing", "missing"), undefined);
});

test("uses NPD specifications and saved inspection values for the report", () => {
  const printing = {
    previousCustomerComplaintWarning: "Watch this item",
    lengthId: 999,
    column40: "Printing QC value",
  } as PrintingQcCheck;
  const row = buildPdiReportRow(production, item, inspection, printing);
  assert.deepEqual(
    ["Required Length", "Achieved Length", "Min length", "Max Length", "Required Width", "Achieved Width", "Width Min", "Width Max", "Required Height", "Achieved Height", "Height Min", "Height Max"].map((column) => row[column]),
    [430, 431, 425, 435, 310, 311, 305, 315, 120, 121, 115, 125],
  );
  assert.equal(row["Previous Customer Complaint"], "Watch this item");
  assert.equal(row["Printing Color Check"], "NOT OK");
  assert.equal(row["Box Squaring Check"], "OK");
  assert.equal(row["Box Photo [FRONT]"], "/uploads/front.jpg");
  assert.equal(row["Box Photo [BACK]"], "/uploads/back.jpg");
  assert.equal(row.Result, "QC HOLD");
  assert.equal(row["QC Person Name"], "Inspector");
  assert.equal(row["PDI TIME"], inspection.inspectionDate);
  assert.equal(row["CS Act / CS STD"], "185 / 180");
  assert.equal(row["B.GSM"], 320);
  assert.equal(row["Box Weight (Grams)"], 440);
  assert.equal(row.Ply, 5);
  assert.equal(row["Standard CS"], 180);
  assert.equal(row["STD CS"], 180);
  assert.equal(row["Actual CS"], 185);
});

test("leaves inspection data and invalid dimension ranges empty", () => {
  const row = buildPdiReportRow(production, item, undefined, { lengthId: 999, column40: "Old QC" } as PrintingQcCheck);
  assert.equal(row["Achieved Length"], "");
  assert.equal(row["Printing Artwork Check"], "");
  assert.equal(row["Box Photo [FRONT]"], "");
  assert.equal(row.Result, "");
  assert.equal(row["Actual CS"], "");
  assert.equal(row["CS Act / CS STD"], "");
  assert.equal(row["B.GSM"], "");
  assert.equal(row["Box Weight (Grams)"], "");
  const withoutStandard = buildPdiReportRow(production, undefined, inspection);
  assert.equal(withoutStandard["CS Act / CS STD"], "185");
  assert.equal(withoutStandard["B.GSM"], 320);
  assert.equal(withoutStandard["Box Weight (Grams)"], 440);
  assert.equal(buildPdiReportRow(production, undefined, inspection)["STD CS"], 0);
  assert.deepEqual(dimensionRange("430", ""), { min: "", max: "" });
  assert.deepEqual(dimensionRange("invalid", 5), { min: "", max: "" });
});

test("finds the latest complaint before the production date by normalized ERP code", () => {
  const complaints = [
    { id: "old", erpCode: " 12345 ", dateOfComplaint: "2026-10-01", timestamp: "2026-10-01T08:00:00.000Z", issueDetails: "Old issue", lotNo: "LOT-OLD" },
    { id: "latest", erpCode: "12345", dateOfComplaint: "2026-10-08", timestamp: "2026-10-08T09:00:00.000Z", issueDetails: "Latest issue", lotNo: "LOT-LATEST" },
    { id: "same-day", erpCode: "12345", dateOfComplaint: "2026-10-09", timestamp: "2026-10-09T09:00:00.000Z", issueDetails: "Same day" },
    { id: "future", erpCode: "12345", dateOfComplaint: "2026-10-10", timestamp: "2026-10-10T09:00:00.000Z", issueDetails: "Future issue" },
  ] as QualityComplaint[];
  const result = findLatestPreviousComplaint(complaints, "12345", "2026-10-09");
  assert.equal(result?.id, "latest");
  assert.equal(formatPreviousComplaint(result), "Latest issue | Date: 2026-10-08 | LOT NO.: LOT-LATEST");
});

test("prefers a stored previous complaint over the Printing QC warning", () => {
  const row = buildPdiReportRow(production, item, inspection, { previousCustomerComplaintWarning: "Printing warning" } as PrintingQcCheck, "Complaint details | Date: 2026-10-01 | LOT NO.: LOT-1");
  assert.equal(row["Previous Customer Complaint"], "Complaint details | Date: 2026-10-01 | LOT NO.: LOT-1");
});
