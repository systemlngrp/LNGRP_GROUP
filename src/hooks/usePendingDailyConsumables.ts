import { useCallback, useEffect, useRef, useState } from "react";
import { getDataAuthHeaders } from "./useData";
import { useAutoRefreshEffect } from "./useAutoRefresh";
import { REALTIME_DATA_CHANGE_EVENT } from "./useRealtimeDataSync";
import type { DailyConsumablePending } from "../lib/dailyConsumables";

export type PendingDailyPage = {
  rows: Array<DailyConsumablePending & { id: string }>;
  total: number;
  page: number;
  pageSize: number;
};

type Options = { page: number; pageSize: number; search: string; firmId: string };

export function usePendingDailyConsumables({ page, pageSize, search, firmId }: Options) {
  const [result, setResult] = useState<PendingDailyPage>({ rows: [], total: 0, page, pageSize });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (background = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++generationRef.current;
    if (!background) setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) params.set("search", search.trim());
    if (firmId) params.set("firmId", firmId);
    try {
      const response = await fetch(`/api/material-issues/pending-daily?${params.toString()}`, {
        headers: getDataAuthHeaders(false),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || response.statusText || "Unable to load pending Daily Consumables."));
      if (generation !== generationRef.current) return;
      setResult({
        rows: Array.isArray(body.rows) ? body.rows : [],
        total: Number(body.total) || 0,
        page: Number(body.page) || page,
        pageSize: Number(body.pageSize) || pageSize,
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError" && generation === generationRef.current) {
        setError((err as Error).message || "Unable to load pending Daily Consumables.");
      }
    } finally {
      if (generation === generationRef.current && !background) setLoading(false);
    }
  }, [firmId, page, pageSize, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 300);
    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    const handleRealtime = (event: Event) => {
      const entities = (event as CustomEvent<{ entities?: string[] }>).detail?.entities || ["*"];
      if (entities.includes("*") || entities.some((entity) => ["material-issues", "productions", "orders", "orders-schedule"].includes(String(entity)))) {
        void load(true);
      }
    };
    window.addEventListener(REALTIME_DATA_CHANGE_EVENT, handleRealtime);
    return () => window.removeEventListener(REALTIME_DATA_CHANGE_EVENT, handleRealtime);
  }, [load]);

  useAutoRefreshEffect(() => void load(true));

  return { ...result, loading, error, refresh: () => load(false) };
}
