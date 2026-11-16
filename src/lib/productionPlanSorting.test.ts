import { describe, expect, it } from "vitest";
import { sortProductionPlanRows } from "./productionPlanSorting";

const row = (id: string, company: string, reel: number, meter: number, batch = "A") => ({
  id, transactionNo: id, companyName: company, productionPlanCompanyName: company,
  reelActualWithTrimming: reel, plannedProductionInMeter: meter, fluteBatches: batch,
} as any);

describe("sortProductionPlanRows", () => {
  it("sorts batches, large jobs, and groups companies by maximum reel", () => {
    const result = sortProductionPlanRows([
      row("small", "Zeta", 150, 100), row("large-z", "Zeta", 140, 300),
      row("large-a", "Alpha", 200, 300), row("other-batch", "Alpha", 500, 300, "B"),
    ]);
    // small (150) is wider than its closest large job large-z (140), so it goes before it (sheet rule).
    expect(result.map((item) => item.id)).toEqual(["large-a", "small", "large-z", "other-batch"]);
  });

  it("places an equal-reel small job after its matched large job", () => {
    const result = sortProductionPlanRows([row("large", "Alpha", 100, 300), row("small", "Beta", 100, 200)]);
    expect(result.map((item) => item.id)).toEqual(["large", "small"]);
  });

  it("keeps a batch containing only small jobs in reel-descending order", () => {
    const result = sortProductionPlanRows([row("low", "Beta", 100, 200), row("high", "Alpha", 200, 200)]);
    expect(result.map((item) => item.id)).toEqual(["high", "low"]);
  });

  it("keeps tied jobs in job-number order, like the sheet", () => {
    const result = sortProductionPlanRows([
      row("JOB/26-27/11027", "Aashka", 1890, 2068), row("JOB/26-27/11026", "Aashka", 1890, 207),
    ]);
    expect(result.map((item) => item.id)).toEqual(["JOB/26-27/11026", "JOB/26-27/11027"]);
  });
});
