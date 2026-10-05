import { describe, expect, it } from "vitest";
import { buildSampleJobNumbers, deriveProductionPlanStatuses } from "./productionPlanStatus";

const row = (id: string, itemName: string, realizationPerKg: number) => ({
  id, transactionNo: id, itemName, realizationPerKg,
} as any);

describe("production plan statuses", () => {
  it("normalizes sample job numbers and detects consecutive same-item jobs", () => {
    const samples = buildSampleJobNumbers([{ jobCardNo: "1,002" } as any]);
    const result = deriveProductionPlanStatuses([
      row("1001", " Box  ", 50), row("1002", "box", 50), row("1003", "Other", 50),
    ], samples, 98);
    expect(result.map((item) => item.isSample)).toEqual([false, true, false]);
    expect(result.map((item) => item.shouldHighlight)).toEqual([true, false, true]);
  });

  it("never highlights sample rows below the realization threshold", () => {
    const result = deriveProductionPlanStatuses([row("10", "Sample", 1)], new Set(["10"]), 98);
    expect(result[0].isSample).toBe(true);
    expect(result[0].shouldHighlight).toBe(false);
  });
});
