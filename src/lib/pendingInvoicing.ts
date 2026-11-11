import type { DispatchPlan, InvoiceLineItem, LoadingSlip, Order } from "../types";
import { normalizeOrderItemSource } from "./orderItems";

type CatalogItem = { id?: string | number } | undefined;

export type PendingInvoicingContext = {
  planById: Map<string, DispatchPlan>;
  orderById: Map<string, Order>;
  lineItemsBySlipId: Map<string, InvoiceLineItem[]>;
  findItemAcrossSources?: (itemId: string, source?: string, erpCode?: string | number) => CatalogItem;
  resolveOrderItem?: (order?: Order) => CatalogItem;
};

const roundMoney = (value: number) => {
  const numeric = Number(value) || 0;
  return (numeric < 0 ? -1 : 1) * Math.round((Math.abs(numeric) + 1e-9) * 100) / 100;
};

function firstById<T extends { id: string }>(rows: T[]) {
  const map = new Map<string, T>();
  rows.forEach((row) => { if (!map.has(row.id)) map.set(row.id, row); });
  return map;
}

export function buildPendingInvoicingContext(args: {
  plans: DispatchPlan[];
  orders: Order[];
  invoiceLineItems: InvoiceLineItem[];
  findItemAcrossSources?: PendingInvoicingContext["findItemAcrossSources"];
  resolveOrderItem?: PendingInvoicingContext["resolveOrderItem"];
}): PendingInvoicingContext {
  const lineItemsBySlipId = new Map<string, InvoiceLineItem[]>();
  args.invoiceLineItems.forEach((line) => {
    const key = String(line.loadingSlipId || "").trim();
    const list = lineItemsBySlipId.get(key);
    if (list) list.push(line);
    else lineItemsBySlipId.set(key, [line]);
  });
  return {
    planById: firstById(args.plans),
    orderById: firstById(args.orders),
    lineItemsBySlipId,
    findItemAcrossSources: args.findItemAcrossSources,
    resolveOrderItem: args.resolveOrderItem,
  };
}

export function resolvePendingInvoicingLineItem(ctx: PendingInvoicingContext, line: LoadingSlip["lines"][number], order?: Order) {
  const itemSource = normalizeOrderItemSource(line.itemSource || order?.itemSource || "FG");
  const directItemId = String(line.itemId || order?.itemId || "").trim();
  const directErp = String(line.erpCode || line.masterErp || order?.erpCode || "").trim();
  return ctx.findItemAcrossSources?.(directItemId, itemSource, directErp) || ctx.resolveOrderItem?.(order) || undefined;
}

export function getPendingInvoicingLineKey(ctx: PendingInvoicingContext, line: LoadingSlip["lines"][number], order?: Order) {
  const itemSource = normalizeOrderItemSource(line.itemSource || order?.itemSource || "FG");
  const resolvedItem = resolvePendingInvoicingLineItem(ctx, line, order);
  const itemId = String(resolvedItem?.id || line.itemId || order?.itemId || "").trim();
  return itemId ? `${itemSource}::${itemId}` : "";
}

/**
 * The part of a loading slip still to be invoiced (Pending Invoicing):
 * loaded qty per item less what invoice lines already billed for the slip.
 * Returns null when nothing is left. Shared by the Pending Invoicing page and
 * the dashboard count so both use the same rule.
 */
export function getPendingInvoicingSlip(ctx: PendingInvoicingContext, slip: LoadingSlip, includeInvoiceId = "") {
  if (slip.status === "Cancelled") return null;

  const relevantLineItems = (ctx.lineItemsBySlipId.get(slip.id) || []).filter(
    (line) => !includeInvoiceId || String(line.invoiceId || "").trim() !== includeInvoiceId
  );

  if (slip.invoiceId && relevantLineItems.length === 0 && !includeInvoiceId) return null;

  const billedByLineKey = new Map<string, number>();
  relevantLineItems.forEach((line) => {
    const itemSource = normalizeOrderItemSource(line.itemSource || "FG");
    const itemId = String(line.npdId || line.itemId || "").trim();
    if (!itemId) return;
    const key = `${itemSource}::${itemId}`;
    billedByLineKey.set(key, (billedByLineKey.get(key) || 0) + Number(line.qty || 0));
  });

  const pendingLines = (slip.lines || [])
    .map((line: any) => {
      const plan = ctx.planById.get(line.dispatchPlanId);
      const order = ctx.orderById.get(plan?.orderId as string);
      const lineKey = getPendingInvoicingLineKey(ctx, line, order);
      if (!lineKey) return null;

      const loadedQty = Number(line.loadedQty || 0);
      const billedQty = Math.min(loadedQty, Math.max(0, billedByLineKey.get(lineKey) || 0));
      billedByLineKey.set(lineKey, Math.max(0, (billedByLineKey.get(lineKey) || 0) - billedQty));

      const pendingQty = roundMoney(loadedQty - billedQty);
      if (pendingQty <= 0.0001) return null;
      return { ...line, loadedQty: pendingQty };
    })
    .filter(Boolean);

  if (pendingLines.length === 0) return null;
  return { ...slip, lines: pendingLines } as LoadingSlip;
}
