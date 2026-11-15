// Sales target figures sent by the Sales Analysis sheet (or a future sales app).
export type SalesTargetSnapshot = {
  targetPerDay: number;
  revisedTargetPerDay: number;
  achievedPerDay: number;
  shortSales: number;
  /** Report date in the source sheet (YYYY-MM-DD), when sent. */
  reportDate: string;
  source: string;
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(String(value).replace(/[₹,\s]/g, ""));
  return Number.isFinite(num) ? num : null;
};

export function parseSalesTargetPayload(body: Record<string, unknown>): SalesTargetSnapshot | { error: string } {
  const fields = ["targetPerDay", "revisedTargetPerDay", "achievedPerDay", "shortSales"] as const;
  const values: Record<string, number> = {};
  for (const field of fields) {
    const num = toNumber(body[field]);
    if (num === null) return { error: `${field} must be a number.` };
    values[field] = Math.round(num * 100) / 100;
  }
  const reportDate = String(body.reportDate ?? "").trim().slice(0, 10);
  if (reportDate && !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return { error: "reportDate must be YYYY-MM-DD." };
  const source = String(body.source ?? "Sales Analysis").trim().slice(0, 80) || "Sales Analysis";
  return { ...(values as Omit<SalesTargetSnapshot, "reportDate" | "source">), reportDate, source };
}
