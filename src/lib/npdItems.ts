import { Item } from "../types";
import { calculateInternalRapc, calculateInternalUps } from "./internalUps";
import { loadCollection } from "./collectionLoader";


export function normalizeConsumableValue(raw: unknown) {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw === 1;

  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) return false;

  const truthy = new Set(["1", "true", "yes", "y", "on"]);
  return truthy.has(normalized);
}
export function getNpdItemDisplayName(item?: Partial<Item> | null) {
  return String(item?.name || (item as any)?.itemName || item?.erp || "").trim();
}

export function normalizeNpdItem(row: any): Item {
  const resolvedId = String(row?.id || row?.npdId || row?.itemId || "").trim();
  return {
    ...row,
    id: resolvedId,
    consumable: normalizeConsumableValue(row?.consumable),
    internalUps: calculateInternalUps(row?.rapcForSingleBox),
    internalRapc: row?.internalRapc ?? calculateInternalRapc(row),
    itemId: resolvedId,
    npdId: resolvedId,
    name: getNpdItemDisplayName(row),
  };
}

export async function fetchNpdItems(): Promise<Item[]> {
  const token = window.localStorage.getItem("authToken") || "";
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  // Firm-wise stock is required by cross-firm loading and remains compatible
  // with the normal NPD row shape because the endpoint returns the base row
  // plus firmStocks.
  const task = loadCollection<any>("/api/npd-firm-wise?status=all", headers, "page", () => {});
  try {
    return (await task.promise).map(normalizeNpdItem);
  } finally {
    task.unsubscribe();
  }
}

