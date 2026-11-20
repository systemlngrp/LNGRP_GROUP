// Pending PHP / Plate Planning rows: order schedules whose PHP / Plate item still
// has quantity to plan. Shared by the page and the server (WhatsApp PDF).
import type { Company, Order, OrderItemSource, OrderSchedule, Production } from "../types";
import type { OrderCatalogItem } from "./orderItems";

export type PlanningSource = Extract<OrderItemSource, "PHP" | "PLATE">;

export type PlanningRow = {
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

/** Schedules that still need PHP / Plate planning (only rows that can be planned). */
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
  const planned = plannedQtyByScheduleId(args.jobRows);
  return schedules
    .map((schedule) => {
      const order = orderById.get(schedule.orderId);
      const fgItem = args.resolveOrderItem(order);
      const company = order?.companyId ? companyById.get(order.companyId) : undefined;
      const scheduledQty = getScheduledQty(schedule);
      const isDirectSourceOrder = order?.itemSource === source;
      const scheduleErp = String(order?.erpCode || fgItem?.erp || "").trim();
      const linkedItem = isDirectSourceOrder
        ? sourceItems.find((item) => item.id === String(order?.itemId || "").trim())
        : findItemByErp(sourceItems, scheduleErp);
      const setsPerBox = getSetsPerBox(linkedItem);
      const requiredQty = isDirectSourceOrder
        ? scheduledQty
        : linkedItem && setsPerBox
          ? round2(scheduledQty * setsPerBox)
          : 0;
      const alreadyPlannedQty = Number(planned.get(schedule.id) || 0);
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
      return { schedule, order, company, fgItem, linkedItem, isDirectSourceOrder, scheduledQty, setsPerBox, requiredQty, alreadyPlannedQty, remainingQty, selectable, matchStatus };
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
