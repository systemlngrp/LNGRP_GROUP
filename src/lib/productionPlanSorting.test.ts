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
    expect(result.map((item) => item.id)).toEqual(["large-a", "large-z", "small", "other-batch"]);
  });

  it("places an equal-reel small job after its matched large job", () => {
    const result = sortProductionPlanRows([row("large", "Alpha", 100, 300), row("small", "Beta", 100, 200)]);
    expect(result.map((item) => item.id)).toEqual(["large", "small"]);
  });

  it("keeps a batch containing only small jobs in reel-descending order", () => {
    const result = sortProductionPlanRows([row("low", "Beta", 100, 200), row("high", "Alpha", 200, 200)]);
    expect(result.map((item) => item.id)).toEqual(["high", "low"]);
  });
});
