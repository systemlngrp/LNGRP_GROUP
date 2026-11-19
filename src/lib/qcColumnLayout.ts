export const QC_REPORT_COLUMN_COUNTS = { "qc-view": 58, "pdi-report": 34, "production-master": 80 } as const;
export const QC_REPORT_COLUMN_SCHEMA_VERSIONS = { "qc-view": 3, "pdi-report": 2, "production-master": 1 } as const;

/** Saved layout of an older version → current positions (a column inserted at `at` is shown). */
const insertColumnAt = (at: number) => (columns: number[]) => [...columns.map((index) => (index >= at ? index + 1 : index)), at];
/** By report: from schema version → upgrade. QC View v3 added Sample Zone No after Index No (position 12). */
const QC_REPORT_COLUMN_MIGRATIONS: Partial<Record<string, Record<number, (columns: number[]) => number[]>>> = {
  "qc-view": { 2: insertColumnAt(12) },
};
export type QcReportKey = keyof typeof QC_REPORT_COLUMN_COUNTS;

export function validQcColumnSelection(value: unknown, count: number): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.length <= count &&
    value.every((index) => Number.isInteger(index) && index >= 0 && index < count) &&
    new Set(value).size === value.length;
}

export function parseQcColumnSelection(value: unknown, count: number, schemaVersion?: number, report?: string): number[] {
  const all = Array.from({ length: count }, (_, index) => index);
  if (!value) return all;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const migrate = report && parsed && !Array.isArray(parsed) && Array.isArray(parsed.columns) ? QC_REPORT_COLUMN_MIGRATIONS[report]?.[Number(parsed.schemaVersion)] : undefined;
    const columns = schemaVersion
      ? parsed && !Array.isArray(parsed) && parsed.schemaVersion === schemaVersion ? parsed.columns
        : migrate && Number(parsed.schemaVersion) === schemaVersion - 1 ? migrate(parsed.columns) : undefined
      : parsed;
    return validQcColumnSelection(columns, count) ? columns.slice().sort((a, b) => a - b) : all;
  } catch {
    return all;
  }
}
