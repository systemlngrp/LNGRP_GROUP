// Date rule for orders → schedules → jobs:
//   Order Date <= Order Scheduling Date <= main (box) Job date + 2 days
//   (a job may be created up to JOB_DAYS_BEFORE_SCHEDULE days before the Scheduled Date).
// Plate / PHP part-jobs (linked to a plate/PHP job) are made ahead and are not checked.
// Dates are stored as YYYY-MM-DD text; anything else is ignored (no check).
const ymd = (value) => {
    const text = String(value ?? "").trim();
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
};
export const JOB_DAYS_BEFORE_SCHEDULE = 2;
// YYYY-MM-DD shifted by whole days (calendar arithmetic in UTC, no time zone drift).
export function shiftYmd(value, days) {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
/** Earliest allowed job date for a schedule date ("" when the date is unknown). */
export function earliestJobDateFor(scheduledDate) {
    const value = ymd(scheduledDate);
    return value ? shiftYmd(value, -JOB_DAYS_BEFORE_SCHEDULE) : "";
}
const show = (value) => `${value.slice(8, 10)}-${value.slice(5, 7)}-${value.slice(0, 4)}`;
/** Problem with a schedule's date, or "" when it follows the rule. */
export function scheduleDateRuleError(input) {
    const orderDate = ymd(input.orderDate);
    const scheduledDate = ymd(input.scheduledDate);
    const earliestJobDate = ymd(input.earliestJobDate);
    if (!scheduledDate)
        return "";
    if (orderDate && scheduledDate < orderDate) {
        return `Scheduled Date ${show(scheduledDate)} cannot be before the Order Date ${show(orderDate)}.`;
    }
    if (earliestJobDate && earliestJobDate < shiftYmd(scheduledDate, -JOB_DAYS_BEFORE_SCHEDULE)) {
        return `Scheduled Date ${show(scheduledDate)} is more than ${JOB_DAYS_BEFORE_SCHEDULE} days after its job date ${show(earliestJobDate)}. A job can be planned at most ${JOB_DAYS_BEFORE_SCHEDULE} days before the order's Scheduled Date.`;
    }
    return "";
}
/** Problem with a job's date against its order schedule, or "" when it follows the rule. */
export function jobDateRuleError(input) {
    const jobDate = ymd(input.jobDate);
    const scheduledDate = ymd(input.scheduledDate);
    if (!jobDate || !scheduledDate)
        return "";
    const earliest = shiftYmd(scheduledDate, -JOB_DAYS_BEFORE_SCHEDULE);
    return jobDate < earliest
        ? `Job date ${show(jobDate)} is too early: a job can be created at most ${JOB_DAYS_BEFORE_SCHEDULE} days before the order's Scheduled Date ${show(scheduledDate)} (earliest ${show(earliest)}).`
        : "";
}
