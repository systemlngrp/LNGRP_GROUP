import { describe, expect, it } from "vitest";
import { buildReelTransferContext } from "./reelTransfer";

const production = { id: "job-1", transactionNo: "JOB/1", qty: 100, totalPaperWeight: 60 } as any;
const processing = [{ productionId: "job-1", machineName: "Corrugation Liner", qty: 50, completionStatus: "Full", date: "2026-09-22T10:00:00.000Z" }] as any;
const issueLines = [{ id: "issue-line-1", rate: 10 }] as any;

describe("buildReelTransferContext", () => {
  it("removes a physically returned reel even when its recorded return weight is partial", () => {
    const context = buildReelTransferContext(
      production, processing,
      [
        { id: "issue-1", productionId: "job-1", jobNo: "JOB/1", packingSlipId: "R001", materialIssueLineId: "issue-line-1", weightKg: 100 },
        { id: "issue-2", productionId: "job-1", jobNo: "JOB/1", packingSlipId: "R002", materialIssueLineId: "issue-line-1", weightKg: 200 },
      ] as any,
      [{ id: "return-1", productionId: "job-1", jobNo: "JOB/1", packingSlipId: "R001", weightKg: 25 }] as any,
      issueLines, [production], 12, new Date("2026-09-22T11:00:00.000Z").getTime(),
    );

    expect(context.notionalLeftKg).toBe(245);
    expect(context.reels.map((reel) => ({ id: reel.packingSlipId, available: reel.weightKg, transfer: reel.transferWeightKg }))).toEqual([
      { id: "R002", available: 200, transfer: 200 },
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

  it("matches a legacy return by reel number when its packing-slip id differs", () => {
    const context = buildReelTransferContext(
      production, processing,
      [{ id: "issue-1", productionId: "job-1", jobNo: "JOB/1", packingSlipId: "OLD-SLIP", ourReelNo: "11111166", materialIssueLineId: "issue-line-1", weightKg: 100 }] as any,
      [{ id: "return-1", productionId: "job-1", jobNo: "JOB/1", packingSlipId: "NEW-SLIP", ourReelNo: " 11111166 ", weightKg: 80 }] as any,
      issueLines, [production], 12, new Date("2026-09-22T11:00:00.000Z").getTime(),
    );

    expect(context.reels).toEqual([]);
    expect(context.status).toBe("no_reel_balance");
  });

  it("matches the job-level notional-left calculation used by the transfer screen", () => {
    const screenshotProduction = { id: "job-2", transactionNo: "JOB/2", qty: 196, totalPaperWeight: 114.41 } as any;
    const context = buildReelTransferContext(
      screenshotProduction,
      [{ productionId: "job-2", machineName: "Corrugation Liner", qty: 196, completionStatus: "Full", date: "2026-09-22T10:00:00.000Z" }] as any,
      [
        { id: "issue-1", productionId: "job-2", jobNo: "JOB/2", packingSlipId: "R001", materialIssueLineId: "issue-line-1", weightKg: 2213 },
        { id: "issue-2", productionId: "job-2", jobNo: "JOB/2", packingSlipId: "R002", materialIssueLineId: "issue-line-1", weightKg: 2122 },
      ] as any,
      [], issueLines, [screenshotProduction], 12, new Date("2026-09-22T11:00:00.000Z").getTime(),
    );

    expect(context.consumedKg).toBe(114.41);
    expect(context.notionalLeftKg).toBe(4220.59);
    expect(context.reels.reduce((sum, reel) => sum + reel.transferWeightKg, 0)).toBe(4220.59);
  });
});
