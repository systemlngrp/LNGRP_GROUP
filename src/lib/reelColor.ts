// Reel colours come from Color Master (codes such as NS, LG, GY). Invoices may
// print a name instead of the code; these names stand for a Color Master code.
// LG = LG, GY, Yellow (Gold = GY); NS = NS, Duplex, Natural, VK, Brown.
export const REEL_COLOR_ALIASES: Record<string, string> = {
  GY: "LG",
  YELLOW: "LG",
  GOLD: "LG",
  GOLDEN: "LG",
  DUPLEX: "NS",
  NATURAL: "NS",
  VK: "NS",
  BROWN: "NS",
};

const words = (value: unknown) => String(value ?? "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);

/**
 * Color Master code found in the text: a Color Master name, or a name that
 * stands for one (Natural -> NS, Gold -> GY). Blank when none is present.
 */
export function resolveReelColor(value: unknown, masterNames: string[]): string {
  const masters = new Map(masterNames.map((name) => [String(name || "").trim().toUpperCase(), String(name || "").trim()]).filter(([key]) => key));
  const text = String(value ?? "").toUpperCase();
  if (!text.trim()) return "";
  // Whole value equal to a master name (also covers names with spaces).
  const whole = masters.get(text.trim());
  if (whole) return whole;
  for (const word of words(text)) {
    const direct = masters.get(word);
    if (direct) return direct;
    const alias = REEL_COLOR_ALIASES[word];
    if (alias && masters.has(alias)) return masters.get(alias)!;
  }
  return "";
}
