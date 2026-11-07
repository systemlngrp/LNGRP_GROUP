// Paper Requirement report calculation, shared by the browser and the
// server (/api/reports/paper-requirement). Moved unchanged from
// src/pages/PaperRequirementReport.tsx so both give the same numbers.
import type {
  DispatchPlan,
  LoadingSlip,
  Material,
  MaterialIn,
  MaterialInPackingSlip,
  MaterialIssue,
  MaterialIssueReelLine,
  MaterialReturn,
  MaterialReturnReelLine,
  Order,
  OrderSchedule,
  Production,
  PurchaseOrder,
  PurchaseOrderLine,
  RapcRange,
} from "../../types";
import { getEffectiveRapcRanges } from "../rapcRanges";
import { buildReelStockRows } from "../reelStock";
import type { OrderCatalogItem } from "../orderItems";
import { calculateInternalRapc, calculateInternalUps } from "../internalUps";
import { calculateProductionTakeUpFactor } from "../productionCalculations";

export type NetFilter =
  | "All"
  | "Positive (>100)"
  | "Negative (< -100)"
  | "All Positive"
  | "All Negative"
  | "Below 100 Absolute"
  | "Above 100 Absolute"
  | "Zero Inputs + Net > 0";
export type GroupTypeFilter = "All" | "Positive" | "Negative";
export type ChartLimit = "All" | "Top 15" | "Top 30" | "Top 50";
export type RapcGroup = number | "Unmapped";

export type GroupKey = { rapcRange: RapcGroup; gsm: number };

export type ReportRow = GroupKey & {
  totalPaperRequirement: number;
  totalClosingStock: number;
  totalPendingPo: number;
  mil: number;
  netPaperToOrder: number;
  consumption: number;
};

export type Summary = Omit<ReportRow, "rapcRange" | "gsm">;
export type RangeGsmOption = { value: string; label: string };

export const NET_FILTER_OPTIONS: NetFilter[] = ["All", "Positive (>100)", "Negative (< -100)", "All Positive", "All Negative", "Below 100 Absolute", "Above 100 Absolute", "Zero Inputs + Net > 0"];
export const GROUP_TYPE_OPTIONS: GroupTypeFilter[] = ["All", "Positive", "Negative"];
export const CHART_LIMIT_OPTIONS: ChartLimit[] = ["All", "Top 15", "Top 30", "Top 50"];
export const KG_CONVERSION_FACTOR = 1000000000;

