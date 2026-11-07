import { useCallback, useEffect, useRef, useState } from "react";
import { getDataAuthHeaders } from "./useData";
import { realtimeChangeAffects } from "../lib/collectionLoader";
import { REALTIME_DATA_CHANGE_EVENT } from "./useRealtimeDataSync";
import { useTrackPageLoading } from "../components/DataLoadingBoundary";

/**
 * Runs a report on the server (/api/reports/<name>) and returns only its
 * result, instead of downloading every table into the browser. Re-runs when the
 * parameters change or when one of the report's tables changes.
 *
 * `failed` is true when the server cannot run the report (older server build,
 * error); the page then falls back to computing in the browser.
 */
export function useServerReport<T>(name: string, params: Record<string, unknown>, tables: string[], enabled = true) {
  const [result, setResult] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestRef = useRef(0);
  const paramsKey = JSON.stringify(params);
  const tablesRef = useRef(tables);
  tablesRef.current = tables;

  const run = useCallback(async () => {
    // The server answers 202 while it is still building the report (first
    // build after a restart can take a few minutes); keep asking until it is ready.
    const deadline = Date.now() + 10 * 60_000;
    for (;;) {
      const response = await fetch(`/api/reports/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getDataAuthHeaders(true) },
        body: paramsKey,
      });
      if (response.status === 202 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
      if (!response.ok) throw new Error(`Report ${name} failed (${response.status})`);
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) throw new Error(`Report ${name} returned a non-JSON response`);
      const payload = await response.json();
      return payload?.result as T;
    }
  }, [name, paramsKey]);

  useEffect(() => {
    if (!enabled || failed) return;
    const requestId = ++requestRef.current;
    if (refreshKey === 0 || result === null) setLoading(true);
    run()
      .then((value) => {
        if (requestId !== requestRef.current) return;
        setResult(value);
        setLoading(false);
      })
      .catch((error) => {
        if (requestId !== requestRef.current) return;
        console.warn(`[useServerReport:${name}] falling back to browser calculation`, error);
        setFailed(true);
        setLoading(false);
      });
    // result is intentionally not a dependency: it only decides spinner vs background refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, failed, run, refreshKey, name]);

  useEffect(() => {
    if (!enabled || failed) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handleChange = (event: Event) => {
      const entities = (event as CustomEvent<{ entities?: string[] }>).detail?.entities || ["*"];
      if (!realtimeChangeAffects(entities, tablesRef.current)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRefreshKey((key) => key + 1), 1500);
    };
    window.addEventListener(REALTIME_DATA_CHANGE_EVENT, handleChange);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(REALTIME_DATA_CHANGE_EVENT, handleChange);
    };
  }, [enabled, failed]);

  // Centred loading card while the server calculates (first build after a
  // restart can take a while, so say so after 20 s).
  const [startedAt] = useState(() => Date.now());
  const [, setTick] = useState(0);
  const showLoader = enabled && loading && !failed;
  useEffect(() => {
    if (!showLoader) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [showLoader]);
  const waited = Math.round((Date.now() - startedAt) / 1000);
  useTrackPageLoading(
    showLoader,
    null,
    () => setRefreshKey((key) => key + 1),
    0,
    null,
    "Calculating report…",
    waited >= 20 ? `${waited}s — the first load after a server restart can take a few minutes` : undefined,
  );

  return { result, loading, failed, refresh: () => setRefreshKey((key) => key + 1) };
}
