import { useMemo } from "react";
import { Item } from "../types";
import { normalizeNpdItem } from "../lib/npdItems";
import { useData } from "./useData";

export function useNpdItemsWithStatus() {
  const [rows, , loading, { error }] = useData<Item>("npd-firm-wise", [], {
    endpointOverride: "/api/npd-firm-wise?status=all",
    cacheToLocalStorage: false,
    firmScope: "all",
  });
  const items = useMemo(() => rows.map(normalizeNpdItem), [rows]);
  return { items, loading, error };
}

export function useNpdItems() {
  return useNpdItemsWithStatus().items;
}
