import { useCallback, useEffect, useState } from "react";
import { getDataAuthHeaders } from "./useData";
import { useAutoRefreshEffect } from "./useAutoRefresh";
import { REALTIME_DATA_CHANGE_EVENT } from "./useRealtimeDataSync";

type PendingTaskCountsResponse = {
  counts: Record<string, number>;
  generatedAt: string;
};

const CACHE_TTL_MS = 20_000;
let cached: { expiresAt: number; value: PendingTaskCountsResponse } | null = null;
let inflight: Promise<PendingTaskCountsResponse> | null = null;

async function requestCounts(force = false) {
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  if (!inflight) {
    const headers = getDataAuthHeaders(false);
    inflight = fetch("/api/sidebar/pending-counts", { headers })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(body?.error || `Failed to load sidebar counts (${response.status})`));
        const value: PendingTaskCountsResponse = {
          counts: body?.counts && typeof body.counts === "object" ? body.counts : {},
          generatedAt: String(body?.generatedAt || new Date().toISOString()),
        };
        cached = { expiresAt: Date.now() + CACHE_TTL_MS, value };
        return value;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function usePendingTaskCounts() {
  const [counts, setCounts] = useState<Record<string, number>>(() => cached?.value.counts || {});
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    try {
      if (!force && cached && cached.expiresAt > Date.now()) {
        setCounts(cached.value.counts);
        setLoading(false);
        return;
      }
      setLoading((current) => current && !cached);
      const value = await requestCounts(force);
      setCounts(value.counts);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load sidebar counts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handleRealtime = () => void refresh(true);
    window.addEventListener(REALTIME_DATA_CHANGE_EVENT, handleRealtime);
    return () => window.removeEventListener(REALTIME_DATA_CHANGE_EVENT, handleRealtime);
  }, [refresh]);

  useAutoRefreshEffect(() => {
    void refresh();
  });

  return { counts, loading, error, refresh };
}
