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

const hasValue = (value: unknown) => {
  const text = String(value ?? "").trim();
  return Boolean(text) && text.toLowerCase() !== "null" && text.toLowerCase() !== "undefined";
};

export type StoredOrder = { status?: unknown; approvedTimestamp?: unknown; approvedEmail?: unknown } | null | undefined;

export type ApprovalDecision = {
  status: string;
  approvedTimestamp: string | null;
  approvedEmail: string | null;
  /** True when the rate/RAPC rule was applied to reach this decision. */
  ruleApplied: boolean;
  /** Which branch decided: cancelled, kept (already approved), explicit (approved by a person/import), rule. */
  path: "cancelled" | "kept" | "explicit" | "rule";
};

/** What the rate/RAPC rule found, kept on the order so people can see why it was or was not auto-approved. */
export type RuleCheck = {
  orderRate?: number;
  lastBillingRate?: number;
  lastBillingInvoiceNo?: string;
  lastBillingDate?: string;
  benchmark?: number;
  lastRapc?: number;
  rapcJobNo?: string;
  rapcJobDate?: string;
  /** First condition that failed; empty when all passed. */
  failed?: "item" | "billing" | "rate" | "period" | "rapc" | "rapcLow" | "error";
};

const fmt = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) ? (Math.round(v * 100) / 100).toString() : "-";
};
const ddmmyyyy = (d?: string) => {
  const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(d || "");
};

/** One line on why the rule passed or failed, e.g. for the Order Master and Pending Scheduling screens. */
export function describeRuleCheck(c: RuleCheck): string {
  const bill = c.lastBillingInvoiceNo ? ` (${c.lastBillingInvoiceNo}${c.lastBillingDate ? `, ${ddmmyyyy(c.lastBillingDate)}` : ""})` : "";
  const job = c.rapcJobNo ? ` (${c.rapcJobNo}${c.rapcJobDate ? `, ${ddmmyyyy(c.rapcJobDate)}` : ""})` : "";
  switch (c.failed) {
    case "item": return "Not auto-approved: item is not an FG/NPD item";
    case "billing": return "Not auto-approved: no earlier invoice for this item";
    case "rate": return `Not auto-approved: rate ${fmt(c.orderRate)} differs from last billing rate ${fmt(c.lastBillingRate)}${bill}`;
    case "period": return "Not auto-approved: order date is in no Realization Setup period";
    case "rapc": return "Not auto-approved: no job with RAPC for this item";
    case "rapcLow": return `Not auto-approved: last RAPC ${fmt(c.lastRapc)}${job} is below benchmark ${fmt(c.benchmark)}`;
    case "error": return "Not auto-approved: rule could not be checked";
    default: return `Auto-approved: rate ${fmt(c.orderRate)} = last billing rate${bill}; last RAPC ${fmt(c.lastRapc)}${job} >= benchmark ${fmt(c.benchmark)}`;
  }
}

export async function decideOrderApproval(
  data: { status?: unknown; approvedTimestamp?: unknown; approvedEmail?: unknown; updatedBy?: unknown; orderBy?: unknown },
  stored: StoredOrder,
  passesAutoApprovalRule: () => Promise<boolean>,
  now = new Date().toISOString(),
): Promise<ApprovalDecision> {
  const requested = String(data.status ?? "").trim();
  const sentTimestamp = hasValue(data.approvedTimestamp) ? String(data.approvedTimestamp).trim() : "";
  const sentEmail = hasValue(data.approvedEmail) ? String(data.approvedEmail).trim() : "";
  const actor = String(data.updatedBy ?? data.orderBy ?? "").trim() || "System";

  if (CANCELLED_STATUSES.has(requested)) {
    return { status: requested, approvedTimestamp: sentTimestamp || null, approvedEmail: sentEmail || null, ruleApplied: false, path: "cancelled" };
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
      path: "kept",
    };
  }

  if (APPROVED_STATUSES.has(requested) || sentTimestamp || sentEmail) {
    return {
      status: APPROVED_STATUSES.has(requested) ? requested : "Pending Scheduling",
      approvedTimestamp: sentTimestamp || now,
      approvedEmail: sentEmail || actor,
      ruleApplied: false,
      path: "explicit",
    };
  }

  if (await passesAutoApprovalRule()) {
    return { status: "Pending Scheduling", approvedTimestamp: now, approvedEmail: AUTO_APPROVED_BY, ruleApplied: true, path: "rule" };
  }
  return { status: "Pending PH", approvedTimestamp: null, approvedEmail: null, ruleApplied: true, path: "rule" };
}

/**
 * Benchmark realization rate for a date from Settings > Realization Setup
 * (settings.realizationPerKgTargets, JSON [{dateFrom, dateTo, value}]).
 * The period with the latest start date that contains the date wins; undefined when none.
 */
export function realizationTargetForDate(raw: unknown, date: string): number | undefined {
  const day = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  let rows: any[] = [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    return undefined;
  }
  const match = rows
    .map((row) => ({ from: String(row?.dateFrom || "").slice(0, 10), to: String(row?.dateTo || "").slice(0, 10), value: Number(row?.value) }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.from) && /^\d{4}-\d{2}-\d{2}$/.test(row.to) && row.from <= day && day <= row.to && Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => b.from.localeCompare(a.from))[0];
  return match?.value;
}
