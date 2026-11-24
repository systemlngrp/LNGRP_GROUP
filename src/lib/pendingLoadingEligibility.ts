import type {
  Company,
  DispatchPlan,
  LoadingSlip,
  Order,
  OrderItemSource,
  OrderSchedule,
  Production,
} from "../types";
import { normalizeOrderItemSource } from "./orderItems";

export type LoadingCatalogItem = {
  id: string;
  source?: OrderItemSource;
  name?: string;
  erp?: string | number;
  raw?: Record<string, unknown>;
};

export type EligibleLoadingJob = {
  jobId: string;
  jobNo: string;
  productionQty: number;
  alreadyLoaded: number;
  yetToLoad: number;
  atJobWorker?: number;
  /** Loading wastage already recorded on earlier slips. */
  loadingWastage?: number;
};

export type PendingLoadingPlanProjection = {
  plan: DispatchPlan;
  order?: Order;
  schedule?: OrderSchedule;
  item?: LoadingCatalogItem;
  company?: Company;
  firmId: string;
  itemSource: OrderItemSource;
  pendingQty: number;
  eligibleJobs: EligibleLoadingJob[];
};

const normalizeKey = (value: unknown) => String(value ?? "").trim().toLowerCase();
const normalizeText = (value: unknown) => String(value ?? "").trim();

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function addKey(keys: Set<string>, value: unknown) {
  const key = normalizeKey(value);
  if (key) keys.add(key);
}

function itemKeys(item?: LoadingCatalogItem, order?: Partial<Order> | null) {
  const keys = new Set<string>();
  const raw = item?.raw || {};
  [
    item?.id,
    item?.erp,
    raw.id,
    raw.itemId,
    raw.npdId,
    raw.phpId,
    raw.plateId,
    raw.materialId,
    raw.erp,
    raw.erpCode,
    raw.erpItemCode,
    raw.masterItemNameErpCode,
    order?.itemId,
    order?.npdId,
    order?.erpCode,
  ].forEach((value) => addKey(keys, value));
  return keys;
}

function productionItemKeys(production: Production) {
  const keys = new Set<string>();
  [production.itemId, production.npdId, production.erpCode, production.masterErp].forEach((value) => addKey(keys, value));
  return keys;
}

function getJobFirmId(production: Production) {
  return firstText(
    production.orderFirmId,
    production.sourceFirmId,
    production.destinationFirmId,
    production.firmId,
  );
}

function isTruthyMarker(value: unknown) {
  return ["yes", "true", "1", "posted", "tallied", "completed", "closed"].includes(normalizeKey(value));
}

function isCancelledJob(production: Production) {
  const status = normalizeKey(production.status);
  return ["cancelled", "canceled"].includes(status) || Boolean(normalizeText(production.cancelTimestamp));
}

function isClosedOrTallied(production: Production) {
  const status = normalizeKey(production.status);
  return (
    ["cancelled", "canceled", "completed", "closed", "tallied"].includes(status) ||
    Boolean(normalizeText(production.cancelTimestamp)) ||
    Boolean(normalizeText(production.tallyTimestamp)) ||
    Boolean(normalizeText(production.closeDate)) ||
    normalizeKey(production.closeBy) === "yes" ||
    isTruthyMarker((production as any).tallyPostingStatus)
  );
}

export function loadedQtyByJobId(slips: LoadingSlip[]) {
  const loaded = new Map<string, number>();
  slips.forEach((slip) => {
    if (["cancelled", "canceled"].includes(normalizeKey(slip.status))) return;
    (slip.lines || []).forEach((line) => {
      (line.allocations || []).forEach((allocation) => {
        if (normalizeKey(allocation.sourceType) !== "job") return;
        const jobId = normalizeKey("jobId" in allocation ? allocation.jobId : "");
        if (!jobId) return;
        const quantity = Number("qty" in allocation ? allocation.qty || 0 : 0);
        if (!Number.isFinite(quantity) || quantity <= 0) return;
        loaded.set(jobId, (loaded.get(jobId) || 0) + quantity);
      });
    });
  });
  return loaded;
}

