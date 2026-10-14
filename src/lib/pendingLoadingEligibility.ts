import type { DispatchPlan, LoadingSlip, Order, OrderItemSource, OrderSchedule, Production } from "../types";
import { normalizeOrderItemSource } from "./orderItems";

export function loadedQtyByJobId(slips: LoadingSlip[]) {
  const loaded = new Map<string, number>();
  slips.forEach((slip) => {
    if (slip.status === "Cancelled") return;
    slip.lines.forEach((line) => {
      (line.allocations || []).forEach((allocation) => {
        if (allocation.sourceType !== "job") return;
        loaded.set(allocation.jobId, (loaded.get(allocation.jobId) || 0) + Number(allocation.qty || 0));
      });
    });
  });
  return loaded;
}

export function eligibleLoadingJobs(
  itemSource: OrderItemSource,
  itemId: string,
  firmId: string,
  productions: Production[],
  phpJobs: Production[],
  plateJobs: Production[],
  alreadyLoaded: Map<string, number>,
) {
  const sourceJobs = itemSource === "PHP" ? phpJobs : itemSource === "PLATE" ? plateJobs : productions;
  return sourceJobs
    .filter((production) => {
      const jobFirm = String(production.orderFirmId || production.sourceFirmId || production.destinationFirmId || production.firmId || "").trim();
      if (production.itemId !== itemId || (jobFirm && jobFirm !== firmId)) return false;
      if (production.status === "Cancelled" || production.cancelTimestamp || production.status === "Completed" || production.tallyTimestamp) return false;
      if (production.closeDate || String(production.closeBy || "").trim().toLowerCase() === "yes") return false;
      return Number(itemSource === "FG" ? production.prodFromFFG || 0 : production.productionOutputQty || 0) > 0;
    })
    .map((production) => {
      const productionQty = Number(itemSource === "FG" ? production.prodFromFFG || 0 : production.productionOutputQty || 0);
      const loaded = alreadyLoaded.get(production.id) || 0;
      return {
        jobId: production.id,
        jobNo: String(production.transactionNo || "").trim() || String(production.jobCardNo || "").trim(),
        productionQty,
        alreadyLoaded: loaded,
        yetToLoad: Math.max(0, productionQty - loaded),
      };
    })
    .filter((job) => job.jobNo && job.yetToLoad > 0)
    .sort((a, b) => b.jobNo.localeCompare(a.jobNo, undefined, { numeric: true, sensitivity: "base" }))
    .slice(0, 3);
}

export function countEligibleLoadingPlans(args: {
  plans: DispatchPlan[];
  orders: Order[];
  schedules: OrderSchedule[];
  productions: Production[];
  phpJobs: Production[];
  plateJobs: Production[];
  loadingSlips: LoadingSlip[];
  resolveOrderItem?: (order?: Order) => { id: string; source?: OrderItemSource } | undefined;
}) {
  const orderById = new Map(args.orders.map((order) => [order.id, order]));
  const scheduleById = new Map(args.schedules.map((schedule) => [schedule.id, schedule]));
  const loaded = loadedQtyByJobId(args.loadingSlips);
  return args.plans.filter((plan) => {
    const pending = Number(plan.plannedQty || 0) - Number(plan.loadedQty || 0) - Number(plan.canceledQty || 0);
    if (pending <= 0) return false;
    const order = orderById.get(plan.orderId);
    const item = args.resolveOrderItem?.(order);
    const firmId = String(scheduleById.get(plan.scheduleId)?.firmId || order?.firmId || "");
    const source = normalizeOrderItemSource(order?.itemSource || item?.source);
    return eligibleLoadingJobs(source, item?.id || "", firmId, args.productions, args.phpJobs, args.plateJobs, loaded).length > 0;
  }).length;
}
