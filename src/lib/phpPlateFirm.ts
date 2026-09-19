import type { Order, OrderSchedule, Production } from "../types";

/** Resolve the owning firm for PHP/Plate jobs, including records created before firm data was persisted. */
export function resolvePhpPlateFirmId(
  job: Pick<Production, "firmId" | "scheduleId">,
  schedules: OrderSchedule[],
  orders: Order[],
): string {
  if (String(job.firmId || "").trim()) return String(job.firmId).trim();
  const schedule = schedules.find((entry) => entry.id === job.scheduleId);
  if (String(schedule?.firmId || "").trim()) return String(schedule?.firmId).trim();
  return String(orders.find((entry) => entry.id === schedule?.orderId)?.firmId || "").trim();
}

export function workflowDate(value: Pick<Production, "scheduledDate" | "date">): string {
  return String(value.scheduledDate || value.date || "").slice(0, 10);
}
