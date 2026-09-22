import { describe, expect, it } from "vitest";
import { distributeProportionalTransferWeight } from "./reelTransfer";

describe("distributeProportionalTransferWeight", () => {
  it("allocates a single eligible reel the full whole-KG transfer", () => {
    expect(distributeProportionalTransferWeight([
      { id: "R001", issuedWeightKg: 100, availableWeightKg: 100 },
    ], 40)).toMatchObject([{ id: "R001", weightKg: 40 }]);
  });

  it("uses original issued weight and gives the final reel the exact remainder", () => {
    const result = distributeProportionalTransferWeight([
      { id: "R001", issuedWeightKg: 100, availableWeightKg: 100 },
      { id: "R002", issuedWeightKg: 200, availableWeightKg: 200 },
      { id: "R003", issuedWeightKg: 300, availableWeightKg: 300 },
    ], 120);

    expect(result.map((row) => row.weightKg)).toEqual([20, 40, 60]);
    expect(result.reduce((sum, row) => sum + row.weightKg, 0)).toBe(120);
  });

  it("rounds non-final proportions to nearest whole KG and preserves the total on the final reel", () => {
    const result = distributeProportionalTransferWeight([
      { id: "R001", issuedWeightKg: 1, availableWeightKg: 10 },
      { id: "R002", issuedWeightKg: 1, availableWeightKg: 10 },
      { id: "R003", issuedWeightKg: 1, availableWeightKg: 10 },
    ], 10);

    expect(result.map((row) => row.weightKg)).toEqual([3, 3, 4]);
    expect(result.reduce((sum, row) => sum + row.weightKg, 0)).toBe(10);
  });

  it("ignores reels without issued weight or available balance and rejects decimal totals", () => {
    expect(distributeProportionalTransferWeight([
      { id: "zero-issued", issuedWeightKg: 0, availableWeightKg: 20 },
      { id: "zero-balance", issuedWeightKg: 20, availableWeightKg: 0 },
    ], 10)).toEqual([]);
    expect(distributeProportionalTransferWeight([
      { id: "R001", issuedWeightKg: 20, availableWeightKg: 20 },
    ], 10.5)).toEqual([]);
  });
});
