import assert from "node:assert/strict";
import test from "node:test";
import type { DispatchPlan, LoadingSlip, Order, OrderSchedule, Production } from "../types";
import {
  countEligibleLoadingPlans,
  getLoadingJobNumber,
  getPendingLoadingPlanProjections,
} from "./pendingLoadingEligibility";

const production = (overrides: Partial<Production> = {}): Production => ({
  id: "job-1",
  transactionNo: "JOB/26/001",
  date: "2026-10-14",
  itemId: "legacy-item",
  qty: 100,
  uom: "PCS",
  remarks: "",
  status: "Pending FFG",
  prodFromFFG: 100,
  orderFirmId: "firm-a",
  ...overrides,
});

const plan = (overrides: Partial<DispatchPlan> = {}): DispatchPlan => ({
  id: "plan-1",
  scheduleId: "schedule-1",
  orderId: "order-1",
  truckId: "",
  plannedQty: 80,
  loadedQty: 20,
  canceledQty: 0,
  status: "Planned",
  date: "2026-10-14",
  ...overrides,
});

const order: Order = {
  id: "order-1",
  companyId: "company-1",
  firmId: "wrong-firm",
  itemId: " legacy-item ",
  itemSource: "FG",
  erpCode: " ERP-1 ",
  orderNo: "ORD-1",
} as Order;

const schedule: OrderSchedule = {
  id: "schedule-1",
  orderId: "order-1",
  firmId: "wrong-firm",
  scheduleNo: "SCH-1",
  scheduledDate: "2026-10-14",
  qty: 80,
} as OrderSchedule;

const item = {
  id: "catalog-item",
  source: "FG" as const,
  name: "Example item",
  erp: "ERP-1",
  raw: { id: "catalog-item", npdId: "legacy-item", erp: "ERP-1" },
};

const args = (overrides: Partial<Parameters<typeof getPendingLoadingPlanProjections>[0]> = {}) => ({
  plans: [plan({ orderFirmId: " FIRM-A " })],
  orders: [order],
  schedules: [schedule],
  firms: [{ id: "firm-a" }],
  companies: [{ id: "company-1", name: "Example Company" } as any],
  productions: [production()],
  phpJobs: [],
  plateJobs: [],
  loadingSlips: [] as LoadingSlip[],
  resolveOrderItem: () => item,
  ...overrides,
});

test("matches legacy item aliases and gives plan-level firm precedence", () => {
  const rows = getPendingLoadingPlanProjections(args());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].firmId, "firm-a");
  assert.equal(rows[0].itemSource, "FG");
  assert.equal(rows[0].pendingQty, 60);
});

test("falls back to the ERP catalog match when the exact item reference is missing", () => {
  const rows = getPendingLoadingPlanProjections(args({
    resolveOrderItem: () => undefined,
    findItemAcrossSources: (_itemId, _source, erpCode) =>
      String(erpCode || "").trim().toLowerCase() === "erp-1" ? item : undefined,
  }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].item?.id, "catalog-item");
});

test("excludes closed, cancelled, tallied, and fully loaded jobs", () => {
  const rows = getPendingLoadingPlanProjections(args({
    productions: [
      production({ id: "closed", status: "closed", transactionNo: "JOB/26/010" }),
      production({ id: "cancelled", status: "CANCELED", transactionNo: "JOB/26/009" }),
      production({ id: "tallied", status: "Pending FFG", tallyPostingStatus: "Yes", transactionNo: "JOB/26/008" } as any),
      production({ id: "loaded", transactionNo: "JOB/26/007" }),
      production({ id: "open", transactionNo: "JOB/26/006", jobCardNo: "JC-006" }),
    ],
    loadingSlips: [{
      id: "slip-1",
      slipNo: "LS-1",
      date: "2026-10-14",
      lines: [{
        dispatchPlanId: "plan-1",
        loadedQty: 100,
        allocations: [{ sourceType: "job", jobId: "loaded", jobNo: "JOB/26/007", qty: 100 }],
      }],
      status: "Active",
    } as LoadingSlip],
  }));
  assert.deepEqual(rows[0].eligibleJobs.map((job) => job.jobId), ["open"]);
});

test("returns only the newest three jobs and falls back to Job Card No.", () => {
  const jobs = [1, 2, 3, 4].map((number) => production({
    id: `job-${number}`,
    transactionNo: number === 1 ? "" : `JOB/26/00${number}`,
    jobCardNo: number === 1 ? "JC-001" : undefined,
  }));
  const rows = getPendingLoadingPlanProjections(args({ productions: jobs }));
  assert.deepEqual(rows[0].eligibleJobs.map((job) => job.jobNo), ["JOB/26/004", "JOB/26/003", "JOB/26/002"]);
  assert.equal(getLoadingJobNumber(jobs[0]), "JC-001");
});

test("page projections and sidebar count use the same eligible rows", () => {
  const projections = getPendingLoadingPlanProjections(args({
    plans: [plan(), plan({ id: "empty", plannedQty: 10, loadedQty: 10 })],
  }));
  assert.equal(countEligibleLoadingPlans(args({
    plans: [plan(), plan({ id: "empty", plannedQty: 10, loadedQty: 10 })],
  })), projections.length);
});
