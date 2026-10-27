import { useCallback, useEffect, useRef, useState } from "react";
import { getDataAuthHeaders } from "./useData";
import { useAutoRefreshEffect } from "./useAutoRefresh";
import { REALTIME_DATA_CHANGE_EVENT } from "./useRealtimeDataSync";

export type PendingTallyRow = {
  id: string;
  firmId?: string | null;
  firmName?: string | null;
  issueNo?: string;
  consumptionTransactionNo?: string;
  date?: string;
  tallyPostingStatus?: string;
  tallyPostingRemark?: string;
  tallyPostingError?: string;
  remarks?: string;
  itemCount: number;
  totalValue: number;
  itemNames?: string;
};

export type PendingTallyLine = {
  id: string;
  materialIssueId: string;
  materialId: string;
  materialName?: string;
  qty?: number;
  uom?: string;
  rate?: number;
  amount?: number;
};

type Options = { page: number; pageSize: number; search: string };

export function usePendingConsumptionTally({ page, pageSize, search }: Options) {
  const [rows, setRows] = useState<PendingTallyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linesByIssueId, setLinesByIssueId] = useState<Record<string, PendingTallyLine[]>>({});
  const [lineLoadingId, setLineLoadingId] = useState<string | null>(null);
  const listAbortRef = useRef<AbortController | null>(null);
  const lineAbortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const load = useCallback(async (background = false) => {
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    const generation = ++generationRef.current;
    if (!background) setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) params.set("search", search.trim());
    try {
      const response = await fetch(`/api/material-issues/pending-tally?${params.toString()}`, {
        headers: getDataAuthHeaders(false),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || response.statusText || "Unable to load pending Consumption Tally posting."));
      if (generation !== generationRef.current) return;
      setRows(Array.isArray(body.rows) ? body.rows : []);
      setTotal(Number(body.total) || 0);
      setLinesByIssueId({});
    } catch (cause) {
      if ((cause as Error).name !== "AbortError" && generation === generationRef.current) {
        setError((cause as Error).message || "Unable to load pending Consumption Tally posting.");
      }
    } finally {
      if (generation === generationRef.current && !background) setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 300);
    return () => {
      window.clearTimeout(timer);
      listAbortRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    const handleRealtime = (event: Event) => {
      const entities = (event as CustomEvent<{ entities?: string[] }>).detail?.entities || ["*"];
      if (entities.includes("*") || entities.some((entity) => ["material-issues", "material-issue-lines", "material-issue-reel-lines", "materials"].includes(String(entity)))) {
        void load(true);
      }
    };
    window.addEventListener(REALTIME_DATA_CHANGE_EVENT, handleRealtime);
    return () => window.removeEventListener(REALTIME_DATA_CHANGE_EVENT, handleRealtime);
  }, [load]);

  useAutoRefreshEffect(() => void load(true));

  const loadLines = useCallback(async (issueId: string) => {
    if (linesByIssueId[issueId]) return linesByIssueId[issueId];
    lineAbortRef.current?.abort();
    const controller = new AbortController();
    lineAbortRef.current = controller;
    setLineLoadingId(issueId);
    try {
      const response = await fetch(`/api/material-issues/pending-tally/${encodeURIComponent(issueId)}/lines`, {
        headers: getDataAuthHeaders(false),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || response.statusText || "Unable to load Consumption Tally details."));
      const nextLines = Array.isArray(body.rows) ? body.rows : [];
      setLinesByIssueId((current) => ({ ...current, [issueId]: nextLines }));
      return nextLines;
    } finally {
      if (lineAbortRef.current === controller) {
        lineAbortRef.current = null;
        setLineLoadingId(null);
      }
    }
  }, [linesByIssueId]);

  const deletePending = useCallback(async (issueId: string) => {
    const response = await fetch(`/api/material-issues/pending-tally/${encodeURIComponent(issueId)}`, {
      method: "DELETE",
      headers: getDataAuthHeaders(false),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(body?.error || response.statusText || "Failed to delete Daily Consumption."));
    await load(false);
  }, [load]);

  return { rows, total, loading, error, linesByIssueId, lineLoadingId, loadLines, deletePending, refresh: () => load(false) };
}