export function parseAppDate(value?: string | null) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const onlyDate = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(onlyDate)) {
    const [year, month, day] = onlyDate.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function toDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function round2(value: number) {
  return Number(Number(value || 0).toFixed(2));
}

export function formatQty(value: number) {
  return round2(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function makeKey(rapcRange: RapcGroup, gsm: number) {
  return `${rapcRange}__${gsm}`;
}

export function parseKey(key: string): GroupKey {
  const [rapcRangeRaw, gsmRaw] = key.split("__");
  return { rapcRange: rapcRangeRaw === "Unmapped" ? "Unmapped" : Number(rapcRangeRaw || 0), gsm: Number(gsmRaw || 0) };
}

export function getRangeGsmLabel(row: GroupKey) {
  return `${row.rapcRange} - ${row.gsm}`;
}

export function resolveRapcValue(input: number, ranges: RapcRange[]): RapcGroup {
  if (!Number.isFinite(input) || input <= 0) return "Unmapped";
  const match = getEffectiveRapcRanges(ranges).find((row) => input >= Number(row.from || 0) && input <= Number(row.to || 0));
  return match ? Number(match.rapcRange || 0) : "Unmapped";
}

export function getMaterialRapcInput(material?: Material | null) {
  const rapc = Number((material as any)?.rapc || 0);
  if (rapc > 0) return rapc;
  const size = Number(material?.size || 0);
  return size > 0 ? size * 10 : 0;
}

export function addToMap(map: Map<string, number>, row: GroupKey, qty: number) {
  if (!row.gsm || !Number.isFinite(row.gsm) || !Number.isFinite(qty) || qty === 0) return;
  const key = makeKey(row.rapcRange, row.gsm);
  map.set(key, (map.get(key) || 0) + qty);
}

export function firstPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}

export function getRawValue(item: OrderCatalogItem | undefined, key: string) {
  return item?.raw?.[key] ?? (item as any)?.[key];
}

export function getItemNumber(item: OrderCatalogItem | undefined, ...keys: string[]) {
  return firstPositiveNumber(...keys.map((key) => getRawValue(item, key)));
}

export function getItemText(item: OrderCatalogItem | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = String(getRawValue(item, key) ?? "").trim();
    if (value) return value;
  }
  return "";
}

export function getFgInternalRapc(item: OrderCatalogItem | undefined) {
  if (item?.source !== "FG") return 0;
  const raw = item.raw || {};
  return firstPositiveNumber(getItemNumber(item, "internalRapc"), calculateInternalRapc(raw));
}

export function getFgInternalUps(item: OrderCatalogItem | undefined) {
  if (item?.source !== "FG") return 0;
  return firstPositiveNumber(getItemNumber(item, "internalUps"), calculateInternalUps(getRawValue(item, "rapcForSingleBox")));
}

export function buildLeastCostByErp(productions: Production[]) {
  const map = new Map<string, Production>();
  productions.forEach((production) => {
    if (production.status === "Cancelled" || production.cancelTimestamp) return;
    const erp = String(production.erpCode || production.masterErp || "").trim().toLowerCase();
    const gsm = Number(production.gsm || 0);
    if (!erp || !Number.isFinite(gsm) || gsm <= 0) return;
    const current = map.get(erp);
    if (!current || gsm < Number(current.gsm || 0)) map.set(erp, production);
  });
  return map;
}

export function calculateLayerWeightKg(args: { cuttingSize: number; rapc: number; gsm: number; ups: number; takeUpFactor?: number }) {
  const { cuttingSize, rapc, gsm, ups } = args;
  if (cuttingSize <= 0 || rapc <= 0 || gsm <= 0 || ups <= 0) return 0;
  const factor = args.takeUpFactor && args.takeUpFactor > 0 ? args.takeUpFactor : 1;
  return (cuttingSize * rapc * gsm * factor) / (KG_CONVERSION_FACTOR * ups);
}

export function passesNetFilter(row: ReportRow, filter: NetFilter) {
  const net = row.netPaperToOrder;
  const absoluteNet = Math.abs(net);
  if (filter === "Positive (>100)") return net > 100;
  if (filter === "Negative (< -100)") return net < -100;
  if (filter === "All Positive") return net > 0;
  if (filter === "All Negative") return net < 0;
  if (filter === "Below 100 Absolute") return absoluteNet < 100;
  if (filter === "Above 100 Absolute") return absoluteNet > 100;
  if (filter === "Zero Inputs + Net > 0") {
    return net > 0 && [row.totalPaperRequirement, row.totalClosingStock, row.totalPendingPo, row.mil].some((value) => round2(value) === 0);
  }
  return true;
}

export function passesGroupType(row: ReportRow, filter: GroupTypeFilter) {
  if (filter === "Positive") return row.netPaperToOrder > 0;
  if (filter === "Negative") return row.netPaperToOrder < 0;
  return true;
}

export function summarizeRows(rows: ReportRow[]): Summary {
  return rows.reduce(
    (acc, row) => ({
      totalPaperRequirement: acc.totalPaperRequirement + row.totalPaperRequirement,
      totalClosingStock: acc.totalClosingStock + row.totalClosingStock,
      totalPendingPo: acc.totalPendingPo + row.totalPendingPo,
      mil: acc.mil + row.mil,
      netPaperToOrder: acc.netPaperToOrder + row.netPaperToOrder,
      consumption: acc.consumption + row.consumption,
    }),
    { totalPaperRequirement: 0, totalClosingStock: 0, totalPendingPo: 0, mil: 0, netPaperToOrder: 0, consumption: 0 }
  );
}

export function getChartLimitCount(limit: ChartLimit) {
  if (limit === "Top 15") return 15;
  if (limit === "Top 50") return 50;
  if (limit === "Top 30") return 30;
  return Infinity;
}


export type PaperRequirementLists = {
  productions: Production[];
  orders: Order[];
  schedules: OrderSchedule[];
  dispatchPlans: DispatchPlan[];
  loadingSlips: LoadingSlip[];
  materials: Material[];
  materialIn: MaterialIn[];
  packingSlips: MaterialInPackingSlip[];
  issueEntries: MaterialIssue[];
  issueReelLines: MaterialIssueReelLine[];
  returnEntries: MaterialReturn[];
  returnReelLines: MaterialReturnReelLine[];
  purchaseOrders: PurchaseOrder[];
  purchaseOrderLines: PurchaseOrderLine[];
  rapcRanges: RapcRange[];
};

export function computePaperRequirement(
  lists: PaperRequirementLists,
  options: { uptoDate: string; resolveOrderItem: (order?: Order | null) => OrderCatalogItem | undefined }
): ReportRow[] {
  const {
    productions, orders, schedules, dispatchPlans, loadingSlips, materials, materialIn, packingSlips,
    issueEntries, issueReelLines, returnEntries, returnReelLines, purchaseOrders, purchaseOrderLines, rapcRanges,
  } = lists;
  const { resolveOrderItem } = options;
  const parsedUpto = parseAppDate(options.uptoDate);
  const filteredTimestamp = parsedUpto ? normalizeDate(parsedUpto).getTime() : normalizeDate(new Date()).getTime();
    const effectiveRanges = getEffectiveRapcRanges(rapcRanges);
    const orderMap = new Map(orders.map((order) => [order.id, order]));
    const materialMap = new Map(materials.map((material) => [material.id, material]));
    const issueMap = new Map(issueEntries.map((entry) => [entry.id, entry]));
    const returnMap = new Map(returnEntries.map((entry) => [entry.id, entry]));
    const leastCostByErp = buildLeastCostByErp(productions);

    const invoicedQtyBySchedule = new Map<string, number>();
    const plansById = new Map(dispatchPlans.map((plan) => [plan.id, plan]));
    loadingSlips.forEach((slip) => {
      if (!slip.invoiceId) return;
      (slip.lines || []).forEach((line) => {
        const scheduleId = plansById.get(line.dispatchPlanId)?.scheduleId;
        if (!scheduleId) return;
        invoicedQtyBySchedule.set(scheduleId, (invoicedQtyBySchedule.get(scheduleId) || 0) + Number(line.loadedQty || 0));
      });
    });

    const requirementByKey = new Map<string, number>();
    schedules.forEach((schedule) => {
      const scheduledDate = parseAppDate(schedule.scheduledDate);
      if (!scheduledDate || normalizeDate(scheduledDate).getTime() > filteredTimestamp) return;

      const order = orderMap.get(schedule.orderId);
      if (!order || order.status === "Cancelled") return;
      const pendingQty = Math.max(0, Number(schedule.qty || 0) - Number(schedule.canceledQty || 0) - Number(invoicedQtyBySchedule.get(schedule.id) || 0));
      if (pendingQty <= 0) return;

      const item = resolveOrderItem(order);
      const erp = String(order.erpCode || item?.erp || "").trim().toLowerCase();
      const leastCost = erp ? leastCostByErp.get(erp) : undefined;
      const rapc = firstPositiveNumber(getFgInternalRapc(item), getItemNumber(item, "rapc", "rapcForSingleBox"));
      const rapcRange = resolveRapcValue(rapc, effectiveRanges);
      const cuttingSize = firstPositiveNumber(getItemNumber(item, "cuttingSize", "cuttingWithTrimming", "cuttingSizeLengthPiece"), leastCost?.cuttingWithTrimming);
      const ups = firstPositiveNumber(getFgInternalUps(item), getItemNumber(item, "ups", "noOfUps", "noOfUpsForRapc"));
      const takeUpFactor = calculateProductionTakeUpFactor(getItemText(item, "flute", "fluteType"));
      const layers = [
        { gsm: firstPositiveNumber(leastCost?.l1, getItemNumber(item, "l1", "top")), isFlute: false },
        { gsm: firstPositiveNumber(leastCost?.f1, getItemNumber(item, "f1")), isFlute: true },
        { gsm: firstPositiveNumber(leastCost?.l2, getItemNumber(item, "l2")), isFlute: false },
        { gsm: firstPositiveNumber(leastCost?.f2, getItemNumber(item, "f2")), isFlute: true },
        { gsm: firstPositiveNumber(leastCost?.l3, getItemNumber(item, "l3")), isFlute: false },
      ];

      layers.forEach((layer) => {
        const weightPerItem = calculateLayerWeightKg({ cuttingSize, rapc, gsm: layer.gsm, ups, takeUpFactor: layer.isFlute ? takeUpFactor : 1 });
        addToMap(requirementByKey, { rapcRange, gsm: layer.gsm }, weightPerItem * pendingQty);
      });
    });
    const stockByKey = new Map<string, number>();
    buildReelStockRows({
      materials,
      materialIn,
      packingSlips,
      issueReelLines,
      returnReelLines,
      includeMaterialIn: (entry) => {
        const entryDate = parseAppDate(entry.date || entry.timestamp);
        return Boolean(entryDate && normalizeDate(entryDate).getTime() <= filteredTimestamp);
      },
      includeIssueLine: (line) => {
        const issueDate = parseAppDate(issueMap.get(line.materialIssueId)?.date);
        return Boolean(issueDate && normalizeDate(issueDate).getTime() <= filteredTimestamp);
      },
      includeReturnLine: (line) => {
        const returnDate = parseAppDate(returnMap.get(line.materialReturnId)?.date);
        return Boolean(returnDate && normalizeDate(returnDate).getTime() <= filteredTimestamp);
      },
    })
      .filter((row) => row.availableWeight > 0)
      .forEach((row) => {
        const material = materialMap.get(row.materialId);
        addToMap(stockByKey, { rapcRange: resolveRapcValue(getMaterialRapcInput(material), effectiveRanges), gsm: Number(material?.gsm || 0) }, row.availableWeight);
      });

    const receivedByPoLine = new Map<string, number>();
    materialIn
      .filter((entry) => {
        const entryDate = parseAppDate(entry.date || entry.timestamp);
        return Boolean(entryDate && normalizeDate(entryDate).getTime() <= filteredTimestamp);
      })
      .forEach((entry) => {
        (entry.lines || []).forEach((line) => {
          if (!line.poLineId) return;
          receivedByPoLine.set(line.poLineId, (receivedByPoLine.get(line.poLineId) || 0) + Number(line.actualQty ?? line.qty ?? 0));
        });
      });

    const poMap = new Map(purchaseOrders.map((order) => [order.id, order]));
    const pendingPoByKey = new Map<string, number>();
    purchaseOrderLines.forEach((line) => {
      const po = poMap.get(line.purchaseOrderId);
      const poDate = parseAppDate(po?.poDate);
      if (!po || po.status !== "Approved" || !poDate || normalizeDate(poDate).getTime() > filteredTimestamp) return;
      const material = materialMap.get(line.materialId);
      if (!material || material.type !== "Reel") return;
      const pendingQty = Math.max(0, Number(line.qty || 0) - Number(receivedByPoLine.get(line.id) || 0) - Number(line.cancelledQty || 0));
      if (pendingQty <= 0) return;
      addToMap(pendingPoByKey, { rapcRange: resolveRapcValue(getMaterialRapcInput(material), effectiveRanges), gsm: Number(material.gsm || 0) }, pendingQty);
    });

    const consumptionByKey = new Map<string, number>();
    issueReelLines.forEach((line) => {
      const issueDate = parseAppDate(issueMap.get(line.materialIssueId)?.date);
      if (!issueDate || normalizeDate(issueDate).getTime() > filteredTimestamp) return;
      const material = materialMap.get(line.materialId);
      if (!material || material.type !== "Reel") return;
      addToMap(consumptionByKey, { rapcRange: resolveRapcValue(getMaterialRapcInput(material), effectiveRanges), gsm: Number(material.gsm || 0) }, Number(line.weightKg || 0));
    });
    returnReelLines.forEach((line) => {
      const returnDate = parseAppDate(returnMap.get(line.materialReturnId)?.date);
      if (!returnDate || normalizeDate(returnDate).getTime() > filteredTimestamp) return;
      const material = materialMap.get(line.materialId);
      if (!material || material.type !== "Reel") return;
      addToMap(consumptionByKey, { rapcRange: resolveRapcValue(getMaterialRapcInput(material), effectiveRanges), gsm: Number(material.gsm || 0) }, -Number(line.weightKg || 0));
    });

    const allKeys = new Set<string>([
      ...Array.from(requirementByKey.keys()),
      ...Array.from(stockByKey.keys()),
      ...Array.from(pendingPoByKey.keys()),
      ...Array.from(consumptionByKey.keys()),
    ]);

    return Array.from(allKeys)
      .map((key) => {
        const { rapcRange, gsm } = parseKey(key);
        const totalPaperRequirement = round2(requirementByKey.get(key) || 0);
        const totalClosingStock = round2(stockByKey.get(key) || 0);
        const totalPendingPo = round2(pendingPoByKey.get(key) || 0);
        const consumption = round2(Math.max(0, consumptionByKey.get(key) || 0));
        const mil = round2((consumption * 7) / 90);
        const calculatedNetPaperToOrder = totalClosingStock > mil
          ? round2(totalPaperRequirement - totalClosingStock - totalPendingPo)
          : round2((mil - totalClosingStock) + (totalPaperRequirement - totalClosingStock - totalPendingPo));
        const netPaperToOrder = Math.max(0, calculatedNetPaperToOrder);
        return { rapcRange, gsm, totalPaperRequirement, totalClosingStock, totalPendingPo, mil, netPaperToOrder, consumption };
      })
      .filter((row) => row.gsm > 0)
      .sort((a, b) => {
        if (a.rapcRange === "Unmapped" && b.rapcRange !== "Unmapped") return 1;
        if (a.rapcRange !== "Unmapped" && b.rapcRange === "Unmapped") return -1;
        return Number(a.rapcRange) - Number(b.rapcRange) || a.gsm - b.gsm;
      });
}
