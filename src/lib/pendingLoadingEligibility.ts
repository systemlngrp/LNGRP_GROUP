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

export function eligibleLoadingJobs(
  itemSource: OrderItemSource,
  itemId: string,
  firmId: string,
  productions: Production[],
  phpJobs: Production[],
  plateJobs: Production[],
  alreadyLoaded: Map<string, number>,
  itemAliases: string[] = [],
) {
  const source = normalizeOrderItemSource(itemSource);
  const sourceJobs = source === "PHP" ? phpJobs : source === "PLATE" ? plateJobs : productions;
  const targetItemKeys = new Set<string>();
  [itemId, ...itemAliases].forEach((value) => addKey(targetItemKeys, value));
  const targetFirm = normalizeKey(firmId);

  if (targetItemKeys.size === 0) return [];

  return sourceJobs
    .filter((production) => {
      const matchesItem = Array.from(productionItemKeys(production)).some((key) => targetItemKeys.has(key));
      if (!matchesItem) return false;

      const jobFirm = normalizeKey(getJobFirmId(production));
      if (targetFirm && jobFirm && targetFirm !== jobFirm) return false;
      if (!targetFirm && jobFirm) return false;
      if (isClosedOrTallied(production)) return false;

      const productionQty = Number(
        source === "FG" ? production.prodFromFFG || 0 : production.productionOutputQty || 0,
      );
      return Number.isFinite(productionQty) && productionQty > 0;
    })
    .map((production) => {
      const productionQty = Number(
        source === "FG" ? production.prodFromFFG || 0 : production.productionOutputQty || 0,
      );
      const loaded = alreadyLoaded.get(normalizeKey(production.id)) || 0;
      return {
        jobId: production.id,
        jobNo: getLoadingJobNumber(production),
        productionQty,
        alreadyLoaded: loaded,
        yetToLoad: Math.max(0, productionQty - loaded),
      };
    })
    .filter((job) => Boolean(job.jobNo) && job.yetToLoad > 0)
    .sort((a, b) =>
      b.jobNo.localeCompare(a.jobNo, undefined, { numeric: true, sensitivity: "base" }),
    )
    .slice(0, 3);
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
