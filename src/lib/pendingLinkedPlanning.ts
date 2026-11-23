// Pending PHP / Plate Planning rows: order schedules whose PHP / Plate item still
// has quantity to plan. Shared by the page and the server (WhatsApp PDF).
import type { Company, Order, OrderItemSource, OrderSchedule, Production } from "../types";
import type { OrderCatalogItem } from "./orderItems";

export type PlanningSource = Extract<OrderItemSource, "PHP" | "PLATE">;

export type PlanningRow = {
  /** Unique per schedule and PHP / Plate item (a box can have several plates). */
  rowKey: string;
  schedule: OrderSchedule;
  order?: Order;
  company?: Company;
  fgItem?: OrderCatalogItem;
  linkedItem?: OrderCatalogItem;
  isDirectSourceOrder: boolean;
  scheduledQty: number;
  setsPerBox?: number;
  requiredQty: number;
  alreadyPlannedQty: number;
  remainingQty: number;
  selectable: boolean;
  matchStatus: string;
};

const normalizeErpCode = (value: unknown) => String(value || "").trim().toLowerCase();

function toOptionalNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}

export const round2 = (value: number) => parseFloat(value.toFixed(2));

export const getScheduledQty = (schedule: OrderSchedule) => Math.max(Number(schedule.qty || 0) - Number(schedule.canceledQty || 0), 0);

export function findItemByErp(items: OrderCatalogItem[], erpCode: string) {
  const normalizedErp = normalizeErpCode(erpCode);
  if (!normalizedErp) return undefined;
  return items.find((item) => {
    const raw = item.raw || {};
    return [item.erp, raw.erpItemCode, raw.masterItemNameErpCode].some((value) => normalizeErpCode(value) === normalizedErp);
  });
}

/** Every PHP / Plate item linked to an ERP (a box can have several, e.g. H, V and C plates). */
export function findItemsByErp(items: OrderCatalogItem[], erpCode: string) {
  const normalizedErp = normalizeErpCode(erpCode);
  if (!normalizedErp) return [];
  return items.filter((item) => {
    const raw = item.raw || {};
    return [item.erp, raw.erpItemCode, raw.masterItemNameErpCode].some((value) => normalizeErpCode(value) === normalizedErp);
  });
}

/**
 * Planned qty per schedule and item. A job counts for its own item; a job whose
 * item is not one of the schedule's linked items (older jobs) counts for the
 * schedule's first item, as before.
 */
export function plannedQtyByScheduleItem(jobRows: Production[]) {
  const byItem = new Map<string, number>();
  const unassigned = new Map<string, number>();
  jobRows.forEach((row) => {
    if (!row.scheduleId) return;
    if (row.status === "Cancelled" || row.cancelTimestamp) return;
    const effectiveQty = Math.max(0, Number(row.plannedQty || row.qty || 0));
    if (effectiveQty <= 0) return;
    const itemId = String(row.itemId || "").trim();
    const key = `${row.scheduleId}::${itemId}`;
    byItem.set(key, (byItem.get(key) || 0) + effectiveQty);
    if (!itemId) unassigned.set(row.scheduleId, (unassigned.get(row.scheduleId) || 0) + effectiveQty);
  });
  return (scheduleId: string, itemIds: string[], itemId: string) => {
    let qty = byItem.get(`${scheduleId}::${itemId}`) || 0;
    if (itemIds[0] === itemId) {
      // Jobs on items that are no longer linked, or with no item, stay on the first item.
      byItem.forEach((value, key) => {
        const [sid, iid] = [key.slice(0, key.indexOf("::")), key.slice(key.indexOf("::") + 2)];
        if (sid === scheduleId && iid && !itemIds.includes(iid)) qty += value;
      });
      qty += unassigned.get(scheduleId) || 0;
    }
    return qty;
  };
}

export const getSetsPerBox = (item?: OrderCatalogItem) => toOptionalNumber((item?.raw || {}).numberOfSetsPerBox);

/** Planned qty per schedule from the PHP / Plate job master (cancelled jobs left out). */
export function plannedQtyByScheduleId(jobRows: Production[]) {
  const map = new Map<string, number>();
  jobRows.forEach((row) => {
    if (!row.scheduleId) return;
    if (row.status === "Cancelled" || row.cancelTimestamp) return;
    const effectiveQty = Math.max(0, Number(row.plannedQty || row.qty || 0));
    if (effectiveQty <= 0) return;
    map.set(row.scheduleId, (map.get(row.scheduleId) || 0) + effectiveQty);
  });
  return map;
}

