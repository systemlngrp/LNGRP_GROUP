// The order auto-approval rule, as shown on Pending Salesman Approval.
// Same rule as the server (server/index.ts, order save): an order is approved
// automatically only when
// 1) Order Rate == Last Billing Rate 1 (latest invoice rate for the item)
// 2) the order date falls in a Settings > Realization Setup period
// 3) Last RAPC 1 (latest job realization per kg for the item) >= that period's benchmark rate.

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