/** Loading wastage per FG job across active loading slips (keyed by lower-case job id). */
export function loadingWastageByJobId(slips: LoadingSlip[]) {
  const wastage = new Map<string, number>();
  slips.forEach((slip) => {
    if (["cancelled", "canceled"].includes(normalizeKey(slip.status))) return;
    (slip.jobWastage || []).forEach((row) => {
      const jobId = normalizeKey(row?.jobId);
      const quantity = Number(row?.qty || 0);
      if (!jobId || !Number.isFinite(quantity) || quantity <= 0) return;
      wastage.set(jobId, (wastage.get(jobId) || 0) + quantity);
    });
  });
  return wastage;
}

/** Closed jobs stay loadable while they have a balance, but only from this job date on. */
export const LOADING_CLOSED_JOB_FIRST_DATE = "2026-11-17";

export function getDispatchPlanPendingQty(plan: DispatchPlan) {
  const pending = Number(plan.plannedQty || 0) - Number(plan.loadedQty || 0) - Number(plan.canceledQty || 0);
  return Number.isFinite(pending) ? Math.max(
    0,
    pending,
  ) : 0;
}

export function getLoadingJobNumber(production: Production) {
  return firstText(production.transactionNo, production.jobCardNo);
}

// Item key -> positions of the jobs carrying that key, cached per job list.
const jobIndexCache = new WeakMap<Production[], Map<string, number[]>>();
function jobIndexFor(jobs: Production[]) {
  let index = jobIndexCache.get(jobs);
  if (index) return index;
  index = new Map<string, number[]>();
  jobs.forEach((production, position) => {
    productionItemKeys(production).forEach((key) => {
      const list = index!.get(key);
      if (list) list.push(position);
      else index!.set(key, [position]);
    });
  });
  jobIndexCache.set(jobs, index);
  return index;
}

export function eligibleLoadingJobs(
  itemSource: OrderItemSource,
  itemId: string,
  firmId: string,
  productions: Production[],
  phpJobs: Production[],
  plateJobs: Production[],
  alreadyLoaded: Map<string, number>,
  itemAliases: string[] = [],
  corrugationQtyByJobId?: Map<string, number>,
  /** Qty of each job still at a job worker (open Job Work gate passes): not loadable. */
  atJobWorkerByJobId?: Map<string, number>,
  /** Loading wastage already recorded per job (keyed by lower-case job id). */
  wastageByJobId?: Map<string, number>,
) {
  // FG jobs: loadable qty = boxes made on Corrugation Liner (jobs without a
  // Corrugation Liner entry are not listed). PHP / Plate keep their output qty.
  const jobQty = (production: Production) => {
    if (source !== "FG") return Number(production.productionOutputQty || 0);
    if (corrugationQtyByJobId) return corrugationQtyByJobId.get(String(production.id || "").trim()) || 0;
    return Number(production.prodFromFFG || 0);
  };
  const source = normalizeOrderItemSource(itemSource);
  const sourceJobs = source === "PHP" ? phpJobs : source === "PLATE" ? plateJobs : productions;
  const targetItemKeys = new Set<string>();
  [itemId, ...itemAliases].forEach((value) => addKey(targetItemKeys, value));
  const targetFirm = normalizeKey(firmId);

  if (targetItemKeys.size === 0) return [];

  // Only the jobs filed under one of the item's keys (index built once per job list).
  const index = jobIndexFor(sourceJobs);
  const positions = new Set<number>();
  targetItemKeys.forEach((key) => index.get(key)?.forEach((position) => positions.add(position)));
  const candidates = Array.from(positions).sort((a, b) => a - b).map((position) => sourceJobs[position]);

  return candidates
    .filter((production) => {

      const jobFirm = normalizeKey(getJobFirmId(production));
      if (targetFirm && jobFirm && targetFirm !== jobFirm) return false;
      if (!targetFirm && jobFirm) return false;
      // Cancelled jobs never load. Closed jobs keep loading their balance
      // (newest first) when dated on/after the cut-off.
      if (isCancelledJob(production)) return false;
      if (isClosedOrTallied(production) && String(production.date || "").slice(0, 10) < LOADING_CLOSED_JOB_FIRST_DATE) return false;

      const productionQty = jobQty(production);
      return Number.isFinite(productionQty) && productionQty > 0;
    })
    .map((production) => {
      const productionQty = jobQty(production);
      const loaded = alreadyLoaded.get(normalizeKey(production.id)) || 0;
      const atJobWorker = atJobWorkerByJobId?.get(String(production.id || "").trim()) || 0;
      const loadingWastage = wastageByJobId?.get(normalizeKey(production.id)) || 0;
      return {
        jobId: production.id,
        jobNo: getLoadingJobNumber(production),
        productionQty,
        alreadyLoaded: loaded,
        loadingWastage,
        atJobWorker,
        yetToLoad: Math.max(0, productionQty - loaded - loadingWastage - atJobWorker),
      };
    })
    .filter((job) => Boolean(job.jobNo) && job.yetToLoad > 0)
    // Every job with a balance, newest first.
    .sort((a, b) =>
      b.jobNo.localeCompare(a.jobNo, undefined, { numeric: true, sensitivity: "base" }),
    );
}

