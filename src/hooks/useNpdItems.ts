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
