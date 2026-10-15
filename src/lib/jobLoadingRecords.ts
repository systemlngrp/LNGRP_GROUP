import type { DispatchPlan, LoadingSlip, Production } from "../types";

export type JobLoadingRecord = { slip: LoadingSlip; qty: number; itemIds: string[] };

const key = (value: unknown) => String(value ?? "").trim().toLowerCase();
const positiveQty = (value: unknown) => {
  const qty = Number(value);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
};

export function buildJobLoadingRecords(productions: Production[], slips: LoadingSlip[], plans: DispatchPlan[]) {
  const byId = new Map(productions.map((production) => [key(production.id), production.id]));
  const byJobNo = new Map(productions.map((production) => [key(production.transactionNo || production.jobCardNo), production.id]));
  const planById = new Map(plans.map((plan) => [key(plan.id), plan]));
  const records = new Map<string, Map<string, { slip: LoadingSlip; qty: number; itemIds: Set<string> }>>();

  for (const slip of slips) {
    if (key(slip.status) === "cancelled") continue;
    for (const line of slip.lines || []) {
      const jobs = (line.allocations || []).filter((allocation) => allocation.sourceType === "job");
      const quantities = new Map<string, number>();
      if (jobs.length) {
        for (const allocation of jobs) {
          if (allocation.sourceType !== "job") continue;
          const productionId = byId.get(key(allocation.jobId)) || byJobNo.get(key(allocation.jobNo));
          const qty = positiveQty(allocation.qty);
          if (productionId && qty) quantities.set(productionId, (quantities.get(productionId) || 0) + qty);
        }
      } else {
        const plan = planById.get(key(line.dispatchPlanId));
        const planProductionId = byId.get(key(plan?.productionId));
        const jobNos = [...new Set((line.jobNos || []).map(key).filter(Boolean))];
        const productionId = planProductionId || (jobNos.length === 1 ? byJobNo.get(jobNos[0]) : undefined);
        const qty = positiveQty(line.loadedQty);
        if (productionId && qty) quantities.set(productionId, qty);
      }

      for (const [productionId, qty] of quantities) {
        let bySlip = records.get(productionId);
        if (!bySlip) {
          bySlip = new Map();
          records.set(productionId, bySlip);
        }
        let record = bySlip.get(slip.id);
        if (!record) {
          record = { slip, qty: 0, itemIds: new Set() };
          bySlip.set(slip.id, record);
        }
        record.qty += qty;
        if (line.itemId) record.itemIds.add(key(line.itemId));
      }
    }
  }

  return new Map(Array.from(records, ([productionId, bySlip]) => [productionId,
    Array.from(bySlip.values())
      .map(({ slip, qty, itemIds }): JobLoadingRecord => ({ slip, qty: Number(qty.toFixed(2)), itemIds: [...itemIds] }))
      .sort((a, b) => String(a.slip.date || "").localeCompare(String(b.slip.date || "")) ||
        String(a.slip.slipNo || "").localeCompare(String(b.slip.slipNo || ""), undefined, { numeric: true })),
  ]));
}
