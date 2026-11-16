import assert from "node:assert/strict";
import test from "node:test";
import { AUTO_APPROVED_BY, decideOrderApproval, describeRuleCheck } from "./orderApproval";

const NOW = "2026-11-15T15:00:00.000Z";
const pass = async () => true;
const fail = async () => false;
const mustNotRun = async () => { throw new Error("rule should not run"); };

test("new order from the order form: rule passes -> approved automatically", async () => {
  const d = await decideOrderApproval({ status: "Pending PH", updatedBy: "u1" }, null, pass, NOW);
  assert.deepEqual(d, { status: "Pending Scheduling", approvedTimestamp: NOW, approvedEmail: AUTO_APPROVED_BY, ruleApplied: true, path: "rule" });
});

test("new order from the order form: rule fails -> waits in Pending Salesman Approval", async () => {
  const d = await decideOrderApproval({ status: "Pending PH" }, null, fail, NOW);
  assert.deepEqual(d, { status: "Pending PH", approvedTimestamp: null, approvedEmail: null, ruleApplied: true, path: "rule" });
});

test("new order with no status is treated like Pending PH", async () => {
  const d = await decideOrderApproval({}, null, fail, NOW);
  assert.equal(d.status, "Pending PH");
});

test("Approve button (Pending Scheduling + stamp) approves without the rule", async () => {
  const d = await decideOrderApproval({ status: "Pending Scheduling", approvedEmail: "System User" }, { status: "Pending PH" }, mustNotRun, NOW);
  assert.deepEqual(d, { status: "Pending Scheduling", approvedTimestamp: NOW, approvedEmail: "System User", ruleApplied: false, path: "explicit" });
});

test("import with status Scheduled keeps Scheduled", async () => {
  const d = await decideOrderApproval({ status: "Scheduled", approvedTimestamp: "2026-11-13T06:39:16.577Z", approvedEmail: "Salesman App Import" }, null, mustNotRun, NOW);
  assert.equal(d.status, "Scheduled");
  assert.equal(d.approvedTimestamp, "2026-11-13T06:39:16.577Z");
});

test("editing an approved order keeps its approval, even if the form sends Pending PH", async () => {
  const stored = { status: "Pending Scheduling", approvedTimestamp: "2026-11-13T06:39:16.577Z", approvedEmail: "Salesman App Import" };
  const d = await decideOrderApproval({ status: "Pending PH" }, stored, mustNotRun, NOW);
  assert.deepEqual(d, { status: "Pending Scheduling", approvedTimestamp: "2026-11-13T06:39:16.577Z", approvedEmail: "Salesman App Import", ruleApplied: false, path: "kept" });
});

test("editing a Scheduled order keeps Scheduled", async () => {
  const d = await decideOrderApproval({ status: "Pending Scheduling" }, { status: "Scheduled" }, mustNotRun, NOW);
  assert.equal(d.status, "Pending Scheduling");
  const d2 = await decideOrderApproval({}, { status: "Scheduled" }, mustNotRun, NOW);
  assert.equal(d2.status, "Scheduled");
});

test("editing an unapproved order re-runs the rule", async () => {
  const d = await decideOrderApproval({ status: "Pending PH" }, { status: "Pending PH" }, fail, NOW);
  assert.equal(d.status, "Pending PH");
});

test("cancelled stays cancelled", async () => {
  const d = await decideOrderApproval({ status: "Cancelled", approvedTimestamp: "x1" }, { status: "Pending Scheduling" }, mustNotRun, NOW);
  assert.equal(d.status, "Cancelled");
  assert.equal(d.approvedTimestamp, "x1");
});

import { realizationTargetForDate } from "./orderApproval";
test("realization target comes from Settings > Realization Setup periods", () => {
  const raw = JSON.stringify([
    { dateFrom: "2026-04-01", dateTo: "2026-08-31", value: 44 },
    { dateFrom: "2026-09-01", dateTo: "2027-03-31", value: 48 },
    { dateFrom: "2026-11-10", dateTo: "2026-11-20", value: 50 },
  ]);
  assert.equal(realizationTargetForDate(raw, "2026-06-15"), 44);
  assert.equal(realizationTargetForDate(raw, "2026-10-01"), 48);
  assert.equal(realizationTargetForDate(raw, "2026-11-15"), 50);
  assert.equal(realizationTargetForDate(raw, "2027-04-01"), undefined);
  assert.equal(realizationTargetForDate("", "2026-06-15"), undefined);
  assert.equal(realizationTargetForDate("not json", "2026-06-15"), undefined);
});

test("rule path is reported and the reason reads well", async () => {
  const d = await decideOrderApproval({ status: "Pending PH" }, null, pass, NOW);
  assert.equal(d.path, "rule");
  const e = await decideOrderApproval({ status: "Pending Scheduling", approvedEmail: "Ravi" }, { status: "Pending PH" }, mustNotRun, NOW);
  assert.equal(e.path, "explicit");
  const k = await decideOrderApproval({}, { status: "Scheduled" }, mustNotRun, NOW);
  assert.equal(k.path, "kept");
  assert.equal(describeRuleCheck({ orderRate: 13.94, lastBillingRate: 13.94, lastBillingInvoiceNo: "LNCB-2/26-27/02579", lastBillingDate: "2026-10-28", benchmark: 48, lastRapc: 49.79, rapcJobNo: "JOB/26-27/10766", rapcJobDate: "2026-11-03" }), "Auto-approved: rate 13.94 = last billing rate (LNCB-2/26-27/02579, 28-10-2026); last RAPC 49.79 (JOB/26-27/10766, 03-11-2026) >= benchmark 48");
  assert.equal(describeRuleCheck({ orderRate: 14, lastBillingRate: 13.94, lastBillingInvoiceNo: "X", failed: "rate" }), "Not auto-approved: rate 14 differs from last billing rate 13.94 (X)");
  assert.equal(describeRuleCheck({ failed: "rapcLow", lastRapc: 45, benchmark: 48 }), "Not auto-approved: last RAPC 45 is below benchmark 48");
});
