import type { Firm } from "../types";

function normalizeFirmName(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Returns the configured Unit-I firm, the sole owner of reel inventory. */
export function findUnitOneFirm(firms: Firm[]) {
  return firms.find((firm) => {
    const name = normalizeFirmName(firm.firmName);
    return name.endsWith("unit1") || name.endsWith("uniti");
  });
}
