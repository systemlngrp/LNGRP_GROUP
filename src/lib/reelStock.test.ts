import { describe, expect, it } from "vitest";
import { buildReelStockRows } from "./reelStock";

describe("buildReelStockRows", () => {
  it("includes a persisted opening reel in opening and available stock", () => {
    const material = { id: "paper-76000005", type: "Reel" as const, active: "Yes" as const, erpCode: "76000005", name: "120 CM", openingRate: 10 };
    const rows = buildReelStockRows({
      materials: [material],
      materialIn: [],
      packingSlips: [{ id: "121", materialId: material.id, materialInId: "Opening", materialLineId: material.id, ourReelNo: "121", weightKg: 2122, openingRate: 10 }],
      issueReelLines: [{ packingSlipId: "121", weightKg: 500 } as any],
      returnReelLines: [{ packingSlipId: "121", weightKg: 100 } as any],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ erp: "76000005", openingQty: 2122, issuedWeight: 500, returnedWeight: 100, availableWeight: 1722, isOpening: true });
  });
});
