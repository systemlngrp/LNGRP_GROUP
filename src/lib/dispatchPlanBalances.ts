import type { DispatchPlan, OrderSchedule } from "../types";

const amount = (value: unknown) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

export const getEffectiveDispatchPlanQty = (plan: Pick<DispatchPlan, "plannedQty" | "canceledQty">) =>
  Math.max(0, amount(plan.plannedQty) - amount(plan.canceledQty));

export const getDispatchPlanPendingQty = (
  plan: Pick<DispatchPlan, "plannedQty" | "canceledQty">,
  loadedQty: number,
) => Math.max(0, getEffectiveDispatchPlanQty(plan) - Math.max(0, amount(loadedQty)));

export const getScheduleAvailableQty = (
  schedule: Pick<OrderSchedule, "id" | "qty" | "canceledQty">,
  plans: Array<Pick<DispatchPlan, "scheduleId" | "plannedQty" | "canceledQty">>,
) => {
  const reserved = plans
    .filter((plan) => String(plan.scheduleId || "") === String(schedule.id || ""))
    .reduce((sum, plan) => sum + getEffectiveDispatchPlanQty(plan), 0);
  return Math.max(0, amount(schedule.qty) - amount(schedule.canceledQty) - reserved);
};

/** Loaded qty per schedule: active loading slip lines, linked through their dispatch plan. */
export const buildLoadedQtyByScheduleId = (
  dispatchPlans: Array<Pick<DispatchPlan, "id" | "scheduleId">>,
  loadingSlips: Array<{ status?: string; lines?: Array<{ dispatchPlanId?: string; loadedQty?: unknown }> }>,
) => {
  const scheduleIdByPlanId = new Map(dispatchPlans.map((plan) => [String(plan.id || ""), String(plan.scheduleId || "")]));
  const map = new Map<string, number>();
  loadingSlips.forEach((slip) => {
    if (slip.status === "Cancelled") return;
    (slip.lines || []).forEach((line) => {
      const scheduleId = scheduleIdByPlanId.get(String(line.dispatchPlanId || "").trim());
      if (!scheduleId) return;
      map.set(scheduleId, (map.get(scheduleId) || 0) + amount(line.loadedQty));
    });
  });
  return map;
};

/**
 * Pending Dispatch Planning list rule (same as the AppSheet / New Order Master
 * "Pending" column): schedule qty − cancelled qty − qty already dispatched
 * (loaded). Planned-but-not-loaded qty is still pending here.
 */
export const getScheduleDispatchPendingQty = (
  schedule: Pick<OrderSchedule, "qty" | "canceledQty">,
  loadedQty: number,
) => amount(schedule.qty) - amount(schedule.canceledQty) - amount(loadedQty);
