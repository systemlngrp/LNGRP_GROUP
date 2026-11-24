import type { LoadingSlip, LoadingSlipJobConfirmation, ProductionProcessing } from "../types";

/**
 * Loading wastage confirmation (decided 24-Nov-2026).
 *
 * Every loading slip dated on/after the cut-off that loads from FG jobs needs,
 * per job, two ticks by a user: the loading wastage (0 allowed) and the job's
 * Pending FG after this load. A job loaded while its Printing was Complete is
 * confirmed in the Load form; one loaded while Printing was In Progress is
 * confirmed later in Pending Loading Wastage, only once Printing is Complete.
 * Pending Invoicing shows a slip only when all its jobs are confirmed.
 */
export const LOADING_WASTAGE_CONFIRMATION_FIRST_DATE = "2026-11-17";

const key = (value: unknown) => String(value ?? "").trim().toLowerCase();
const isCancelled = (status: unknown) => ["cancelled", "canceled"].includes(key(status));

export function parseJobConfirmations(slip: Pick<LoadingSlip, "jobConfirmations">): LoadingSlipJobConfirmation[] {
  const raw: unknown = slip.jobConfirmations;
  if (Array.isArray(raw)) return raw as LoadingSlipJobConfirmation[];
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** FG jobs loaded on the slip: job id, job no and qty loaded on this slip. */
export function slipFgJobs(slip: LoadingSlip) {
  const byJob = new Map<string, { jobId: string; jobNo: string; loadedQty: number }>();
  (slip.lines || []).forEach((line) => {
    if (String(line.itemSource || "FG").trim().toUpperCase() !== "FG") return;
    (line.allocations || []).forEach((allocation: any) => {
      if (key(allocation?.sourceType) !== "job") return;
      const jobId = String(allocation.jobId || "").trim();
      if (!jobId) return;
      const qty = Number(allocation.qty || 0);
      const current = byJob.get(jobId) || { jobId, jobNo: String(allocation.jobNo || ""), loadedQty: 0 };
      current.loadedQty += Number.isFinite(qty) ? qty : 0;
      byJob.set(jobId, current);
    });
  });
  return Array.from(byJob.values());
}

/** True when the slip falls under the rule (date and FG job rows), whatever its state. */
export function slipUnderWastageRule(slip: LoadingSlip) {
  if (isCancelled(slip.status)) return false;
  if (String(slip.date || "").slice(0, 10) < LOADING_WASTAGE_CONFIRMATION_FIRST_DATE) return false;
  return slipFgJobs(slip).length > 0;
}

export const isJobConfirmed = (confirmation?: LoadingSlipJobConfirmation) => Boolean(confirmation && String(confirmation.confirmedAt || "").trim());

/** FG jobs of the slip that still need the two ticks (empty = settled or not under the rule). */
export function unconfirmedSlipJobs(slip: LoadingSlip) {
  if (!slipUnderWastageRule(slip)) return [];
  const confirmations = parseJobConfirmations(slip);
  return slipFgJobs(slip).filter((job) => !isJobConfirmed(confirmations.find((row) => key(row.jobId) === key(job.jobId))));
}

/** Not yet invoiced and at least one job still to confirm: shown in Pending Loading Wastage, kept out of Pending Invoicing. */
export function slipAwaitsWastageConfirmation(slip: LoadingSlip) {
  if (String(slip.invoiceId || "").trim()) return false;
  return unconfirmedSlipJobs(slip).length > 0;
}

/** Loading wastage of one job on one slip. */
export function slipJobWastage(slip: LoadingSlip, jobId: string) {
  return (slip.jobWastage || []).reduce((sum, row) => (key(row.jobId) === key(jobId) ? sum + (Number(row.qty) || 0) : sum), 0);
}

/** Printing totals per job from Production Processing: printed qty and whether a Complete entry exists. */
export function printingByJob(processing: Array<Pick<ProductionProcessing, "productionId" | "machineName" | "qty" | "completionStatus">>, normalizeMachineName: (name?: string) => string) {
  const printed = new Map<string, number>();
  const complete = new Set<string>();
  processing.forEach((entry) => {
    if (normalizeMachineName(entry.machineName) !== "Printing") return;
    const jobId = String(entry.productionId || "").trim();
    if (!jobId) return;
    printed.set(jobId, (printed.get(jobId) || 0) + (Number(entry.qty) || 0));
    const status = key(entry.completionStatus);
    if (!status || status === "full") complete.add(jobId);
  });
  return { printed, complete };
}

/** Loaded qty and loading wastage per job across all slips that are not cancelled. */
export function loadedAndWastageByJob(slips: LoadingSlip[]) {
  const loaded = new Map<string, number>();
  const wastage = new Map<string, number>();
  slips.forEach((slip) => {
    if (isCancelled(slip.status)) return;
    slipFgJobs(slip).forEach((job) => loaded.set(key(job.jobId), (loaded.get(key(job.jobId)) || 0) + job.loadedQty));
    (slip.jobWastage || []).forEach((row) => {
      const qty = Number(row.qty || 0);
      if (!row.jobId || !(qty > 0)) return;
      wastage.set(key(row.jobId), (wastage.get(key(row.jobId)) || 0) + qty);
    });
  });
  return { loaded, wastage };
}

/** "I, <name>, confirm …" lines for one job. */
export function wastageTickText(userName: string, jobNo: string, wastage: number) {
  return wastage > 0
    ? `I, ${userName}, confirm that loading wastage for ${jobNo} is ${wastage.toLocaleString()}.`
    : `I, ${userName}, confirm that there is no loading wastage for ${jobNo}.`;
}
export function pendingFgTickText(userName: string, jobNo: string, pendingFg: number) {
  return `I, ${userName}, confirm that the Pending FG figure for ${jobNo} (${pendingFg.toLocaleString()}) is correct.`;
}
