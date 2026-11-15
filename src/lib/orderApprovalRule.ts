// The order auto-approval rule, as shown on Pending Salesman Approval.
// Same rule as the server (server/index.ts, order save): an order is approved
// automatically only when
// 1) Order Rate == Last Billing Rate 1 (latest invoice rate for the item)
// 2) the order date falls in a Realization Rate Chart period
// 3) Last RAPC 1 (latest job realization per kg for the item) >= that chart rate.

export type RealizationChartRow = { dateFrom?: string | null; dateTo?: string | null; realizationRate?: number | string | null };

/** Chart rate for a date: the row with the latest start date whose period contains it. */
export function chartRateForDate(rows: RealizationChartRow[], date: string): number | undefined {
  const day = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const matches = rows
    .map((row) => ({ from: String(row.dateFrom || "").slice(0, 10), to: String(row.dateTo || "").slice(0, 10), rate: Number(row.realizationRate) }))
    .filter((row) => row.from && row.to && row.from <= day && day <= row.to && Number.isFinite(row.rate))
    .sort((a, b) => b.from.localeCompare(a.from));
  return matches[0]?.rate;
}

export type ApprovalRuleInput = { rate: number; billing1?: number; chartRate?: number; rapc1?: number };

/** Every reason the rule does not pass (empty list = it passes). */
export function autoApprovalReasons({ rate, billing1, chartRate, rapc1 }: ApprovalRuleInput): string[] {
  const reasons: string[] = [];
  const fmt = (value: number) => value.toFixed(2);
  if (billing1 === undefined || !Number.isFinite(billing1)) reasons.push("No billing history");
  else if (!Number.isFinite(rate) || Math.abs(rate - billing1) >= 0.0001) reasons.push(`Rate ${Number.isFinite(rate) ? fmt(rate) : "-"} ≠ last billed ${fmt(billing1)}`);
  if (chartRate === undefined || !Number.isFinite(chartRate)) reasons.push("No realization chart for order date");
  if (rapc1 === undefined || !Number.isFinite(rapc1)) reasons.push("No RAPC history");
  else if (chartRate !== undefined && Number.isFinite(chartRate) && rapc1 < chartRate) reasons.push(`RAPC ${fmt(rapc1)} < chart ${fmt(chartRate)}`);
  return reasons;
}

/** Problem with a chart period (bad dates, bad rate, or overlap with another period), or "" when fine. */
export function chartPeriodError(row: RealizationChartRow & { id?: string }, others: Array<RealizationChartRow & { id?: string }>): string {
  const from = String(row.dateFrom || "").slice(0, 10);
  const to = String(row.dateTo || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return "Date From and Date To are required.";
  if (from > to) return "Date From must be on or before Date To.";
  const rate = Number(row.realizationRate);
  if (!Number.isFinite(rate) || rate <= 0) return "Rate must be greater than 0.";
  const clash = others.find((other) => other.id !== row.id && String(other.dateFrom || "").slice(0, 10) <= to && from <= String(other.dateTo || "").slice(0, 10));
  return clash ? `Overlaps the period ${String(clash.dateFrom).slice(0, 10)} to ${String(clash.dateTo).slice(0, 10)}.` : "";
}
