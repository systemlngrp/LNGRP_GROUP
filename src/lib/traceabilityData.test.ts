import assert from "node:assert/strict";
import test from "node:test";
import type { BoardLineQcCheck, DispatchPlan, Item, LoadingSlip, PreDispatchInspection, PrintingQcCheck, Production, ProductionProcessing, Truck } from "../types";
import { buildTraceabilityRecord, buildTraceabilityRecords } from "./traceabilityData";

const production = (overrides: Partial<Production> = {}): Production => ({
  id: "production-1",
  transactionNo: "0010430",
  date: "2026-10-10",
  itemId: "item-1",
  qty: 100,
  uom: "PCS",
  remarks: "",
  status: "Pending Tally",
  plannedQty: 100,
  scheduledDate: "2026-10-10",
  erpCode: "12345678",
  companyName: "Example Party",
  ...overrides,
});

const item: Item = {
  id: "item-1",
  groupId: "fg",
  name: "Example Box",
  uom: "PCS",
  erp: 12345678,
  artwork: "https://example.test/artwork.png",
  spec: "https://example.test/spec.pdf",
  length: 251,
  breadth: 196,
  height: 230,
  ply: 5,
  flute: "A",
  rapc: 0,
};

const boardline = (overrides: Partial<BoardLineQcCheck> = {}): BoardLineQcCheck => ({
  id: "board-1",
  timestamp: "2026-10-10T10:00:00Z",
  jobNo: "10430",
  partyName: "Example Party",
  itemName: "Example Box",
  checkNo: 1,
  qcPerson: "Board QC",
  boardGsm: 418,
  boardThickness: 5.08,
  cuttingSizeMm: 945,
  typeOfFlute: "A",
  ...overrides,
});

const printing = (overrides: Partial<PrintingQcCheck> = {}): PrintingQcCheck => ({
  id: "printing-1",
  timestamp: "2026-10-10T11:00:00Z",
  jobNo: "10430",
  partyName: "Example Party",
  itemName: "Example Box",
  checkNo: 1,
  qcPerson: "Printing QC",
  standardBoxSize: "251 x 196 x 230",
  boxSizeAchieved: "251 x 196 x 230",
  boxWeightGrams: 168,
  printingColor1Standard: "GREEN",
  colour1Actual: "GREEN",
  ...overrides,
});

const inspection = (overrides: Partial<PreDispatchInspection> = {}): PreDispatchInspection => ({
  id: "pdi-1",
  productionId: "production-1",
  jobNo: "10430",
  lotNo: "LOT-10430",
  result: "QC PASS",
  inspectionDate: "2026-10-10T15:00:00Z",
  qcPerson: "PDI QC",
  lengthId: 251,
  widthId: 196,
  heightId: 230,
  csAchieved: 149,
  ...overrides,
});

const processing: ProductionProcessing[] = [
  { id: "process-board", productionId: "production-1", jobNo: "10430", machineId: "m1", machineName: "Corrugation Liner", shift: "Day", qty: 90, operatorId: "op1", operatorName: "Board Operator", date: "2026-10-10T12:00:00Z" },
  { id: "process-print", productionId: "production-1", jobNo: "10430", machineId: "m2", machineName: "Printing", shift: "Day", qty: 80, operatorId: "op2", operatorName: "Print Operator", date: "2026-10-10T14:00:00Z" },
];

const plans: DispatchPlan[] = [{ id: "plan-1", scheduleId: "schedule-1", orderId: "order-1", productionId: "production-1", truckId: "truck-1", plannedQty: 100, loadedQty: 80, status: "Dispatched", date: "2026-10-10" }];
const slips: LoadingSlip[] = [{ id: "slip-1", slipNo: "LS-1", date: "2026-10-10", truckId: "truck-1", truckNo: "AB-01", invoiceNo: "INV-1", lines: [{ dispatchPlanId: "plan-1", loadedQty: 80, jobNos: ["10430"] }] }];
const trucks: Truck[] = [{ id: "truck-1", truckNo: "AB-01", driverName: "Driver One", mobileNo: "9999999999" }];

