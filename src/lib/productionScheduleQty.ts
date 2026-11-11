import type { DispatchPlan, LoadingSlip, Production } from "../types";

export type ScheduleConsumptionSummary = {
  plannedQty: number;
  actualProducedQty: number;
  plannedWithoutFfgQty: number;
  effectiveConsumedQty: number;
  /** Qty loaded against this schedule (all sources). */
  loadedQty: number;
  /** Part of loadedQty that came from FG stock or from jobs of other schedules. */
  loadedFromOtherSourcesQty: number;
};

/**
 * Loading already done against schedules. When given, a schedule's supply is
 * its own jobs plus whatever was loaded for it from FG stock or other jobs,
 * so an order supplied from stock no longer shows as needing production.
 */
export type ScheduleLoadingSupply = {
  dispatchPlans: DispatchPlan[];
  loadingSlips: LoadingSlip[];
};

function buildLinkedScheduleMap(rows: Production[]) {
  const map = new Map<string, string>();
  rows.forEach((row) => {
    const jobId = String(row.id || "").trim();
    const scheduleId = String(row.scheduleId || "").trim();
    if (!jobId || !scheduleId) return;
    map.set(jobId, scheduleId);
  });
  return map;
}

function hasFilledFfgValue(production: Production) {
  const value = Number(production.prodFromFFG);
  return Number.isFinite(value) && value > 0;
}

export function buildScheduleConsumptionByScheduleId(
  productions: Production[],
  phpJobs: Production[] = [],
  plateJobs: Production[] = [],
  supply?: ScheduleLoadingSupply,
) {
  const map = new Map<string, ScheduleConsumptionSummary>();
  const jobScheduleById = new Map<string, string>();
  const emptySummary = (): ScheduleConsumptionSummary => ({
    plannedQty: 0,
    actualProducedQty: 0,
    plannedWithoutFfgQty: 0,
    effectiveConsumedQty: 0,
    loadedQty: 0,
    loadedFromOtherSourcesQty: 0,
  });
  const phpScheduleByJobId = buildLinkedScheduleMap(phpJobs);
  const plateScheduleByJobId = buildLinkedScheduleMap(plateJobs);

  productions
    .filter((production) => production.status !== "Cancelled" && !production.cancelTimestamp)
    .forEach((production) => {
      const directScheduleId = String(production.scheduleId || "").trim();
      const phpLinkedScheduleId = String(
        phpScheduleByJobId.get(String(production.phpScheduledJobId || "").trim()) || "",
      ).trim();
      const plateLinkedScheduleId = String(
        plateScheduleByJobId.get(String(production.plateScheduledJobId || "").trim()) || "",
      ).trim();
      const effectiveScheduleId = directScheduleId || phpLinkedScheduleId || plateLinkedScheduleId;
      if (!effectiveScheduleId) return;
      jobScheduleById.set(String(production.id || "").trim(), effectiveScheduleId);

      const current = map.get(effectiveScheduleId) || emptySummary();

      if (hasFilledFfgValue(production)) {
        current.actualProducedQty += Number(production.prodFromFFG || 0);
      } else {
        current.plannedWithoutFfgQty += Number(production.qty || 0);
      }

      current.plannedQty = current.actualProducedQty + current.plannedWithoutFfgQty;
      current.effectiveConsumedQty = current.actualProducedQty + current.plannedWithoutFfgQty;
      map.set(effectiveScheduleId, current);
    });

  if (supply) {
    const scheduleByPlanId = new Map<string, string>();
    supply.dispatchPlans.forEach((plan) => {
      const planId = String(plan.id || "").trim();
      const scheduleId = String(plan.scheduleId || "").trim();
      if (planId && scheduleId) scheduleByPlanId.set(planId, scheduleId);
    });
    const loadedOwnByScheduleId = new Map<string, number>();
    supply.loadingSlips
      .filter((slip) => slip.status !== "Cancelled")
      .forEach((slip) => {
        (slip.lines || []).forEach((line) => {
          const scheduleId = scheduleByPlanId.get(String(line.dispatchPlanId || "").trim());
          if (!scheduleId) return;
          const current = map.get(scheduleId) || emptySummary();
          current.loadedQty += Number(line.loadedQty || 0);
          map.set(scheduleId, current);
          (line.allocations || []).forEach((allocation) => {
            if (allocation.sourceType !== "job") return;
            if (jobScheduleById.get(String(allocation.jobId || "").trim()) !== scheduleId) return;
            loadedOwnByScheduleId.set(scheduleId, (loadedOwnByScheduleId.get(scheduleId) || 0) + Number(allocation.qty || 0));
          });
        });
      });
    map.forEach((summary, scheduleId) => {
      if (summary.loadedQty <= 0) return;
      const loadedOwn = Math.min(loadedOwnByScheduleId.get(scheduleId) || 0, summary.loadedQty);
      summary.loadedFromOtherSourcesQty = summary.loadedQty - loadedOwn;
      // Supplied = own jobs + goods loaded from stock/other jobs, never less than what was loaded.
      summary.effectiveConsumedQty = Math.max(
        summary.plannedQty + summary.loadedFromOtherSourcesQty,
        summary.loadedQty,
      );
    });
  }

  return map;
}
