import type { LoadingSlipAllocation } from "../types";

export const MAX_JOB_LOAD_QTY_PER_SLIP = 3;

export function getJobAllocationTotals(allocations: LoadingSlipAllocation[] = []) {
  const totals = new Map<string, number>();
  allocations.forEach((allocation) => {
    if (allocation.sourceType !== "job") return;
    const key = String(allocation.jobId || allocation.jobNo || "").trim();
    if (!key) return;
    totals.set(key, (totals.get(key) || 0) + Number(allocation.qty || 0));
  });
  return totals;
}

export function getJobAllocationLimitError(allocations: LoadingSlipAllocation[] = []) {
  const totals = getJobAllocationTotals(allocations);
  const labels = new Map<string, string>();
  allocations.forEach((allocation) => {
    if (allocation.sourceType === "job") labels.set(String(allocation.jobId || allocation.jobNo || "").trim(), allocation.jobNo);
  });
  for (const [key, total] of totals) {
    if (total > MAX_JOB_LOAD_QTY_PER_SLIP + 0.0001) {
      return `Job No ${labels.get(key) || key} cannot exceed a load quantity of ${MAX_JOB_LOAD_QTY_PER_SLIP} per loading slip.`;
    }
  }
  return null;
}
