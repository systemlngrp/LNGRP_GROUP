import assert from "node:assert/strict";
import test from "node:test";
import { AUTO_APPROVED_BY, decideOrderApproval } from "./orderApproval";

const NOW = "2026-11-15T15:00:00.000Z";
const pass = async () => true;
const fail = async () => false;
const mustNotRun = async () => { throw new Error("rule should not run"); };

test("new order from the order form: rule passes -> approved automatically", async () => {
  const d = await decideOrderApproval({ status: "Pending PH", updatedBy: "u1" }, null, pass, NOW);
  assert.deepEqual(d, { status: "Pending Scheduling", approvedTimestamp: NOW, approvedEmail: AUTO_APPROVED_BY, ruleApplied: true });
});

test("new order from the order form: rule fails -> waits in Pending Salesman Approval", async () => {
  const d = await decideOrderApproval({ status: "Pending PH" }, null, fail, NOW);
  assert.deepEqual(d, { status: "Pending PH", approvedTimestamp: null, approvedEmail: null, ruleApplied: true });
});

test("new order with no status is treated like Pending PH", async () => {
  const d = await decideOrderApproval({}, null, fail, NOW);
  assert.equal(d.status, "Pending PH");
});

test("Approve button (Pending Scheduling + stamp) approves without the rule", async () => {
  const d = await decideOrderApproval({ status: "Pending Scheduling", approvedEmail: "System User" }, { status: "Pending PH" }, mustNotRun, NOW);
  assert.deepEqual(d, { status: "Pending Scheduling", approvedTimestamp: NOW, approvedEmail: "System User", ruleApplied: false });
});

test("import with status Scheduled keeps Scheduled", async () => {
  const d = await decideOrderApproval({ status: "Scheduled", approvedTimestamp: "2026-11-13T06:39:16.577Z", approvedEmail: "Salesman App Import" }, null, mustNotRun, NOW);
  assert.equal(d.status, "Scheduled");
  assert.equal(d.approvedTimestamp, "2026-11-13T06:39:16.577Z");
});

test("editing an approved order keeps its approval, even if the form sends Pending PH", async () => {
  const stored = { status: "Pending Scheduling", approvedTimestamp: "2026-11-13T06:39:16.577Z", approvedEmail: "Salesman App Import" };
  const d = await decideOrderApproval({ status: "Pending PH" }, stored, mustNotRun, NOW);
  assert.deepEqual(d, { status: "Pending Scheduling", approvedTimestamp: "2026-11-13T06:39:16.577Z", approvedEmail: "Salesman App Import", ruleApplied: false });
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
