import type { LoadingSlipAllocation } from "../types";

export const MAX_LOADING_SLIPS_PER_JOB = 3;

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

export function getJobLoadingSlipLimitError(
  allocations: LoadingSlipAllocation[] = [],
  existingSlips: Array<{ id: string; status?: string; lines?: Array<{ allocations?: LoadingSlipAllocation[] }> }> = [],
  excludedSlipId?: string,
) {
  const labels = new Map<string, string>();
  allocations.forEach((allocation) => {
    if (allocation.sourceType === "job") labels.set(String(allocation.jobId || allocation.jobNo || "").trim(), allocation.jobNo);
  });
  const currentJobKeys = new Set(
    allocations.filter((allocation) => allocation.sourceType === "job").map((allocation) => String(allocation.jobId || allocation.jobNo || "").trim()).filter(Boolean),
  );
  for (const key of currentJobKeys) {
    const slipCount = existingSlips.filter((slip) => {
      if (slip.id === excludedSlipId || String(slip.status || "").toLowerCase() === "cancelled") return false;
      const slipKeys = new Set(
        (slip.lines || []).flatMap((line) => line.allocations || [])
          .filter((allocation) => allocation.sourceType === "job")
          .map((allocation) => String(allocation.jobId || allocation.jobNo || "").trim())
          .filter(Boolean),
      );
      return slipKeys.has(key);
    }).length;
    if (slipCount >= MAX_LOADING_SLIPS_PER_JOB) {
      return `Job No ${labels.get(key) || key} cannot be loaded in more than ${MAX_LOADING_SLIPS_PER_JOB} loading slips.`;
    }
  }
  return null;
}
