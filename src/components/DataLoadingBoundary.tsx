import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { releaseSidebarRequests } from "../lib/collectionLoader";

export type DataLoadState = {
  loading: boolean;
  error: string | null;
  loaded: number;
  total: number | null;
  retry: () => void;
};

type Registry = {
  register: (id: string, state: DataLoadState) => void;
  update: (id: string, state: DataLoadState) => void;
  unregister: (id: string) => void;
  markRouteMounted: () => void;
};

export const DataLoadingContext = createContext<Registry | null>(null);
const PageDataStatusContext = createContext({ loading: false });

export function usePageDataStatus() {
  return useContext(PageDataStatusContext);
}

export function RouteMountMarker() {
  const registry = useContext(DataLoadingContext);
  useEffect(() => registry?.markRouteMounted(), [registry]);
  return null;
}

export function useTrackPageLoading(loading: boolean, error: string | null, retry: () => void, loaded = 0, total: number | null = null) {
  const registry = useContext(DataLoadingContext);
  const id = useId();
  const retryRef = useRef(retry);
  retryRef.current = retry;
  const stableRetry = useCallback(() => retryRef.current(), []);
  useEffect(() => {
    if (!registry) return;
    registry.register(id, { loading: true, error: null, loaded: 0, total: null, retry: stableRetry });
    return () => registry.unregister(id);
  }, [registry, id, stableRetry]);
  useEffect(() => {
    registry?.update(id, { loading, error, loaded, total, retry: stableRetry });
  }, [registry, id, loading, error, loaded, total, stableRetry]);
}

export function DataLoadingBoundary({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, DataLoadState>>({});
  const [mounted, setMounted] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const register = useCallback((id: string, state: DataLoadState) => {
    setEntries((current) => ({ ...current, [id]: state }));
  }, []);
  const update = useCallback((id: string, state: DataLoadState) => {
    setEntries((current) => {
      const previous = current[id];
      if (previous && previous.loading === state.loading && previous.error === state.error &&
          previous.loaded === state.loaded && previous.total === state.total) return current;
      return { ...current, [id]: state };
    });
  }, []);
  const unregister = useCallback((id: string) => {
    setEntries((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);
  const registry = useMemo(() => ({ register, update, unregister, markRouteMounted: () => setMounted(true) }), [register, update, unregister]);

  const states = Object.values(entries);
  const loading = !mounted || states.some((state) => state.loading);
  const failed = states.filter((state) => !state.loading && state.error);
  const blocked = loading || failed.length > 0;
  const loaded = states.reduce((sum, state) => sum + state.loaded, 0);
  const knownTotal = states.reduce((sum, state) => sum + (state.total ?? state.loaded), 0);
  const allTotalsKnown = states.every((state) => state.total !== null);

  useEffect(() => {
    if (mounted && (!loading || failed.length > 0)) releaseSidebarRequests();
  }, [mounted, loading, failed.length]);

  return (
    <DataLoadingContext.Provider value={registry}>
    <PageDataStatusContext.Provider value={{ loading: blocked }}>
      <div ref={contentRef}>
        {children}
      </div>
    </PageDataStatusContext.Provider>
    </DataLoadingContext.Provider>
  );
}
