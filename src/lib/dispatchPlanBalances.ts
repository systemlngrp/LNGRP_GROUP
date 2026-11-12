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

/**
 * Invoiced qty per schedule: each loading slip's invoice lines are matched to
 * the slip's lines of the same item (in slip order) and counted against that
 * line's dispatch plan schedule, up to the line's loaded qty.
 */
export const buildInvoicedQtyByScheduleId = (
  dispatchPlans: Array<Pick<DispatchPlan, "id" | "scheduleId">>,
  loadingSlips: Array<{ id?: string; status?: string; lines?: Array<{ dispatchPlanId?: string; loadedQty?: unknown; itemId?: string }> }>,
  invoiceLineItems: Array<{ loadingSlipId?: string; itemId?: string; npdId?: string; qty?: unknown }>,
) => {
  const scheduleIdByPlanId = new Map(dispatchPlans.map((plan) => [String(plan.id || ""), String(plan.scheduleId || "")]));
  const billed = new Map<string, number>();
  invoiceLineItems.forEach((line) => {
    const slipId = String(line.loadingSlipId || "").trim();
    const itemId = String(line.npdId || line.itemId || "").trim();
    if (!slipId || !itemId) return;
    const key = `${slipId}::${itemId}`;
    billed.set(key, (billed.get(key) || 0) + amount(line.qty));
  });
  const map = new Map<string, number>();
  loadingSlips.forEach((slip) => {
    if (slip.status === "Cancelled") return;
    const slipId = String(slip.id || "").trim();
    (slip.lines || []).forEach((line) => {
      const key = `${slipId}::${String(line.itemId || "").trim()}`;
      const left = billed.get(key) || 0;
      if (left <= 0) return;
      const used = Math.min(left, Math.max(0, amount(line.loadedQty)));
      billed.set(key, left - used);
      const scheduleId = scheduleIdByPlanId.get(String(line.dispatchPlanId || "").trim());
      if (scheduleId) map.set(scheduleId, (map.get(scheduleId) || 0) + used);
    });
  });
  return map;
};
