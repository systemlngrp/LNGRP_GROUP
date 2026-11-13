export const DEFAULT_NUMBER_START = 1;

export function normalizeStartNumber(value: unknown, fallback = DEFAULT_NUMBER_START) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function extractNumericSequence(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const parsed = Number(digits);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function getNextNumber(values: unknown[], configuredStart: unknown) {
  const start = normalizeStartNumber(configuredStart);
  const highest = values.reduce<number>((max, value) => Math.max(max, extractNumericSequence(value)), 0);
  return Math.max(start, highest + 1);
}

/**
 * Next "Our Reel No". Reel numbers have a fixed width (the width of the
 * Settings start number, e.g. 8 digits). Stray longer values such as
 * opening reels saved as 111038741 or 11104067.1 are ignored so they can't
 * push the sequence into a 9-digit range.
 */
export function getNextReelNumber(values: unknown[], configuredStart: unknown) {
  const start = normalizeStartNumber(configuredStart);
  const width = String(start).length;
  const highest = values.reduce<number>((max, value) => {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (!digits || digits.length > width) return max;
    return Math.max(max, extractNumericSequence(digits));
  }, 0);
  return Math.max(start, highest + 1);
}

export function getNextPlainNumber(values: unknown[], configuredStart: unknown) {
  const start = normalizeStartNumber(configuredStart);
  const highest = values.reduce<number>((max, value) => {
    const text = String(value ?? "").trim();
    if (!/^\d+$/.test(text)) return max;
    return Math.max(max, Number(text));
  }, 0);
  return Math.max(start, highest + 1);
}

export function formatOurReelNo(value: number) {
  return String(Math.max(1, Math.floor(Number(value) || 1))).padStart(5, "0");
}
