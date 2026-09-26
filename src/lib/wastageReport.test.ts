import { describe, expect, it } from "vitest";
import { buildProductionWastageRows } from "./wastageReport";

const production = {
  id: "job-1",
  qty: 100,
  totalPaperWeight: 100,
  actualPaperUsed: 40,
  itemName: "Test Item",
} as any;

describe("buildProductionWastageRows", () => {
  it("ignores a persisted No Hisab value and calculates it automatically", () => {
    const [row] = buildProductionWastageRows(
      [{
        productionId: "job-1",
        jobNo: "JOB-1",
        machineName: "Corrugation Liner",
        qty: 20,
        completionStatus: "Full",
        noHisabKg: 813.91,
      }] as any,
      [production],
    );

    expect(row.noHisabKg).toBe(20);
    expect(row.totalCWastageKg).toBe(20);
    expect(row.totalWastagePercent).toBe(50);
  });

  it("clamps a negative automatic No Hisab result to zero", () => {
    const [row] = buildProductionWastageRows(
      [{
        productionId: "job-1",
        jobNo: "JOB-1",
        machineName: "Corrugation Liner",
        qty: 20,
        completionStatus: "Full",
        noHisabKg: -43.08,
      }] as any,
      [{ ...production, actualPaperUsed: 10 }],
    );

    expect(row.noHisabKg).toBe(0);
    expect(row.totalCWastageKg).toBe(0);
    expect(row.totalWastagePercent).toBe(0);
  });
});
