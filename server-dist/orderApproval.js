// Order approval on save.
//
// The Salesman App is being retired, so approval happens in the app:
// - Cancelled orders are left alone.
// - An order that is already approved (stored approval, or stored status
//   Pending Scheduling / Scheduled) keeps its approval and status.
// - An explicit approval (Approve button, imports: status Pending Scheduling /
//   Scheduled, or an approval timestamp/email sent) is approved.
// - Any other order (new orders arrive as "Pending PH") is approved
//   automatically only when the rate/RAPC rule passes; otherwise it waits in
//   Pending Salesman Approval with no approval stamp.
export const AUTO_APPROVED_BY = "Auto-approved (rate/RAPC rule)";
const APPROVED_STATUSES = new Set(["Pending Scheduling", "Scheduled"]);
const CANCELLED_STATUSES = new Set(["Cancelled", "Canceled"]);
const hasValue = (value) => {
    const text = String(value ?? "").trim();
    return Boolean(text) && text.toLowerCase() !== "null" && text.toLowerCase() !== "undefined";
};
export async function decideOrderApproval(data, stored, passesAutoApprovalRule, now = new Date().toISOString()) {
    const requested = String(data.status ?? "").trim();
    const sentTimestamp = hasValue(data.approvedTimestamp) ? String(data.approvedTimestamp).trim() : "";
    const sentEmail = hasValue(data.approvedEmail) ? String(data.approvedEmail).trim() : "";
    const actor = String(data.updatedBy ?? data.orderBy ?? "").trim() || "System";
    if (CANCELLED_STATUSES.has(requested)) {
        return { status: requested, approvedTimestamp: sentTimestamp || null, approvedEmail: sentEmail || null, ruleApplied: false };
    }
    const storedStatus = String(stored?.status ?? "").trim();
    const storedTimestamp = hasValue(stored?.approvedTimestamp) ? String(stored?.approvedTimestamp).trim() : "";
    const storedEmail = hasValue(stored?.approvedEmail) ? String(stored?.approvedEmail).trim() : "";
    const storedApproved = Boolean(stored) && (Boolean(storedTimestamp || storedEmail) || APPROVED_STATUSES.has(storedStatus));
    if (storedApproved) {
        const status = APPROVED_STATUSES.has(requested) ? requested : APPROVED_STATUSES.has(storedStatus) ? storedStatus : "Pending Scheduling";
        return {
            status,
            approvedTimestamp: sentTimestamp || storedTimestamp || now,
            approvedEmail: sentEmail || storedEmail || actor,
            ruleApplied: false,
        };
    }
    if (APPROVED_STATUSES.has(requested) || sentTimestamp || sentEmail) {
        return {
            status: APPROVED_STATUSES.has(requested) ? requested : "Pending Scheduling",
            approvedTimestamp: sentTimestamp || now,
            approvedEmail: sentEmail || actor,
            ruleApplied: false,
        };
    }
    if (await passesAutoApprovalRule()) {
        return { status: "Pending Scheduling", approvedTimestamp: now, approvedEmail: AUTO_APPROVED_BY, ruleApplied: true };
    }
    return { status: "Pending PH", approvedTimestamp: null, approvedEmail: null, ruleApplied: true };
}
/**
 * Benchmark realization rate for a date from Settings > Realization Setup
 * (settings.realizationPerKgTargets, JSON [{dateFrom, dateTo, value}]).
 * The period with the latest start date that contains the date wins; undefined when none.
 */
export function realizationTargetForDate(raw, date) {
    const day = String(date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
        return undefined;
    let rows = [];
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        rows = Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return undefined;
    }
    const match = rows
        .map((row) => ({ from: String(row?.dateFrom || "").slice(0, 10), to: String(row?.dateTo || "").slice(0, 10), value: Number(row?.value) }))
        .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.from) && /^\d{4}-\d{2}-\d{2}$/.test(row.to) && row.from <= day && day <= row.to && Number.isFinite(row.value) && row.value > 0)
        .sort((a, b) => b.from.localeCompare(a.from))[0];
    return match?.value;
}
