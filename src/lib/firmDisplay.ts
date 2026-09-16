const LEGAL_SUFFIXES = new Set(["LLP", "LTD", "LIMITED", "PRIVATE", "PVT", "COMPANY"]);

export function generateFirmShortName(firmName?: string): string {
  const words = String(firmName || "").trim().split(/[^A-Za-z0-9]+/).filter(Boolean).filter((word) => !LEGAL_SUFFIXES.has(word.toUpperCase()));
  const initials = words.map((word) => word[0]).join("").toUpperCase();
  return (initials || String(firmName || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 4)).toUpperCase();
}

export function getFirmDisplayName(firm?: { firmName?: string; shortName?: string } | null): string {
  if (!firm) return "Unknown firm";
  return String(firm.shortName || generateFirmShortName(firm.firmName) || "Unknown firm").trim();
}

export function getFirmDisplayNameById(
  firmId: string | undefined,
  firms: Array<{ id: string; firmName?: string; shortName?: string }>,
  _legacyTransactionName?: string,
): string {
  const firm = firms.find((item) => String(item.id) === String(firmId || ""));
  if (firm) return getFirmDisplayName(firm);
  return String(firmId || "").trim() ? "Unknown firm" : "Unassigned";
}

export function getFirmOptions(
  firms: Array<{ id: string; firmName?: string; shortName?: string }>,
): Array<{ value: string; label: string; searchText: string }> {
  return firms
    .map((firm) => ({
      value: String(firm.id),
      label: getFirmDisplayName(firm),
      searchText: `${getFirmDisplayName(firm)} ${String(firm.firmName || "")}`.trim(),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
