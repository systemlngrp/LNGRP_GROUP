import { test } from "node:test";
import assert from "node:assert/strict";
import { findCapaLinkedDetails } from "./capaReportLinks";
import type { DispatchPlan, Invoice, LoadingSlip, Production, QualityComplaint } from "../types";

const complaint = { lotNo: "JOB/1", firmId: "firm-1" } as QualityComplaint;
const productions = [{ id: "job-1", transactionNo: "JOB/1", firmId: "firm-1", date: "2026-09-24", scheduleId: "schedule-1" }] as Production[];
const plans = [
  { id: "plan-1", productionId: "job-1", status: "Dispatched", date: "2026-09-29" },
  { id: "plan-2", productionId: "job-1", status: "Dispatched", date: "2026-09-30" },
] as DispatchPlan[];
const slips = [
  { id: "slip-1", date: "2026-09-29", invoiceId: "invoice-1", truckNo: "OLD", lines: [{ dispatchPlanId: "plan-1" }] },
  { id: "slip-2", date: "2026-09-30", invoiceId: "invoice-2", truckNo: "NEW", lines: [{ dispatchPlanId: "plan-2" }] },
] as LoadingSlip[];
const invoices = [
  { id: "invoice-1", invoiceNo: "INV-1", date: "2026-09-29" },
  { id: "invoice-2", invoiceNo: "INV-2", date: "2026-09-30" },
] as Invoice[];

test("CAPA header uses the latest records linked to its job", () => {
  assert.deepEqual(findCapaLinkedDetails(complaint, productions, plans, slips, invoices), {
    deliveryNo: "INV-2", vehicleNo: "NEW", invoiceDate: "2026-09-30", productionDate: "2026-09-24", dispatchDate: "2026-09-30",
  });
});

test("unlinked jobs never inherit unrelated invoice details", () => {
  assert.deepEqual(findCapaLinkedDetails({ ...complaint, lotNo: "JOB/2" }, productions, plans, slips, invoices), {
    deliveryNo: "", vehicleNo: "", invoiceDate: "", productionDate: "", dispatchDate: "",
  });
});