// Owner's rule: Pending Plate Planning (21-Nov-2026) and Pending PHP Planning
// (23-Nov-2026) show only schedules dated 17-Nov-2026 or later.
export const LINKED_PLANNING_FIRST_DATE = "2026-11-17";
export const PLATE_PLANNING_FIRST_DATE = LINKED_PLANNING_FIRST_DATE;
export function isScheduleInLinkedPlanningWindow(_source: PlanningSource | string, schedule: Pick<OrderSchedule, "scheduledDate">) {
  return String(schedule.scheduledDate || "").slice(0, 10) >= LINKED_PLANNING_FIRST_DATE;
}

/** Schedules that still need PHP / Plate planning: one row per schedule and linked item. */
export function computePendingLinkedPlanningRows(args: {
  source: PlanningSource;
  schedules: OrderSchedule[];
  orders: Order[];
  companies: Company[];
  jobRows: Production[];
  sourceItems: OrderCatalogItem[];
  resolveOrderItem: (order?: Order) => OrderCatalogItem | undefined;
}): PlanningRow[] {
  const { source, schedules, sourceItems } = args;
  const orderById = new Map(args.orders.map((order) => [order.id, order]));
  const companyById = new Map(args.companies.map((company) => [company.id, company]));
  const plannedFor = plannedQtyByScheduleItem(args.jobRows);
  return schedules
    .filter((schedule) => isScheduleInLinkedPlanningWindow(source, schedule))
    .flatMap((schedule) => {
      const order = orderById.get(schedule.orderId);
      const fgItem = args.resolveOrderItem(order);
      const company = order?.companyId ? companyById.get(order.companyId) : undefined;
      const scheduledQty = getScheduledQty(schedule);
      const isDirectSourceOrder = order?.itemSource === source;
      const scheduleErp = String(order?.erpCode || fgItem?.erp || "").trim();
      const linkedItems = isDirectSourceOrder
        ? sourceItems.filter((item) => item.id === String(order?.itemId || "").trim()).slice(0, 1)
        : findItemsByErp(sourceItems, scheduleErp);
      const itemIds = linkedItems.map((item) => item.id);
      return (linkedItems.length ? linkedItems : [undefined]).map((linkedItem) => {
        const setsPerBox = getSetsPerBox(linkedItem);
        const requiredQty = isDirectSourceOrder
          ? scheduledQty
          : linkedItem && setsPerBox
            ? round2(scheduledQty * setsPerBox)
            : 0;
        const alreadyPlannedQty = linkedItem ? plannedFor(schedule.id, itemIds, linkedItem.id) : 0;
        const remainingQty = Math.max(0, round2(requiredQty - alreadyPlannedQty));

        let matchStatus = "Ready";
        let selectable = true;
        if (!linkedItem) {
          matchStatus = isDirectSourceOrder ? `No ${source} item found for direct order` : `No ${source} master match for ERP`;
          selectable = false;
        } else if (!isDirectSourceOrder && !setsPerBox) {
          matchStatus = "Sets/Pcs per box missing";
          selectable = false;
        } else if (remainingQty <= 0) {
          matchStatus = "Already fully planned";
          selectable = false;
        }
        const rowKey = `${schedule.id}::${linkedItem?.id || ""}`;
        return { rowKey, schedule, order, company, fgItem, linkedItem, isDirectSourceOrder, scheduledQty, setsPerBox, requiredQty, alreadyPlannedQty, remainingQty, selectable, matchStatus };
      });
    })
    .filter((row) => {
      if (row.scheduledQty <= 0 || !row.selectable || !row.linkedItem || row.remainingQty <= 0) return false;
      return row.isDirectSourceOrder || Boolean(row.setsPerBox);
    });
}

/** Key the page's Item filter uses for a row. */
export const planningRowItemKey = (row: PlanningRow) => {
  const item = row.linkedItem || row.fgItem;
  return item?.id || `${item?.name || ""}::${item?.erp || row.order?.erpCode || ""}`;
};

export const planningRowFirmId = (row: PlanningRow) => String(row.schedule.firmId || row.order?.firmId || "");
