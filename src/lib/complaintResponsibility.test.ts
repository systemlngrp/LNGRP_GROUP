import { test } from "node:test";
import assert from "node:assert/strict";
import { concernedPersonForJob, isRejectionComplaint } from "./complaintResponsibility";
import type { DispatchPlan, Production, ProductionProcessing } from "../types";

const jobs = [{ id: "job-1", transactionNo: "JOB/1", scheduleId: "schedule-1" }] as Production[];
const processing = [
  { productionId: "job-1", machineName: "Corrugation Liner", updatedBy: "First Liner", updateTimestamp: "2026-10-10T10:00:00Z" },
  { productionId: "job-1", machineName: "Corrugation Linear", updatedBy: "Latest Liner", updateTimestamp: "2026-10-11T10:00:00Z" },
  { productionId: "job-1", machineName: "Printing", updatedBy: "Printer", updateTimestamp: "2026-10-12T10:00:00Z" },
  { productionId: "another-job", machineName: "Printing", updatedBy: "Wrong Job", updateTimestamp: "2026-10-13T10:00:00Z" },
] as ProductionProcessing[];
const dispatches = [
  { scheduleId: "schedule-1", updatedBy: "First Dispatcher", updateTimestamp: "2026-10-10T10:00:00Z" },
  { productionId: "job-1", updatedBy: "Latest Dispatcher", updateTimestamp: "2026-10-12T10:00:00Z" },
] as DispatchPlan[];

test("uses the latest updater for the selected job and area", () => {
  assert.equal(concernedPersonForJob("JOB/1", "Boardline", jobs, processing, dispatches), "Latest Liner");
  assert.equal(concernedPersonForJob("JOB/1", "Printing", jobs, processing, dispatches), "Printer");
  assert.equal(concernedPersonForJob("JOB/1", "Dispatch", jobs, processing, dispatches), "Latest Dispatcher");
});

test("missing or placeholder updater leaves concerned person blank", () => {
  assert.equal(concernedPersonForJob("", "Printing", jobs, processing, dispatches), "");
  assert.equal(concernedPersonForJob("JOB/2", "Printing", jobs, processing, dispatches), "");
  assert.equal(concernedPersonForJob("JOB/1", "Dispatch", jobs, processing, [{ productionId: "job-1", updatedBy: "System User" }] as DispatchPlan[]), "");
});

test("only Rejection is eligible for a new CAPA", () => {
  assert.equal(isRejectionComplaint(" Rejection "), true);
  assert.equal(isRejectionComplaint("Complaint"), false);
});
