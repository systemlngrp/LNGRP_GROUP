import { useMemo } from "react";
import { Item } from "../types";
import { normalizeNpdItem } from "../lib/npdItems";
import { useData } from "./useData";

export function useNpdItemsWithStatus(options?: { enabled?: boolean }) {
  const [rows, , loading, { error }] = useData<Item>("npd-firm-wise", [], {
    endpointOverride: "/api/npd-firm-wise?status=all",
    cacheToLocalStorage: false,
    firmScope: "all",
    enabled: options?.enabled !== false,
  });
  const items = useMemo(() => rows.map(normalizeNpdItem), [rows]);
  return { items, rows, loading, error };
}

export function useNpdItems(options?: { enabled?: boolean }) {
  return useNpdItemsWithStatus(options).items;
}

/**
 * NPD items for name lookups only (id, name, ERP, customer, rate…), from the
 * plain NPD catalog: no stock calculation, so it loads in about a second
 * instead of waiting for the firm-wise stock. Same ids and names as
 * useNpdItems. Shares its download with the order screens' item catalog.
 */
export function useNpdItemNames(options?: { enabled?: boolean }) {
  const [rows] = useData<Item>("npd", [], {
    cacheToLocalStorage: false,
    endpointOverride: "/api/npd/catalog?status=all",
    storageKey: "npd_order_catalog",
    syncEventKey: "sync-data-npd",
    enabled: options?.enabled !== false,
  });
  return useMemo(() => rows.map(normalizeNpdItem), [rows]);
}
