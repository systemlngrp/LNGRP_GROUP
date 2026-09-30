import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildProductionMaterialUsageMap, hasProductionMaterialUsage } from "./productionMaterialUsage";

describe("Printing material requirement", () => {
  const issue = { id: "issue-1", firmId: "unit-one", issueType: "Job", productionId: "lncb-job" } as const;
  const issueLine = { id: "issue-line-1", materialIssueId: issue.id, qty: 100 };
  const materialReturn = { id: "return-1", firmId: "unit-one", returnType: "Job", productionId: "lncb-job" } as const;

  it("accepts a Unit-I issue for a job at another firm when net usage is positive", () => {
    const usage = buildProductionMaterialUsageMap([issue] as any, [issueLine] as any, [materialReturn] as any,
      [{ id: "return-line-1", materialReturnId: materialReturn.id, qty: 40 }] as any);
    assert.equal(usage.get("lncb-job"), 60);
    assert.equal(hasProductionMaterialUsage("lncb-job", usage), true);
  });

  it("blocks a fully returned issue and a job with no issue", () => {
    const returned = buildProductionMaterialUsageMap([issue] as any, [issueLine] as any, [materialReturn] as any,
      [{ id: "return-line-1", materialReturnId: materialReturn.id, qty: 100 }] as any);
    const noIssue = buildProductionMaterialUsageMap([], [], [], []);
    assert.equal(returned.get("lncb-job"), 0);
    assert.equal(hasProductionMaterialUsage("lncb-job", returned), false);
    assert.equal(hasProductionMaterialUsage("lncb-job", noIssue), false);
  });

  it("recognizes an issue for LNCB-1/JOB/26-27/00004 by exact job number when its production ID is missing", () => {
    const job = { id: "lncb-job", transactionNo: "LNCB-1/JOB/26-27/00004" };
    const legacyIssue = { id: "legacy-issue", issueType: "Job", jobNo: job.transactionNo };
    const line = { id: "legacy-line", materialIssueId: legacyIssue.id, qty: 100 };
    const usage = buildProductionMaterialUsageMap([legacyIssue] as any, [line] as any, [], [], [], [], [job] as any);
    assert.equal(usage.get(job.id), 100);
    assert.equal(hasProductionMaterialUsage(job.id, usage), true);
  });

  it("does not credit another job's issue and blocks a fully returned legacy issue", () => {
    const jobs = [
      { id: "lncb-job", transactionNo: "LNCB-1/JOB/26-27/00004" },
      { id: "other-job", transactionNo: "LNCB-1/JOB/26-27/00005" },
    ];
    const wrongIssue = { id: "wrong", issueType: "Job", productionId: "other-job", jobNo: jobs[0].transactionNo };
    const legacyIssue = { id: "legacy", issueType: "Job", jobNo: jobs[0].transactionNo };
    const returned = { id: "returned", returnType: "Job", jobNo: jobs[0].transactionNo };
    const usage = buildProductionMaterialUsageMap(
      [wrongIssue, legacyIssue] as any,
      [{ id: "wrong-line", materialIssueId: "wrong", qty: 25 }, { id: "legacy-line", materialIssueId: "legacy", qty: 100 }] as any,
      [returned] as any,
      [{ id: "return-line", materialReturnId: "returned", qty: 100 }] as any,
      [], [], jobs as any
    );
    assert.equal(usage.get("lncb-job"), 0);
    assert.equal(hasProductionMaterialUsage("lncb-job", usage), false);
    assert.equal(usage.get("other-job"), 25);
  });
});
