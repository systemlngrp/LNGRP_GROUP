// Date rule for orders → schedules → jobs:
//   Order Date <= Order Scheduling Date <= Job (production plan) date.
// Dates are stored as YYYY-MM-DD text; anything else is ignored (no check).

const ymd = (value: unknown): string => {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
};

const show = (value: string) => `${value.slice(8, 10)}-${value.slice(5, 7)}-${value.slice(0, 4)}`;

/** Problem with a schedule's date, or "" when it follows the rule. */
export function scheduleDateRuleError(input: { orderDate?: unknown; scheduledDate?: unknown; earliestJobDate?: unknown }): string {
  const orderDate = ymd(input.orderDate);
  const scheduledDate = ymd(input.scheduledDate);
  const earliestJobDate = ymd(input.earliestJobDate);
  if (!scheduledDate) return "";
  if (orderDate && scheduledDate < orderDate) {
    return `Scheduled Date ${show(scheduledDate)} cannot be before the Order Date ${show(orderDate)}.`;
  }
  if (earliestJobDate && earliestJobDate < scheduledDate) {
    return `Scheduled Date ${show(scheduledDate)} cannot be after its job date ${show(earliestJobDate)}. A job cannot be planned before the order is scheduled.`;
  }
  return "";
}

/** Problem with a job's date against its order schedule, or "" when it follows the rule. */
export function jobDateRuleError(input: { jobDate?: unknown; scheduledDate?: unknown }): string {
  const jobDate = ymd(input.jobDate);
  const scheduledDate = ymd(input.scheduledDate);
  if (!jobDate || !scheduledDate) return "";
  return jobDate < scheduledDate
    ? `Job date ${show(jobDate)} cannot be before the order's Scheduled Date ${show(scheduledDate)}.`
    : "";
}
