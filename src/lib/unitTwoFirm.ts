import type { Firm } from "../types";

function normalizeFirmName(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Returns the configured Unit-II inventory firm from Firm Master. */
export function findUnitTwoFirm(firms: Firm[]) {
  return firms.find((firm) => {
    const name = normalizeFirmName(firm.firmName);
    return name.endsWith("unit2") || name.endsWith("unitii");
  });
}
