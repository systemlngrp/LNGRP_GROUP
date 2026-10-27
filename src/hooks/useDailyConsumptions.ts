import { useCallback, useEffect, useRef, useState } from "react";
import { getDataAuthHeaders } from "./useData";
import { REALTIME_DATA_CHANGE_EVENT } from "./useRealtimeDataSync";

export type DailyConsumptionRow = {
  id: string;
  issueNo: string;
  consumptionTransactionNo?: string;
  firmId?: string;
  firmName?: string;
  date: string;
  issueType?: string;
  remarks?: string;
  itemCount: number;
  totalValue: number;
  itemNames?: string;
  updateTimestamp?: string;
};

export type DailyConsumptionLine = {
  id: string;
  dailyConsumptionId: string;
  materialId: string;
  materialName?: string;
  qty?: number;
  uom?: string;
  rate?: number;
  amount?: number;
};

type Options = { page: number; pageSize: number; date: string; firmId: string; search: string };

export function useDailyConsumptions({ page, pageSize, date, firmId, search }: Options) {
  const [rows, setRows] = useState<DailyConsumptionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linesById, setLinesById] = useState<Record<string, DailyConsumptionLine[]>>({});
  const [lineLoadingId, setLineLoadingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lineAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (background = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (!background) setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (date) params.set("date", date);
    if (firmId) params.set("firmId", firmId);
    if (search.trim()) params.set("search", search.trim());
    try {
      const response = await fetch(`/api/daily-consumptions?${params.toString()}`, { headers: getDataAuthHeaders(false), signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || response.statusText || "Unable to load Daily Consumption."));
      setRows(Array.isArray(body.rows) ? body.rows : []);
      setTotal(Number(body.total) || 0);
      setLinesById({});
    } catch (cause) {
      if ((cause as Error).name !== "AbortError") setError((cause as Error).message || "Unable to load Daily Consumption.");
    } finally {
      if (!background) setLoading(false);
    }
  }, [date, firmId, page, pageSize, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => { window.clearTimeout(timer); abortRef.current?.abort(); };
  }, [load]);

  useEffect(() => {
    const handler = (event: Event) => {
      const entities = (event as CustomEvent<{ entities?: string[] }>).detail?.entities || ["*"];
      if (entities.includes("*") || entities.some((entity) => ["daily_consumptions", "daily_consumption_items", "materials"].includes(String(entity)))) void load(true);
    };
    window.addEventListener(REALTIME_DATA_CHANGE_EVENT, handler);
    return () => window.removeEventListener(REALTIME_DATA_CHANGE_EVENT, handler);
  }, [load]);

  const loadLines = useCallback(async (id: string) => {
    if (linesById[id]) return linesById[id];
    lineAbortRef.current?.abort();
    const controller = new AbortController();
    lineAbortRef.current = controller;
    setLineLoadingId(id);
    try {
      const response = await fetch(`/api/daily-consumptions/${encodeURIComponent(id)}/lines`, { headers: getDataAuthHeaders(false), signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || response.statusText || "Unable to load Daily Consumption details."));
      const next = Array.isArray(body.rows) ? body.rows : [];
      setLinesById((current) => ({ ...current, [id]: next }));
      return next;
    } finally {
      if (lineAbortRef.current === controller) { lineAbortRef.current = null; setLineLoadingId(null); }
    }
  }, [linesById]);

  return { rows, total, loading, error, linesById, lineLoadingId, loadLines, refresh: () => load(false) };
}
