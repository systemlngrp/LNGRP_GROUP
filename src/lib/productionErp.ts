import { Order, OrderItemSource, Production } from "../types";
import { normalizeOrderItemSource, OrderCatalogItem } from "./orderItems";

type ProductionCatalogs = Partial<Record<OrderItemSource, OrderCatalogItem[]>>;
export type ProductionItemSource = Extract<OrderItemSource, "FG" | "PHP" | "PLATE">;

const nonBlank = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
};

const itemIds = (item: OrderCatalogItem) => {
  const raw = item.raw || {};
  return [item.id, raw.id, raw.itemId, raw.npdId, raw.phpId, raw.plateId, raw.materialId]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);
};

const itemErps = (item: OrderCatalogItem) => {
  const raw = item.raw || {};
  return [item.erp, raw.erp, raw.erpCode, raw.erpItemCode, raw.masterItemNameErpCode]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);
};

const explicitSource = (value: unknown): ProductionItemSource | undefined => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return ["FG", "PHP", "PLATE"].includes(normalized)
    ? (normalized as ProductionItemSource)
    : undefined;
};

export function resolveProductionSource(
  production: Production,
  order: Partial<Order> | null | undefined,
  catalogs: ProductionCatalogs
): ProductionItemSource {
  const explicit = explicitSource(production.itemSource) || explicitSource(order?.itemSource);
  if (explicit) return explicit;

  const id = String(production.itemId || order?.itemId || "").trim().toLowerCase();
  const erps = [production.erpCode, production.masterErp, order?.erpCode]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);

  for (const source of ["PHP", "PLATE"] as const) {
    const items = catalogs[source] || [];
    if (items.some((item) => (id && itemIds(item).includes(id)) || erps.some((erp) => itemErps(item).includes(erp)))) {
      return source;
    }
  }

  const jobNo = String(production.jobCardNo || production.transactionNo || "").trim().toUpperCase();
  if (jobNo.startsWith("PHP/")) return "PHP";
  if (jobNo.startsWith("PLATE/")) return "PLATE";
  return "FG";
}

export function resolveProductionItem(
  production: Production,
  order: Partial<Order> | null | undefined,
  catalogs: ProductionCatalogs,
  source: ProductionItemSource = resolveProductionSource(production, order, catalogs)
) {
  const items = catalogs[source] || [];
  const id = String(production.itemId || order?.itemId || "").trim().toLowerCase();
  const erps = [production.erpCode, production.masterErp, order?.erpCode]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);
  const idMatches = (item: OrderCatalogItem) => Boolean(id && itemIds(item).includes(id));
  const erpMatches = (item: OrderCatalogItem) => erps.some((erp) => itemErps(item).includes(erp));

  return items.find((item) => idMatches(item) && erpMatches(item))
    || items.find(erpMatches)
    || items.find(idMatches);
}

export function resolveProductionErp(
  production: Production,
  order?: Partial<Order> | null,
  sourceItem?: Partial<OrderCatalogItem> | null,
  linkedItem?: Partial<OrderCatalogItem> | null
) {
  return nonBlank(production.erpCode, production.masterErp, order?.erpCode, sourceItem?.erp, linkedItem?.erp);
}
