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
