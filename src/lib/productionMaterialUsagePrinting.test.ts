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
});
