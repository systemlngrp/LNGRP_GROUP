import { describe, expect, it } from "vitest";
import { buildReelStockRows } from "./reelStock";

describe("buildReelStockRows", () => {
  it("reports receipt and legacy opening reels as Unit-I inventory", () => {
    const rows = buildReelStockRows({
      materials: [
        { id: "reel-1", name: "Kraft Reel", type: "Reel", active: "Yes", erpCode: "1001", openingQty: 25, openingRate: 10, firmId: "legacy" },
      ] as any,
      materialIn: [{ id: "mrr-1", transactionNo: "MRR/1", date: "2026-09-22", supplierId: "supplier-1", firmId: "legacy", lines: [{ id: "line-1", itemId: "reel-1", qty: 100, invoiceRate: 12 }] }] as any,
      packingSlips: [{ id: "slip-1", materialInId: "mrr-1", materialLineId: "line-1", materialId: "reel-1", ourReelNo: "R001", weightKg: 100, firmId: "legacy" }] as any,
      issueReelLines: [{ id: "issue-1", packingSlipId: "slip-1", weightKg: 30 }] as any,
      returnReelLines: [{ id: "return-1", packingSlipId: "slip-1", weightKg: 5 }] as any,
      firms: [{ id: "unit-1", firmName: "Unit-I" }, { id: "legacy", firmName: "Legacy Firm" }] as any,
      unitOneFirm: { id: "unit-1", firmName: "Unit-I" },
    });

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.firmId === "unit-1" && row.firmName === "Unit-I")).toBe(true);
    expect(rows.find((row) => row.slipId === "slip-1")).toMatchObject({ availableWeight: 75, issuedWeight: 30, returnedWeight: 5 });
  });
});