const baseInput = {
  productions: [production()],
  items: [item],
  processing,
  boardline: [boardline(), boardline({ id: "board-2", timestamp: "2026-10-10T13:00:00Z", cuttingSizeMm: 950 })],
  printing: [printing(), printing({ id: "printing-2", timestamp: "2026-10-10T14:00:00Z", boxWeightGrams: 169 })],
  inspections: [inspection(), inspection({ id: "pdi-old", productionId: "other-production", lotNo: "WRONG-LOT", inspectionDate: "2026-10-10T20:00:00Z" }), inspection({ id: "pdi-2", lotNo: "LOT-10430-LATEST", inspectionDate: "2026-10-10T16:00:00Z" })],
  dispatchPlans: plans,
  loadingSlips: slips,
  trucks,
};

test("traceability joins normalized job numbers and selects latest stage records", () => {
  const record = buildTraceabilityRecord(production(), baseInput);
  assert.equal(record.jobNo, "0010430");
  assert.equal(record.lotNo, "LOT-10430-LATEST");
  assert.equal(record.boardline.cuttingSizeMm, 950);
  assert.equal(record.converting.boxWeightGrams, 169);
  assert.equal(record.pdi.qcInspector, "PDI QC");
  assert.equal(record.boardline.quantityProducedPcs, 90);
  assert.equal(record.converting.quantityProduced, 80);
  assert.equal(record.dispatch.dispatchQuantity, 80);
  assert.equal(record.dispatch.driverName, "Driver One");
});

test("traceability prioritizes inspection productionId over a later same-job record", () => {
  const record = buildTraceabilityRecord(production(), {
    ...baseInput,
    inspections: [inspection({ id: "exact", lotNo: "EXACT-LOT", inspectionDate: "2026-10-10T10:00:00Z" }), inspection({ id: "other", productionId: "other-production", lotNo: "OTHER-LOT", inspectionDate: "2026-10-10T23:00:00Z" })],
  });
  assert.equal(record.lotNo, "EXACT-LOT");
});

test("traceability status is derived from cancellation and closure fields", () => {
  assert.equal(buildTraceabilityRecord(production({ status: "Completed" }), { ...baseInput, productions: [] }).status, "JOB CLOSED");
  assert.equal(buildTraceabilityRecord(production({ status: "Cancelled" }), { ...baseInput, productions: [] }).status, "JOB CANCELLED");
  assert.equal(buildTraceabilityRecord(production({ status: "Pending PH" }), { ...baseInput, productions: [] }).status, "JOB OPEN");
});

test("record builder keeps cancelled productions visible with their status", () => {
  const records = buildTraceabilityRecords({ ...baseInput, productions: [production(), production({ id: "cancelled", status: "Cancelled" })] });
  assert.equal(records.length, 2);
  assert.equal(records[1].status, "JOB CANCELLED");
});

test("paper spec uses NPD layer values instead of production layer values", () => {
  const record = buildTraceabilityRecord(production({ l1: 999, f1: 999 }), {
    ...baseInput,
    items: [{ ...item, l1: 120, f1: 120, l2: 150, f2: 150, l3: 150, f3: 120, b3: 999 }],
  });
  assert.equal(record.boardline.paperSpec, "L1 120 / F1 120 / L2 150 / F2 150 / L3 150 / F3 120");
});

test("planned paper uses Production Plan layer values in layer order", () => {
  const record = buildTraceabilityRecord(production({
    l1: 120,
    f1: 120,
    l2: 150,
    f2: 150,
    l3: 150,
    totalPaperWeight: 309.75,
    reelAsPerCalc: 1600,
  }), { ...baseInput, items: [{ ...item, l1: 999, f1: 999 }] });
  assert.equal(record.boardline.plannedPaper, "120 / 120 / 150 / 150 / 150");
  assert.equal(record.boardline.paperRequiredKg, 309.75);
});

test("planned paper omits blank and zero Production Plan layers", () => {
  const record = buildTraceabilityRecord(production({ l1: 120, f1: 0, l2: undefined, f2: 150, l3: 0 }), baseInput);
  assert.equal(record.boardline.plannedPaper, "120 / 150");
});

test("missing source values remain blank instead of being fabricated", () => {
  const record = buildTraceabilityRecord(production({ erpCode: "", companyName: "" }), { productions: [], items: [] });
  assert.equal(record.erpCode, "");
  assert.equal(record.dispatch.invoiceNo, "");
  assert.equal(record.boardline.paperSpec, "");
});

test("record builder tolerates unavailable dataset arrays while data loads", () => {
  const record = buildTraceabilityRecord(production(), { productions: [], items: undefined as any });
  assert.equal(record.jobNo, "0010430");
  assert.equal(record.itemName, "");
  assert.equal(record.pdi.result, "");
});
