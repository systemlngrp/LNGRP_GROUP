export const QC_REPORT_COLUMN_COUNTS = { "qc-view": 57, "pdi-report": 36 } as const;
export type QcReportKey = keyof typeof QC_REPORT_COLUMN_COUNTS;

export function validQcColumnSelection(value: unknown, count: number): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.length <= count &&
    value.every((index) => Number.isInteger(index) && index >= 0 && index < count) &&
    new Set(value).size === value.length;
}

export function parseQcColumnSelection(value: unknown, count: number): number[] {
  const all = Array.from({ length: count }, (_, index) => index);
  if (!value) return all;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return validQcColumnSelection(parsed, count) ? parsed.slice().sort((a, b) => a - b) : all;
  } catch {
    return all;
  }
}
