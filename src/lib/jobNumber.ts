/**
 * Removes leading zeroes from the final numeric segment of a production job
 * number while preserving the prefix and all non-numeric values.
 */
export function normalizeProductionJobNumber(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const match = raw.match(/^(.*?\/)?(\d+)$/);
  if (!match) return raw;

  const prefix = match[1] || "";
  const suffix = match[2].replace(/^0+(?=\d)/, "");
  return `${prefix}${suffix}`;
}

