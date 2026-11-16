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


/**
 * Job number as shown on screen and in downloads: financial year and serial
 * only. Job numbers run in one series for all firms, so the firm label and the
 * word "JOB" add nothing: "LNCB-2/JOB/26-27/11053" and "JOB/26-27/11053" both
 * show as "26-27/11053". Anything else (PHP, PLATE, MRR, ...) is returned as is.
 * The saved number is unchanged; this is display only.
 */
export function displayJobNo(value: unknown): string {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(?:[A-Za-z0-9-]+\/)?JOB\/(\d{2}-\d{2})\/0*(\d+)$/i);
  return match ? `${match[1]}/${match[2]}` : raw;
}