function resolveFirmId(
  plan: DispatchPlan,
  schedule?: OrderSchedule,
  order?: Order,
  firms: Array<{ id: string }> = [],
) {
  const raw = firstText(plan.orderFirmId, plan.firmId, schedule?.firmId, order?.firmId);
  const firm = firms.find((row) => normalizeKey(row.id) === normalizeKey(raw));
  return normalizeText(firm?.id || raw);
}

export function getPendingLoadingPlanProjections(args: {
  plans: DispatchPlan[];
  orders: Order[];
  schedules: OrderSchedule[];
  companies?: Company[];
  firms?: Array<{ id: string }>;
  productions: Production[];
  phpJobs: Production[];
  plateJobs: Production[];
  loadingSlips: LoadingSlip[];
  corrugationQtyByJobId?: Map<string, number>;
  atJobWorkerByJobId?: Map<string, number>;
  resolveOrderItem?: (order?: Order) => LoadingCatalogItem | undefined;
  findItemAcrossSources?: (
    itemId: string,
    source?: OrderItemSource,
    erpCode?: string | number,
  ) => LoadingCatalogItem | undefined;
}) {
  const orderById = new Map(args.orders.map((order) => [normalizeKey(order.id), order]));
  const scheduleById = new Map(args.schedules.map((schedule) => [normalizeKey(schedule.id), schedule]));
  const companyById = new Map((args.companies || []).map((company) => [normalizeKey(company.id), company]));
  const loaded = loadedQtyByJobId(args.loadingSlips);
  const wastage = loadingWastageByJobId(args.loadingSlips);

  return args.plans.flatMap<PendingLoadingPlanProjection>((plan) => {
    const pendingQty = getDispatchPlanPendingQty(plan);
    if (pendingQty <= 0) return [];

    const order = orderById.get(normalizeKey(plan.orderId));
    const schedule = scheduleById.get(normalizeKey(plan.scheduleId));
    const itemFromOrder = args.resolveOrderItem?.(order);
    const source = normalizeOrderItemSource(order?.itemSource || itemFromOrder?.source);
    const item = itemFromOrder || args.findItemAcrossSources?.(
      firstText(order?.itemId, order?.npdId),
      source,
      firstText(order?.erpCode),
    );
    const firmId = resolveFirmId(plan, schedule, order, args.firms);
    const eligibleJobs = eligibleLoadingJobs(
      source,
      item?.id || firstText(order?.itemId, order?.npdId),
      firmId,
      args.productions,
      args.phpJobs,
      args.plateJobs,
      loaded,
      Array.from(itemKeys(item, order)),
      args.corrugationQtyByJobId,
      args.atJobWorkerByJobId,
      wastage,
    );


    return [{
      plan,
      order,
      schedule,
      item,
      company: companyById.get(normalizeKey(order?.companyId)),
      firmId,
      itemSource: source,
      pendingQty,
      eligibleJobs,
    }];
  });
}

export function countEligibleLoadingPlans(args: Parameters<typeof getPendingLoadingPlanProjections>[0]) {
  return getPendingLoadingPlanProjections(args).length;
}
