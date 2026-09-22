import { describe, expect, it } from "vitest";
import { buildReelTransferContext } from "./reelTransfer";

const production = { id: "job-1", transactionNo: "JOB/1", qty: 100 } as any;
const processing = [{ productionId: "job-1", machineName: "Corrugation Liner", completionStatus: "Full", date: "2026-09-22T10:00:00.000Z" }] as any;
const issueLines = [{ id: "issue-line-1", rate: 10 }] as any;

describe("buildReelTransferContext", () => {
  it("returns each reel's full actual balance after partial returns", () => {
    const context = buildReelTransferContext(
      production, processing,
      [
        { id: "issue-1", productionId: "job-1", jobNo: "JOB/1", packingSlipId: "R001", materialIssueLineId: "issue-line-1", weightKg: 100 },
        { id: "issue-2", productionId: "job-1", jobNo: "JOB/1", packingSlipId: "R002", materialIssueLineId: "issue-line-1", weightKg: 200 },
      ] as any,
      [{ id: "return-1", productionId: "job-1", jobNo: "JOB/1", packingSlipId: "R001", weightKg: 25 }] as any,
      issueLines, [production], 12, new Date("2026-09-22T11:00:00.000Z").getTime(),
    );

    expect(context.reels.map((reel) => ({ id: reel.packingSlipId, available: reel.weightKg }))).toEqual([
      { id: "R001", available: 75 },
      { id: "R002", available: 200 },
    ]);
  });

  it("omits a reel with no remaining balance", () => {
    const context = buildReelTransferContext(
      production, processing,
      [{ id: "issue-1", productionId: "job-1", jobNo: "JOB/1", packingSlipId: "R001", materialIssueLineId: "issue-line-1", weightKg: 100 }] as any,
      [{ id: "return-1", productionId: "job-1", jobNo: "JOB/1", packingSlipId: "R001", weightKg: 100 }] as any,
      issueLines, [production], 12, new Date("2026-09-22T11:00:00.000Z").getTime(),
    );

    expect(context.reels).toEqual([]);
    expect(context.status).toBe("no_reel_balance");
  });
});
