const LEGAL_SUFFIXES = new Set(["LLP", "LTD", "LIMITED", "PRIVATE", "PVT", "COMPANY"]);

export function generateFirmShortName(firmName?: string): string {
  const words = String(firmName || "").trim().split(/[^A-Za-z0-9]+/).filter(Boolean).filter((word) => !LEGAL_SUFFIXES.has(word.toUpperCase()));
  const initials = words.map((word) => word[0]).join("").toUpperCase();
  return (initials || String(firmName || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 4)).toUpperCase();
}

export function getFirmDisplayName(firm?: { firmName?: string; shortName?: string } | null): string {
  if (!firm) return "Unassigned";
  return String(firm.shortName || generateFirmShortName(firm.firmName) || "Unassigned").trim();
}

export function getFirmDisplayNameById(
  firmId: string | undefined,
  firms: Array<{ id: string; firmName?: string; shortName?: string }>,
  fallbackName?: string,
): string {
  const firm = firms.find((item) => String(item.id) === String(firmId || ""));
  return firm ? getFirmDisplayName(firm) : String(fallbackName || "Unassigned");
}
