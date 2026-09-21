import { describe, expect, it } from "vitest";
import { getAvailableReelPackingSlips, isOpeningReelPackingSlip } from "./materialMovement";

const activeReel = { id: "paper-76000005", type: "Reel" as const, active: "Yes" as const, openingQty: 0 };

describe("opening reel availability", () => {
  it("makes persisted legacy opening reels available and tracks their returned balance", () => {
    const slips = [{ id: "121", materialId: activeReel.id, materialInId: "Opening", materialLineId: activeReel.id, ourReelNo: "121", weightKg: 2122 }];
    const available = getAvailableReelPackingSlips(activeReel.id, slips, [{ packingSlipId: "121", weightKg: 500 } as any], [{ packingSlipId: "121", weightKg: 100 } as any], [activeReel]);

    expect(isOpeningReelPackingSlip(slips[0])).toBe(true);
    expect(available).toEqual([{ ...slips[0], weightKg: 1722 }]);
  });

  it("does not expose inactive or empty reels", () => {
    const slips = [{ id: "121", materialId: activeReel.id, materialInId: "OPENING", materialLineId: activeReel.id, ourReelNo: "121", weightKg: 1 }];
    expect(getAvailableReelPackingSlips(activeReel.id, slips, [], [], [{ ...activeReel, active: "No" }])).toEqual([]);
    expect(getAvailableReelPackingSlips(activeReel.id, [{ ...slips[0], weightKg: 0 }], [], [], [activeReel])).toEqual([]);
  });
});
